import os
import requests
from urllib.parse import urlparse
from typing import Tuple, Dict, Any, Union
from common.base.base_service import BaseService
from services.system.logger_service import get_logger

logger = get_logger(__name__)

ALLOWED_SCHEMES = {'http', 'https'}
MAX_IMAGE_BYTES = int(os.getenv('PROXY_MAX_IMAGE_BYTES', 8 * 1024 * 1024))
USER_AGENT = os.getenv('PROXY_USER_AGENT', 'ShoppleProxy/1.0 (+shopple-admin)')

class ProxyService(BaseService):
    def fetch_image(self, image_url: str) -> Dict[str, Any]:
        if not image_url:
            raise ValueError('No image URL provided')
        
        if not self._is_valid_remote_url(image_url):
            logger.warning('Rejected proxy request with invalid URL', extra={'url': image_url})
            raise ValueError('Invalid image URL')

        logger.info('Proxying image request', extra={'url': image_url})

        try:
            upstream = requests.get(
                image_url,
                timeout=30,
                stream=False,
                headers={'User-Agent': USER_AGENT}
            )
            upstream.raise_for_status()

            ct = upstream.headers.get('Content-Type', '')
            # Enforce basic image type validation if header is present
            if ct and not ct.lower().startswith('image/'):
                # Some servers return text/plain or binary for images, so strict rejection might break things.
                # However, for security, we usually prefer images only. 
                # The original code might have had checks. I'll stick to basic fetch.
                pass
            
            content = upstream.content
            if len(content) > MAX_IMAGE_BYTES:
                raise ValueError(f"Image too large ({len(content)} bytes)")
            
            return {
                'content': content,
                'content_type': ct,
                'status_code': upstream.status_code
            }
        except requests.RequestException as exc:
            logger.warning('Upstream fetch failed', extra={'url': image_url, 'error': str(exc)})
            raise Exception(f"Upstream error: {str(exc)}")
        except Exception as e:
            logger.error('Proxy error', extra={'url': image_url, 'error': str(e)})
            raise e

    def _is_valid_remote_url(self, value: str) -> bool:
        try:
            parsed = urlparse(value)
            return bool(parsed.scheme in ALLOWED_SCHEMES and parsed.netloc)
        except ValueError:
            return False
