from dataclasses import dataclass
from typing import Dict, List, Set, Optional
from datetime import datetime

@dataclass
class ProductMatch:
    """
    Represents a product match result from the matching algorithm.
    
    Attributes:
        product_id (str): Unique identifier of the matched product
        similarity_score (float): Similarity score between 0.0 and 1.0
        matched_product (Dict): Full product data of the matched product
        match_reasons (List[str]): List of reasons explaining why products matched
        is_duplicate (bool): Whether this match qualifies as a duplicate
    """
    product_id: str
    similarity_score: float
    matched_product: Dict
    match_reasons: List[str]
    is_duplicate: bool

@dataclass
class ProductCacheEntry:
    """
    Represents a cached product entry with pre-computed indexes.
    
    This data structure optimizes matching performance by storing normalized
    values and search tokens that are expensive to compute on-the-fly.
    
    Attributes:
        product_id (str): Unique identifier
        name (str): Original product name
        brand_name (str): Brand name
        category (str): Product category
        variety (str): Product variety/flavor
        size (str): Product size (normalized string format)
        normalized_name (str): Pre-computed normalized name for fast matching
        search_tokens (Set[str]): Pre-computed tokens for quick filtering
        last_updated (datetime): Timestamp of last cache update
        image_url (str): Product image URL (optional)
    """
    product_id: str
    name: str
    brand_name: str
    category: str
    variety: str
    size: str
    normalized_name: str
    search_tokens: Set[str]
    last_updated: datetime
    image_url: str = ""
