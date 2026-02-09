import json
import os
import sqlite3
import sys
import threading
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set
from datetime import datetime

# Ensure backend path is available for logger imports
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_BACKEND_PATH = _PROJECT_ROOT / 'backend'
if str(_BACKEND_PATH) not in sys.path:
    sys.path.insert(0, str(_BACKEND_PATH))

from services.system.logger_service import get_logger  # type: ignore

logger = get_logger(__name__)


class CrawlerCacheStore:
    """SQLite-backed persistence for crawler results, clears, and upload status."""

    def __init__(self, cache_dir: str):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.cache_dir / 'crawler_cache.db'
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._ensure_schema()
        self._maybe_import_legacy_files()

    # ------------------------------------------------------------------
    # Schema & migrations
    # ------------------------------------------------------------------
    def _ensure_schema(self) -> None:
        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute('PRAGMA journal_mode=WAL;')
            cursor.execute('PRAGMA foreign_keys=ON;')
            cursor.executescript(
                """
                CREATE TABLE IF NOT EXISTS metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT
                );

                CREATE TABLE IF NOT EXISTS crawler_runs (
                    crawler_id TEXT PRIMARY KEY,
                    store TEXT NOT NULL,
                    category TEXT NOT NULL,
                    items_json TEXT NOT NULL,
                    item_count INTEGER NOT NULL,
                    output_file TEXT,
                    completed_at TEXT,
                    file_size INTEGER,
                    file_modified TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_crawler_runs_store_category
                    ON crawler_runs(store, category, completed_at);

                CREATE TABLE IF NOT EXISTS cleared_results (
                    crawler_id TEXT PRIMARY KEY,
                    cleared_at TEXT DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS cleared_activities (
                    activity_id TEXT PRIMARY KEY,
                    cleared_at TEXT DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS upload_status (
                    store TEXT NOT NULL,
                    category TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    status TEXT NOT NULL,
                    last_error TEXT,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY(store, category, filename)
                );
                """
            )
            self._conn.commit()

    def _get_metadata(self, key: str) -> Optional[str]:
        with self._lock:
            cursor = self._conn.execute('SELECT value FROM metadata WHERE key = ?', (key,))
            row = cursor.fetchone()
            return row['value'] if row else None

    def _set_metadata(self, key: str, value: str) -> None:
        with self._lock:
            self._conn.execute(
                'INSERT INTO metadata(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                (key, value),
            )
            self._conn.commit()

    def _maybe_import_legacy_files(self) -> None:
        if self._get_metadata('legacy_json_import_complete') == '1':
            return

        results_file = self.cache_dir / 'crawler_results.json'
        cleared_results_file = self.cache_dir / 'cleared_results.json'
        cleared_activities_file = self.cache_dir / 'cleared_activities.json'
        upload_status_file = self.cache_dir / 'upload_status.json'

        has_any_legacy_file = any(
            path.exists()
            for path in (results_file, cleared_results_file, cleared_activities_file, upload_status_file)
        )
        if not has_any_legacy_file:
            self._set_metadata('legacy_json_import_complete', '1')
            return

        logger.info('Seeding crawler cache database from legacy JSON files')
        try:
            if results_file.exists():
                with results_file.open('r', encoding='utf-8') as fh:
                    data = json.load(fh)
                if isinstance(data, dict):
                    for crawler_id, payload in data.items():
                        payload['crawler_id'] = crawler_id
                        self.upsert_result(payload)
                else:
                    logger.warning('Unexpected crawler_results.json shape; skipping import')

            if cleared_results_file.exists():
                with cleared_results_file.open('r', encoding='utf-8') as fh:
                    cleared = json.load(fh)
                if isinstance(cleared, list):
                    self.replace_cleared_results(set(cleared))

            if cleared_activities_file.exists():
                with cleared_activities_file.open('r', encoding='utf-8') as fh:
                    cleared = json.load(fh)
                if isinstance(cleared, list):
                    self.replace_cleared_activities(set(cleared))

            if upload_status_file.exists():
                with upload_status_file.open('r', encoding='utf-8') as fh:
                    upload_map = json.load(fh)
                if isinstance(upload_map, dict):
                    rows = []
                    for key, status in upload_map.items():
                        parts = key.split('/')
                        if len(parts) >= 3:
                            store, category = parts[0], parts[1]
                            filename = '/'.join(parts[2:])
                            rows.append((store, category, filename, status, None))
                    if rows:
                        self._bulk_replace_upload_status(rows)
        finally:
            self._set_metadata('legacy_json_import_complete', '1')

    # ------------------------------------------------------------------
    # Crawler results
    # ------------------------------------------------------------------
    def load_results(self) -> Dict[str, Dict[str, object]]:
        with self._lock:
            cursor = self._conn.execute('SELECT * FROM crawler_runs')
            results: Dict[str, Dict[str, object]] = {}
            for row in cursor.fetchall():
                items = json.loads(row['items_json']) if row['items_json'] else []
                results[row['crawler_id']] = {
                    'crawler_id': row['crawler_id'],
                    'store': row['store'],
                    'category': row['category'],
                    'items': items,
                    'count': row['item_count'],
                    'output_file': row['output_file'],
                    'completed_at': row['completed_at'],
                    'file_size': row['file_size'],
                    'file_modified': row['file_modified'],
                }
            return results

    def replace_all_results(self, results: Dict[str, Dict[str, object]]) -> None:
        with self._lock:
            self._conn.execute('DELETE FROM crawler_runs')
            rows = [
                (
                    entry['crawler_id'],
                    entry.get('store'),
                    entry.get('category'),
                    json.dumps(entry.get('items', []), ensure_ascii=False),
                    int(entry.get('count', len(entry.get('items', [])))) if entry.get('items') is not None else 0,
                    entry.get('output_file'),
                    entry.get('completed_at'),
                    entry.get('file_size'),
                    entry.get('file_modified'),
                )
                for entry in results.values()
            ]
            self._conn.executemany(
                """
                INSERT INTO crawler_runs (crawler_id, store, category, items_json, item_count, output_file, completed_at, file_size, file_modified)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )
            self._conn.commit()

    def upsert_result(self, entry: Dict[str, object]) -> None:
        with self._lock:
            items = entry.get('items', []) or []
            items_json = json.dumps(items, ensure_ascii=False)
            params = (
                entry.get('crawler_id'),
                entry.get('store'),
                entry.get('category'),
                items_json,
                entry.get('count', len(items)),
                entry.get('output_file'),
                entry.get('completed_at'),
                entry.get('file_size'),
                entry.get('file_modified'),
            )
            self._conn.execute(
                """
                INSERT INTO crawler_runs (crawler_id, store, category, items_json, item_count, output_file, completed_at, file_size, file_modified)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(crawler_id) DO UPDATE SET
                    store=excluded.store,
                    category=excluded.category,
                    items_json=excluded.items_json,
                    item_count=excluded.item_count,
                    output_file=excluded.output_file,
                    completed_at=excluded.completed_at,
                    file_size=excluded.file_size,
                    file_modified=excluded.file_modified,
                    created_at=CURRENT_TIMESTAMP
                """,
                params,
            )
            self._conn.commit()

    def delete_results(self, result_ids: Iterable[str]) -> None:
        with self._lock:
            self._conn.executemany('DELETE FROM crawler_runs WHERE crawler_id = ?', ((rid,) for rid in result_ids))
            self._conn.commit()

    def delete_all_results(self) -> None:
        with self._lock:
            self._conn.execute('DELETE FROM crawler_runs')
            self._conn.commit()

    # ------------------------------------------------------------------
    # Cleared results & activities
    # ------------------------------------------------------------------
    def load_cleared_results(self) -> Set[str]:
        with self._lock:
            cursor = self._conn.execute('SELECT crawler_id FROM cleared_results')
            return {row['crawler_id'] for row in cursor.fetchall()}

    def replace_cleared_results(self, cleared: Set[str]) -> None:
        with self._lock:
            self._conn.execute('DELETE FROM cleared_results')
            if cleared:
                self._conn.executemany(
                    'INSERT INTO cleared_results (crawler_id, cleared_at) VALUES (?, ?)',
                    ((crawler_id, datetime.utcnow().isoformat() + 'Z') for crawler_id in cleared),
                )
            self._conn.commit()

    def load_cleared_activities(self) -> Set[str]:
        with self._lock:
            cursor = self._conn.execute('SELECT activity_id FROM cleared_activities')
            return {row['activity_id'] for row in cursor.fetchall()}

    def replace_cleared_activities(self, cleared: Set[str]) -> None:
        with self._lock:
            self._conn.execute('DELETE FROM cleared_activities')
            if cleared:
                self._conn.executemany(
                    'INSERT INTO cleared_activities (activity_id, cleared_at) VALUES (?, ?)',
                    ((activity_id, datetime.utcnow().isoformat() + 'Z') for activity_id in cleared),
                )
            self._conn.commit()

    # ------------------------------------------------------------------
    # Upload status helpers
    # ------------------------------------------------------------------
    def load_upload_status_map(self) -> Dict[str, str]:
        with self._lock:
            cursor = self._conn.execute('SELECT store, category, filename, status FROM upload_status')
            payload = {}
            for row in cursor.fetchall():
                key = f"{row['store']}/{row['category']}/{row['filename']}"
                payload[key] = row['status']
            return payload

    def _bulk_replace_upload_status(self, rows: List[tuple]) -> None:
        with self._lock:
            self._conn.executemany(
                """
                INSERT INTO upload_status (store, category, filename, status, last_error) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(store, category, filename) DO UPDATE SET
                    status=excluded.status,
                    last_error=excluded.last_error,
                    updated_at=CURRENT_TIMESTAMP
                """,
                rows,
            )
            self._conn.commit()

    def replace_upload_status_map(self, data: Dict[str, str]) -> None:
        rows = []
        for key, status in data.items():
            parts = key.split('/')
            if len(parts) >= 3:
                store, category = parts[0], parts[1]
                filename = '/'.join(parts[2:])
                rows.append((store, category, filename, status, None))
        if rows:
            self._bulk_replace_upload_status(rows)

    def set_upload_status(self, store: str, category: str, filename: str, status: str, last_error: Optional[str] = None) -> None:
        self._bulk_replace_upload_status([(store, category, filename, status, last_error)])

    def clear_upload_status(self, store: str, category: str, filename: str) -> None:
        with self._lock:
            self._conn.execute(
                'DELETE FROM upload_status WHERE store=? AND category=? AND filename=?',
                (store, category, filename),
            )
            self._conn.commit()

    def get_upload_status(self, store: str, category: str, filename: str) -> str:
        with self._lock:
            cursor = self._conn.execute(
                'SELECT status FROM upload_status WHERE store=? AND category=? AND filename=?',
                (store, category, filename),
            )
            row = cursor.fetchone()
            return row['status'] if row else 'local'

    def clear_all_upload_status(self) -> None:
        with self._lock:
            self._conn.execute('DELETE FROM upload_status')
            self._conn.commit()
