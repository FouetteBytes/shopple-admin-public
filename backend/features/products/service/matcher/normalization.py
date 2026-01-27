import re
import unicodedata
from typing import Set
from services.system.logger_service import get_logger

logger = get_logger(__name__)

def normalize_product_name(name: str, brand: str = None, remove_packaging: bool = False) -> str:
    """
    Normalize product name for intelligent matching.
    
    This function applies various normalization techniques:
    - Remove brand name from product name if present
    - normalize spacing and punctuation
    - Convert to lowercase
    - Remove common words (the, and, etc.)
    - Standardize size formats
    """
    if not name:
        return ""
    
    # Convert to lowercase
    normalized = name.lower()
    original_normalized = normalized  # Keep original for fallback
    
    # Remove brand name from product name if present
    if brand:
        brand_lower = brand.lower()
        # Remove brand name from beginning or end
        if normalized.startswith(brand_lower):
            normalized = normalized[len(brand_lower):].strip()
        elif normalized.endswith(brand_lower):
            normalized = normalized[:-len(brand_lower)].strip()
        
        # If removing brand left nothing or very little, use original
        # This handles cases like "Coca Cola" (brand: "Coca Cola")
        if len(normalized) <= 3:
            normalized = original_normalized
    
    # Remove common separators and normalize spacing
    normalized = re.sub(r'[_\-\(\)\[\]{}]', ' ', normalized)
    normalized = re.sub(r'\s+', ' ', normalized)
    
    # Remove accents and special characters
    normalized = unicodedata.normalize('NFD', normalized)
    normalized = ''.join(c for c in normalized if unicodedata.category(c) != 'Mn')
    
    # Remove common stop words
    stop_words = {'the', 'and', 'or', 'with', 'in', 'of', 'for', 'to', 'a', 'an'}
    words = normalized.split()
    words = [word for word in words if word not in stop_words]

    # Optionally remove packaging tokens to group sibling variants under the same normalized key
    if remove_packaging:
        packaging_terms = {
            'pkt', 'pack', 'packet', 'box', 'sachet', 'carton', 'bottle', 'pet', 'petbottle', 'jar',
            'can', 'tin', 'bag', 'pouch', 'tube', 'tetra', 'tetrapack', 'tetrapak', 'refill',
            'sackets', 'sachets', 'packets', 'packs', 'bottles', 'jars', 'cans', 'tins', 'bags', 'pouches'
        }
        words = [w for w in words if w not in packaging_terms]
    normalized = ' '.join(words)
    
    # Normalize size formats - Enhanced for better matching
    normalized = re.sub(r'(\d+)\s*(g|kg|ml|l|oz|lb|pc|pcs|piece|pieces)', r'\1\2', normalized)
    normalized = re.sub(r'(\d+)\s*x\s*(\d+)', r'\1x\2', normalized)
    
    # Standardize common size abbreviations
    normalized = re.sub(r'\bpiece\b', 'pc', normalized)
    normalized = re.sub(r'\bpieces\b', 'pcs', normalized)
    normalized = re.sub(r'\bkilogram\b', 'kg', normalized)
    normalized = re.sub(r'\bkilograms\b', 'kg', normalized)
    normalized = re.sub(r'\bmilliliter\b', 'ml', normalized)
    normalized = re.sub(r'\bmilliliters\b', 'ml', normalized)
    normalized = re.sub(r'\bliter\b', 'l', normalized)
    normalized = re.sub(r'\bliters\b', 'l', normalized)
    
    return normalized.strip()

def generate_search_tokens(name: str, brand: str = None, variety: str = None) -> Set[str]:
    """
    Generate search tokens for fast matching.
    
    This creates a set of tokens that can be used for quick filtering
    before applying expensive fuzzy matching.
    """
    tokens = set()
    
    # Add normalized name tokens
    normalized_name = normalize_product_name(name, brand, remove_packaging=False)
    tokens.update(normalized_name.split())
    
    # Add brand tokens
    if brand:
        brand_normalized = normalize_product_name(brand, remove_packaging=False)
        tokens.update(brand_normalized.split())
    
    # Add variety tokens
    if variety:
        variety_normalized = normalize_product_name(variety, remove_packaging=False)
        tokens.update(variety_normalized.split())
    
    # Add original name tokens
    original_tokens = re.findall(r'\b\w+\b', name.lower())
    tokens.update(original_tokens)
    
    # Remove very short tokens
    tokens = {token for token in tokens if len(token) >= 2}
    
    return tokens
