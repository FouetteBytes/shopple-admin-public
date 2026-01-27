#!/bin/bash
set -euo pipefail

# -----------------------------------------------------------------------------
# Shopple Admin - OpenSearch Dashboards Bootstrap
#
# Purpose:
#   Creates or updates OpenSearch Dashboards saved objects (index pattern,
#   searches, visualizations, dashboards). Safe to re-run.
#
# Usage:
#   DASHBOARDS_URL=http://localhost:5601 bash k8s/scripts/setup_opensearch_dashboards.sh
#
# Integration:
#   k8s/scripts/start.sh calls this script automatically when the Dashboards
#   index pattern does not exist.
# -----------------------------------------------------------------------------

DASHBOARDS_URL="${DASHBOARDS_URL:-}"
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
NDJSON_PATH="$(mktemp -t shopple-logs-objects.XXXXXX.ndjson)"

if [ -z "$DASHBOARDS_URL" ]; then
    echo "DASHBOARDS_URL is not set. Example:"
    echo "  DASHBOARDS_URL=https://dashboards.example.com bash k8s/scripts/setup_opensearch_dashboards.sh"
    exit 1
fi

python - <<'PY'
import json
from pathlib import Path

out = []
index_id = "shopple-logs"

out.append({
    "type": "index-pattern",
    "id": index_id,
    "attributes": {
        "title": "shopple-logs",
        "timeFieldName": "@timestamp"
    }
})

searches = [
    ("search-audit-logs", "Audit Logs", "audit_action:* OR message:AUDIT_EVENT", ["@timestamp","audit_action","audit_resource","audit_user_email","audit_success","audit_risk_level","message"]),
    ("search-app-logs", "App Logs", "component:backend AND NOT audit_action:*", ["@timestamp","level","logger","message","request_path","request_status"]),
    ("search-error-logs", "Error Logs", "level:(ERROR OR WARNING)", ["@timestamp","level","logger","message","error","exception"]),
    ("search-audit-ui", "Audit UI Events", "audit_action:(PAGE_VIEW OR UI_INTERACTION)", ["@timestamp","audit_action","audit_resource","audit_user_email","audit_notes","message"]),
    ("search-audit-admin", "Audit Admin Actions", "audit_action:(USER_CREATE OR USER_DELETE OR USER_UPDATE OR ROLE_CHANGE OR ADMIN_ACCESS OR CONFIGURATION_CHANGE OR API_CALL)", ["@timestamp","audit_action","audit_resource","audit_user_email","audit_notes","message"]),
    ("search-audit-security", "Audit Security Events", "audit_action:(SUSPICIOUS_ACTIVITY OR LOGIN_FAILURE OR FAILED_AUTHORIZATION) OR audit_success:false OR audit_risk_level:(high OR critical)", ["@timestamp","audit_action","audit_resource","audit_user_email","audit_success","audit_risk_level","message"]),
    ("search-ai-logs", "AI Service Logs", "logger:backend.features.ai* OR logger:backend.services.ai_handlers* OR logger:backend.services.classification*", ["@timestamp","level","logger","message"]),
    ("search-crawler-logs", "Crawler Logs", "logger:crawler_manager OR logger:file_watcher OR logger:clean_file_manager OR logger:backend.features.crawler*", ["@timestamp","level","logger","message"]),
    ("search-products-logs", "Products Logs", "logger:backend.features.products* OR request_service:products", ["@timestamp","level","logger","message","request_path"]),
    ("search-prices-logs", "Prices Logs", "logger:backend.features.prices* OR request_service:prices", ["@timestamp","level","logger","message","request_path"]),
    ("search-users-logs", "Users Logs", "logger:backend.features.users* OR request_service:users", ["@timestamp","level","logger","message","request_path"]),
    ("search-system-logs", "System Logs", "logger:services.system* OR logger:backend.services.system* OR logger:backend.features.system*", ["@timestamp","level","logger","message"]),
    ("search-frontend-logs", "Frontend Logs", "component:frontend", ["@timestamp","level","log","message"]),
    ("search-login-logs", "Login Activity", "log:*Login* OR log:*Firebase*", ["@timestamp","level","log","message"]),
    ("search-request-logs", "API Requests", "request_path:* AND request_status:*", ["@timestamp","request_method","request_path","request_status","request_duration_ms","user_email"]),
]

for sid, title, query, columns in searches:
    out.append({
        "type": "search",
        "id": sid,
        "attributes": {
            "title": title,
            "description": title,
            "columns": columns,
            "sort": [["@timestamp", "desc"]],
            "kibanaSavedObjectMeta": {
                "searchSourceJSON": json.dumps({
                    "index": index_id,
                    "query": {"language": "kuery", "query": query},
                    "filter": []
                })
            }
        }
    })


def visualization(vid, title, vis_type, aggs, query=""):
    return {
        "type": "visualization",
        "id": vid,
        "attributes": {
            "title": title,
            "description": "",
            "visState": json.dumps({
                "title": title,
                "type": vis_type,
                "params": {
                    "type": "line" if vis_type == "histogram" else vis_type,
                    "addTooltip": True,
                    "addLegend": True,
                    "legendPosition": "right",
                    "isDonut": False
                },
                "aggs": aggs
            }),
            "uiStateJSON": "{}",
            "kibanaSavedObjectMeta": {
                "searchSourceJSON": json.dumps({
                    "index": index_id,
                    "query": {"language": "kuery", "query": query},
                    "filter": []
                })
            }
        }
    }


def dashboard(title, did, panel_defs):
    panels = []
    x = 0
    y = 0
    panel_index = 1
    for panel_type, pid, w, h in panel_defs:
        panels.append({
            "version": "3.4.0",
            "panelIndex": str(panel_index),
            "type": panel_type,
            "id": pid,
            "embeddableConfig": {},
            "gridData": {"x": x, "y": y, "w": w, "h": h, "i": str(panel_index)}
        })
        x += w
        if x >= 24:
            x = 0
            y += h
        panel_index += 1

    return {
        "type": "dashboard",
        "id": did,
        "attributes": {
            "title": title,
            "panelsJSON": json.dumps(panels),
            "optionsJSON": json.dumps({"useMargins": True, "hidePanelTitles": False}),
            "timeRestore": False
        }
    }


visualizations = []
visualizations.append(visualization(
    "viz-logs-over-time",
    "Logs Over Time",
    "histogram",
    [
        {"id": "1", "enabled": True, "type": "count", "schema": "metric"},
        {
            "id": "2",
            "enabled": True,
            "type": "date_histogram",
            "schema": "segment",
            "params": {"field": "@timestamp", "interval": "auto", "min_doc_count": 1}
        }
    ]
))

visualizations.append(visualization(
    "viz-logs-by-level",
    "Logs by Level",
    "pie",
    [
        {"id": "1", "enabled": True, "type": "count", "schema": "metric"},
        {
            "id": "2",
            "enabled": True,
            "type": "terms",
            "schema": "segment",
            "params": {"field": "level.keyword", "size": 10, "order": "desc", "orderBy": "1"}
        }
    ]
))

visualizations.append(visualization(
    "viz-errors-over-time",
    "Errors Over Time",
    "histogram",
    [
        {"id": "1", "enabled": True, "type": "count", "schema": "metric"},
        {
            "id": "2",
            "enabled": True,
            "type": "date_histogram",
            "schema": "segment",
            "params": {"field": "@timestamp", "interval": "auto", "min_doc_count": 1}
        }
    ],
    query="level:(ERROR or CRITICAL or FATAL)"
))

visualizations.append(visualization(
    "viz-audit-actions",
    "Audit Actions",
    "pie",
    [
        {"id": "1", "enabled": True, "type": "count", "schema": "metric"},
        {
            "id": "2",
            "enabled": True,
            "type": "terms",
            "schema": "segment",
            "params": {"field": "audit_action.keyword", "size": 20, "order": "desc", "orderBy": "1"}
        }
    ],
    query="audit_action:*"
))

visualizations.append(visualization(
    "viz-audit-risk",
    "Audit Risk Levels",
    "pie",
    [
        {"id": "1", "enabled": True, "type": "count", "schema": "metric"},
        {
            "id": "2",
            "enabled": True,
            "type": "terms",
            "schema": "segment",
            "params": {"field": "audit_risk_level.keyword", "size": 10, "order": "desc", "orderBy": "1"}
        }
    ],
    query="audit_risk_level:*"
))

visualizations.append(visualization(
    "viz-top-loggers",
    "Top Loggers",
    "histogram",
    [
        {"id": "1", "enabled": True, "type": "count", "schema": "metric"},
        {
            "id": "2",
            "enabled": True,
            "type": "terms",
            "schema": "segment",
            "params": {"field": "logger.keyword", "size": 15, "order": "desc", "orderBy": "1"}
        }
    ]
))

visualizations.append(visualization(
    "viz-errors-by-logger",
    "Errors by Logger",
    "histogram",
    [
        {"id": "1", "enabled": True, "type": "count", "schema": "metric"},
        {
            "id": "2",
            "enabled": True,
            "type": "terms",
            "schema": "segment",
            "params": {"field": "logger.keyword", "size": 15, "order": "desc", "orderBy": "1"}
        }
    ],
    query="level:(ERROR or CRITICAL or FATAL)"
))

visualizations.append(visualization(
    "viz-ai-levels",
    "AI Logs by Level",
    "pie",
    [
        {"id": "1", "enabled": True, "type": "count", "schema": "metric"},
        {
            "id": "2",
            "enabled": True,
            "type": "terms",
            "schema": "segment",
            "params": {"field": "level.keyword", "size": 10, "order": "desc", "orderBy": "1"}
        }
    ],
    query="logger:backend.features.ai* or logger:backend.services.classification*"
))

visualizations.append(visualization(
    "viz-crawler-levels",
    "Crawler Logs by Level",
    "pie",
    [
        {"id": "1", "enabled": True, "type": "count", "schema": "metric"},
        {
            "id": "2",
            "enabled": True,
            "type": "terms",
            "schema": "segment",
            "params": {"field": "level.keyword", "size": 10, "order": "desc", "orderBy": "1"}
        }
    ],
    query="logger:crawler_manager OR logger:file_watcher OR logger:clean_file_manager"
))

visualizations.append(visualization(
    "viz-products-levels",
    "Products Logs by Level",
    "pie",
    [
        {"id": "1", "enabled": True, "type": "count", "schema": "metric"},
        {
            "id": "2",
            "enabled": True,
            "type": "terms",
            "schema": "segment",
            "params": {"field": "level.keyword", "size": 10, "order": "desc", "orderBy": "1"}
        }
    ],
    query="logger:backend.features.products* OR request_service:products"
))

visualizations.append(visualization(
    "viz-prices-levels",
    "Prices Logs by Level",
    "pie",
    [
        {"id": "1", "enabled": True, "type": "count", "schema": "metric"},
        {
            "id": "2",
            "enabled": True,
            "type": "terms",
            "schema": "segment",
            "params": {"field": "level.keyword", "size": 10, "order": "desc", "orderBy": "1"}
        }
    ],
    query="logger:backend.features.prices* OR request_service:prices"
))

visualizations.append(visualization(
    "viz-users-levels",
    "Users Logs by Level",
    "pie",
    [
        {"id": "1", "enabled": True, "type": "count", "schema": "metric"},
        {
            "id": "2",
            "enabled": True,
            "type": "terms",
            "schema": "segment",
            "params": {"field": "level.keyword", "size": 10, "order": "desc", "orderBy": "1"}
        }
    ],
    query="logger:backend.features.users* or logger:backend.services.users*"
))

visualizations.append(visualization(
    "viz-system-levels",
    "System Logs by Level",
    "pie",
    [
        {"id": "1", "enabled": True, "type": "count", "schema": "metric"},
        {
            "id": "2",
            "enabled": True,
            "type": "terms",
            "schema": "segment",
            "params": {"field": "level.keyword", "size": 10, "order": "desc", "orderBy": "1"}
        }
    ],
    query="logger:backend.features.system* or logger:backend.services.system*"
))

out.extend(visualizations)


out.append(dashboard(
    "Shopple Logs - Overview",
    "dashboard-logs-overview",
    [
        ("visualization", "viz-logs-over-time", 12, 10),
        ("visualization", "viz-logs-by-level", 12, 10),
        ("visualization", "viz-errors-over-time", 12, 10),
        ("search", "search-error-logs", 12, 10),
        ("search", "search-app-logs", 12, 10)
    ]
))

out.append(dashboard(
    "Shopple Logs - Audits",
    "dashboard-logs-audits",
    [
        ("visualization", "viz-audit-actions", 12, 10),
        ("visualization", "viz-audit-risk", 12, 10),
        ("search", "search-audit-logs", 12, 10),
        ("search", "search-audit-ui", 12, 10),
        ("search", "search-audit-admin", 12, 10),
        ("search", "search-audit-security", 12, 10)
    ]
))

out.append(dashboard(
    "Shopple Logs - Services",
    "dashboard-logs-services",
    [
        ("visualization", "viz-top-loggers", 12, 10),
        ("visualization", "viz-errors-by-logger", 12, 10),
        ("visualization", "viz-ai-levels", 8, 10),
        ("visualization", "viz-crawler-levels", 8, 10),
        ("visualization", "viz-products-levels", 8, 10),
        ("visualization", "viz-prices-levels", 8, 10),
        ("visualization", "viz-users-levels", 8, 10),
        ("visualization", "viz-system-levels", 8, 10),
        ("search", "search-ai-logs", 12, 10),
        ("search", "search-crawler-logs", 12, 10),
        ("search", "search-products-logs", 12, 10),
        ("search", "search-prices-logs", 12, 10),
        ("search", "search-users-logs", 12, 10),
        ("search", "search-system-logs", 12, 10)
    ]
))

path = Path("/tmp/shopple-logs-objects.ndjson")
path.write_text("\n".join(json.dumps(item) for item in out) + "\n", encoding="utf-8")
print(path)
PY

# Use the path printed by Python (it writes to /tmp/shopple-logs-objects.ndjson)
NDJSON_PATH="/tmp/shopple-logs-objects.ndjson"

curl -s -X POST "${DASHBOARDS_URL}/api/saved_objects/_import?overwrite=true" \
    -H "osd-xsrf: true" \
  -F file=@"${NDJSON_PATH}"