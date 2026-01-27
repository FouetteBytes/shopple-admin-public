from typing import Optional
import os
import io
import hashlib
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from common.base.base_service import BaseService
from services.system.logger_service import get_logger

logger = get_logger(__name__)

# Fallback path logic
# Modified to be workspace-relative since we don't have backend/routes anymore.
# We want to access backend/static/memoji

# parents[1] = routes
# parents[2] = backend
# So original should have been parents[2] / 'static' / 'memoji'?
# The original code said `parents[1]`. Maybe `backend/routes/static` existed?
# Or maybe I am miscounting.
# Let's assume `backend/static/memoji`.

# From `backend/features/users/service/avatar_service.py`:
# parents[0] = service
# parents[1] = features/users
# parents[2] = features
# parents[3] = backend
# So we need parents[3].

class AvatarService(BaseService):
    def __init__(self):
        # Determine root dynamically relative to this file
        # This file: backend/features/users/service/avatar_service.py
        self.default_root = Path(__file__).resolve().parents[3] / "static" / "memoji"
    
    def _get_memoji_root(self) -> Path:
        root = os.getenv("MEMOJI_ASSETS_ROOT")
        if root:
            return Path(root).expanduser().resolve()
        return self.default_root.resolve()

    def _is_within(self, root: Path, target: Path) -> bool:
        try:
            target.relative_to(root)
            return True
        except ValueError:
            return False

    def get_memoji_path(self, memoji_id: str) -> Optional[Path]:
        if memoji_id.startswith('assets/memoji/'):
            memoji_id = memoji_id.replace('assets/memoji/', '')
            
        safe_name = Path(memoji_id).name
        if not safe_name: return None
        if "." not in safe_name: safe_name = f"{safe_name}.png"
        
        root = self._get_memoji_root()
        file_path = (root / safe_name).resolve()
        
        if file_path.is_file() and self._is_within(root, file_path):
            return file_path
        return None

    def generate_placeholder(self, memoji_id: str) -> io.BytesIO:
        # Sanitize name
        if memoji_id.startswith('assets/memoji/'):
            memoji_id = memoji_id.replace('assets/memoji/', '')
        
        image_name = Path(memoji_id).name or "avatar"
        base = Path(image_name).stem or "avatar"
        seed = base.encode("utf-8")
        digest = hashlib.sha1(seed).hexdigest()

        primary = f"#{digest[:6]}"
        secondary = f"#{digest[6:12]}"

        size = 512
        image = Image.new("RGBA", (size, size), primary)
        draw = ImageDraw.Draw(image)

        for i in range(0, size, 20):
            alpha = int(80 + (i / size) * 60)
            draw.line([(i, 0), (0, i)], fill=secondary + f"{alpha:02x}")

        letter = base[0].upper() if base else "?"
        
        # Font loading logic
        try:
             # Try a few common paths if not bundled
            font = ImageFont.truetype("DejaVuSans-Bold.ttf", 260)
        except OSError:
            try:
                font = ImageFont.load_default()
            except Exception:
                pass # Should not happen

        # Calculate text size (draw.textsize is deprecated in newer Pillow, using textbbox if available or fallback)
        try:
            if hasattr(draw, 'textbbox'):
                 left, top, right, bottom = draw.textbbox((0, 0), letter, font=font)
                 text_width = right - left
                 text_height = bottom - top
            else:
                 text_width, text_height = draw.textsize(letter, font=font)
        except:
             text_width, text_height = 100, 100 # Fallback
             
        position = ((size - text_width) / 2, (size - text_height) / 2) # Centering might be slightly off with textbbox but acceptable

        draw.text(position, letter, fill="white", font=font)

        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        buffer.seek(0)
        return buffer
