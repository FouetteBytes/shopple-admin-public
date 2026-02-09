"""
OpenSearch Product Search Service.
High-performance fuzzy search for 10,000+ products using OpenSearch.
"""
from typing import Dict, Any, List, Optional
import os
from datetime import datetime, timezone
from opensearchpy import OpenSearch, helpers
from services.system.logger_service import get_logger

logger = get_logger(__name__)

# Index settings for product search
PRODUCT_INDEX_NAME = 'shopple-products'
PRODUCT_INDEX_SETTINGS = {
    "settings": {
        "number_of_shards": 1,
        "number_of_replicas": 0,
        "analysis": {
            "analyzer": {
                "product_analyzer": {
                    "type": "custom",
                    "tokenizer": "standard",
                    "filter": ["lowercase", "asciifolding", "product_ngram"]
                },
                "product_search_analyzer": {
                    "type": "custom",
                    "tokenizer": "standard",
                    "filter": ["lowercase", "asciifolding"]
                }
            },
            "filter": {
                "product_ngram": {
                    "type": "edge_ngram",
                    "min_gram": 2,
                    "max_gram": 15
                }
            }
        }
    },
    "mappings": {
        "properties": {
            "id": {"type": "keyword"},
            "name": {
                "type": "text",
                "analyzer": "product_analyzer",
                "search_analyzer": "product_search_analyzer",
                "fields": {
                    "keyword": {"type": "keyword"},
                    "suggest": {
                        "type": "completion",
                        "analyzer": "product_analyzer"
                    }
                }
            },
            "original_name": {
                "type": "text",
                "analyzer": "product_analyzer",
                "search_analyzer": "product_search_analyzer"
            },
            "brand_name": {
                "type": "text",
                "analyzer": "product_analyzer",
                "search_analyzer": "product_search_analyzer",
                "fields": {
                    "keyword": {"type": "keyword"}
                }
            },
            "category": {
                "type": "keyword",
                "fields": {
                    "text": {"type": "text", "analyzer": "product_analyzer"}
                }
            },
            "variety": {
                "type": "text",
                "analyzer": "product_analyzer",
                "search_analyzer": "product_search_analyzer"
            },
            "size": {"type": "float"},
            "sizeRaw": {"type": "keyword"},
            "sizeUnit": {"type": "keyword"},
            "image_url": {"type": "keyword"},
            "created_at": {"type": "date"},
            "updated_at": {"type": "date"},
            "search_text": {
                "type": "text",
                "analyzer": "product_analyzer",
                "search_analyzer": "product_search_analyzer"
            }
        }
    }
}


class OpenSearchProductService:
    """High-performance product search using OpenSearch."""
    
    def __init__(self):
        self.host = os.getenv('OPENSEARCH_HOST', 'opensearch')
        
        # Handle Kubernetes environment variable collision
        port_env = os.getenv('OPENSEARCH_PORT', '9200')
        try:
            if port_env.startswith('tcp://'):
                self.port = int(port_env.split(':')[-1])
            else:
                self.port = int(port_env)
        except (ValueError, TypeError):
            self.port = 9200
            
        self.username = os.getenv('OPENSEARCH_USERNAME', 'admin')
        self.password = os.getenv('OPENSEARCH_PASSWORD', 'admin')
        self.index_name = PRODUCT_INDEX_NAME
        
        self.client = OpenSearch(
            hosts=[{'host': self.host, 'port': self.port}],
            http_auth=(self.username, self.password) if self.username else None,
            use_ssl=False,
            verify_certs=False,
            ssl_show_warn=False,
            timeout=30
        )
        
        self._ensure_index_exists()
    
    def is_available(self) -> bool:
        """Check if OpenSearch is available."""
        try:
            return self.client.ping()
        except Exception:
            return False
    
    def _ensure_index_exists(self):
        """Create the product index if it doesn't exist."""
        try:
            if not self.client.indices.exists(index=self.index_name):
                self.client.indices.create(
                    index=self.index_name,
                    body=PRODUCT_INDEX_SETTINGS
                )
                logger.info(f"Created OpenSearch product index: {self.index_name}")
        except Exception as e:
            logger.warning(f"Failed to create product index: {e}")
    
    def _build_search_text(self, product: Dict[str, Any]) -> str:
        """Build a combined search text field for better matching."""
        parts = []
        if product.get('name'):
            parts.append(product['name'])
        if product.get('original_name'):
            parts.append(product['original_name'])
        if product.get('brand_name'):
            parts.append(product['brand_name'])
        if product.get('variety'):
            parts.append(product['variety'])
        if product.get('category'):
            parts.append(product['category'])
        return ' '.join(parts)
    
    def index_product(self, product: Dict[str, Any]) -> bool:
        """Index a single product."""
        try:
            doc = {
                'id': product.get('id'),
                'name': product.get('name', ''),
                'original_name': product.get('original_name', ''),
                'brand_name': product.get('brand_name', ''),
                'category': product.get('category', ''),
                'variety': product.get('variety', ''),
                'size': product.get('size'),
                'sizeRaw': product.get('sizeRaw', ''),
                'sizeUnit': product.get('sizeUnit', ''),
                'image_url': product.get('image_url', ''),
                'created_at': product.get('created_at'),
                'updated_at': product.get('updated_at') or datetime.now(timezone.utc).isoformat(),
                'search_text': self._build_search_text(product)
            }
            
            self.client.index(
                index=self.index_name,
                id=product.get('id'),
                body=doc,
                refresh=False  # Don't wait for refresh for bulk operations
            )
            return True
        except Exception as e:
            logger.error(f"Failed to index product {product.get('id')}: {e}")
            return False
    
    def bulk_index_products(self, products: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Bulk index multiple products efficiently."""
        if not products:
            return {"success": True, "indexed": 0, "errors": 0}
        
        actions = []
        for product in products:
            doc = {
                'id': product.get('id'),
                'name': product.get('name', ''),
                'original_name': product.get('original_name', ''),
                'brand_name': product.get('brand_name', ''),
                'category': product.get('category', ''),
                'variety': product.get('variety', ''),
                'size': product.get('size'),
                'sizeRaw': product.get('sizeRaw', ''),
                'sizeUnit': product.get('sizeUnit', ''),
                'image_url': product.get('image_url', ''),
                'created_at': product.get('created_at'),
                'updated_at': product.get('updated_at') or datetime.now(timezone.utc).isoformat(),
                'search_text': self._build_search_text(product)
            }
            
            actions.append({
                '_index': self.index_name,
                '_id': product.get('id'),
                '_source': doc
            })
        
        try:
            success, errors = helpers.bulk(
                self.client,
                actions,
                raise_on_error=False,
                refresh=True
            )
            return {"success": True, "indexed": success, "errors": len(errors) if errors else 0}
        except Exception as e:
            logger.error(f"Bulk indexing failed: {e}")
            return {"success": False, "error": str(e)}
    
    def search_products(
        self,
        query: str,
        *,
        brand: Optional[str] = None,
        category: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        High-speed fuzzy search for products.
        Supports 10,000+ products with sub-second response times.
        """
        query = (query or '').strip()
        if not query:
            return {"products": [], "total": 0}
        
        # Build the search query
        must_clauses = []
        should_clauses = []
        
        # Main search query with fuzzy matching
        should_clauses.extend([
            # Exact phrase match (highest boost)
            {
                "match_phrase": {
                    "name": {
                        "query": query,
                        "boost": 10
                    }
                }
            },
            # Fuzzy match on name
            {
                "match": {
                    "name": {
                        "query": query,
                        "fuzziness": "AUTO",
                        "boost": 5
                    }
                }
            },
            # Fuzzy match on search_text (combines all fields)
            {
                "match": {
                    "search_text": {
                        "query": query,
                        "fuzziness": "AUTO",
                        "boost": 3
                    }
                }
            },
            # Wildcard for partial matches
            {
                "wildcard": {
                    "name.keyword": {
                        "value": f"*{query.lower()}*",
                        "boost": 2,
                        "case_insensitive": True
                    }
                }
            },
            # Match on brand
            {
                "match": {
                    "brand_name": {
                        "query": query,
                        "fuzziness": "AUTO",
                        "boost": 2
                    }
                }
            },
            # Match on original name
            {
                "match": {
                    "original_name": {
                        "query": query,
                        "fuzziness": "AUTO",
                        "boost": 2
                    }
                }
            }
        ])
        
        # Add filters
        filter_clauses = []
        if brand:
            filter_clauses.append({
                "term": {"brand_name.keyword": brand}
            })
        if category:
            filter_clauses.append({
                "term": {"category": category}
            })
        
        # Build final query
        search_body = {
            "from": offset,
            "size": limit,
            "query": {
                "bool": {
                    "should": should_clauses,
                    "minimum_should_match": 1,
                    "filter": filter_clauses if filter_clauses else None
                }
            },
            "_source": True,
            "highlight": {
                "fields": {
                    "name": {},
                    "brand_name": {},
                    "original_name": {}
                },
                "pre_tags": ["<mark>"],
                "post_tags": ["</mark>"]
            }
        }
        
        # Remove None filter
        if not filter_clauses:
            del search_body["query"]["bool"]["filter"]
        
        try:
            response = self.client.search(
                index=self.index_name,
                body=search_body
            )
            
            hits = response['hits']['hits']
            total = response['hits']['total']['value']
            
            products = []
            for hit in hits:
                product = hit['_source']
                product['_score'] = hit['_score']
                product['_highlight'] = hit.get('highlight', {})
                products.append(product)
            
            return {
                "products": products,
                "total": total,
                "max_score": response['hits'].get('max_score', 0)
            }
            
        except Exception as e:
            logger.error(f"OpenSearch product search failed: {e}")
            return {"products": [], "total": 0, "error": str(e)}
    
    def delete_product(self, product_id: str) -> bool:
        """Delete a product from the index."""
        try:
            self.client.delete(
                index=self.index_name,
                id=product_id,
                refresh=True
            )
            return True
        except Exception as e:
            logger.warning(f"Failed to delete product {product_id}: {e}")
            return False
    
    def get_index_stats(self) -> Dict[str, Any]:
        """Get product index statistics."""
        try:
            stats = self.client.indices.stats(index=self.index_name)
            idx_stats = stats['indices'][self.index_name]['total']
            
            return {
                "success": True,
                "doc_count": idx_stats['docs']['count'],
                "deleted_docs": idx_stats['docs']['deleted'],
                "store_size_bytes": idx_stats['store']['size_in_bytes'],
                "store_size_mb": round(idx_stats['store']['size_in_bytes'] / (1024 * 1024), 2)
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def reindex_all_products(self, products: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Delete and recreate the index with all products."""
        try:
            # Delete existing index
            if self.client.indices.exists(index=self.index_name):
                self.client.indices.delete(index=self.index_name)
            
            # Recreate index
            self.client.indices.create(
                index=self.index_name,
                body=PRODUCT_INDEX_SETTINGS
            )
            
            # Bulk index all products
            result = self.bulk_index_products(products)
            logger.info(f"Reindexed {result.get('indexed', 0)} products")
            return result
            
        except Exception as e:
            logger.error(f"Reindex failed: {e}")
            return {"success": False, "error": str(e)}


# Singleton instance
_opensearch_product_service: Optional[OpenSearchProductService] = None


def get_opensearch_product_service() -> OpenSearchProductService:
    """Get or create the OpenSearch product service singleton."""
    global _opensearch_product_service
    if _opensearch_product_service is None:
        _opensearch_product_service = OpenSearchProductService()
    return _opensearch_product_service
