from typing import Dict, Tuple, List
from .normalization import normalize_product_name, generate_search_tokens

from backend.services.system.logger_service import get_logger

logger = get_logger(__name__)

# Optional fuzzy matching libraries
try:
    from fuzzywuzzy import fuzz
    FUZZYWUZZY_AVAILABLE = True
except ImportError:
    FUZZYWUZZY_AVAILABLE = False
    logger.warning("fuzzywuzzy not available")

try:
    from difflib import SequenceMatcher
    DIFFLIB_AVAILABLE = True
except ImportError:
    DIFFLIB_AVAILABLE = False

try:
    import Levenshtein
    LEVENSHTEIN_AVAILABLE = True
except ImportError:
    LEVENSHTEIN_AVAILABLE = False

class SimilarityCalculator:
    def __init__(self):
        self.fuzzy_matcher = self._initialize_fuzzy_matcher()

    def _initialize_fuzzy_matcher(self) -> str:
        """Initialize the best available fuzzy matching algorithm."""
        if FUZZYWUZZY_AVAILABLE and LEVENSHTEIN_AVAILABLE:
            return "fuzzywuzzy_levenshtein"
        elif FUZZYWUZZY_AVAILABLE:
            return "fuzzywuzzy"
        elif DIFFLIB_AVAILABLE:
            return "difflib"
        else:
            return "basic"
    
    def calculate_similarity(self, product1: Dict, product2: Dict) -> Tuple[float, List[str]]:
        """
        Calculate similarity between two products using multiple algorithms.
        
        Returns:
            (similarity_score, match_reasons)
        """
        reasons: List[str] = []
        # Component scores
        name_score = 0.0
        token_score = 0.0
        brand_score = 0.0
        variety_score = 0.0
        size_score = 0.0
        
        # Extract product information
        name1 = product1.get('name', '')
        name2 = product2.get('name', '')
        brand1 = product1.get('brand_name', '')
        brand2 = product2.get('brand_name', '')
        variety1 = product1.get('variety', '')
        variety2 = product2.get('variety', '')
        # Use sizeRaw for string comparison, fallback to stringified size
        size1 = product1.get('sizeRaw', '') or str(product1.get('size', ''))
        size2 = product2.get('sizeRaw', '') or str(product2.get('size', ''))
        
        norm_name1 = normalize_product_name(name1, brand1, remove_packaging=True)
        norm_name2 = normalize_product_name(name2, brand2, remove_packaging=True)
        
        # 1. Exact normalized name match
        if norm_name1 == norm_name2 and norm_name1:
            name_score = max(name_score, 1.0)
            reasons.append("Exact normalized name match")
        
        # 2. Fuzzy name matching
        if self.fuzzy_matcher == "fuzzywuzzy_levenshtein":
            name_similarity = fuzz.ratio(norm_name1, norm_name2) / 100.0
            token_similarity = fuzz.token_sort_ratio(norm_name1, norm_name2) / 100.0
            partial_similarity = fuzz.partial_ratio(norm_name1, norm_name2) / 100.0

            fuzzy_score = max(name_similarity, token_similarity, partial_similarity)
            name_score = max(name_score, fuzzy_score)

            if fuzzy_score > 0.9:
                reasons.append(f"High fuzzy name match ({fuzzy_score:.2f})")
        
        elif self.fuzzy_matcher == "difflib":
            name_similarity = SequenceMatcher(None, norm_name1, norm_name2).ratio()
            name_score = max(name_score, name_similarity)

            if name_similarity > 0.9:
                reasons.append(f"High difflib name match ({name_similarity:.2f})")
        
        # 3. Brand matching
        if brand1 and brand2:
            brand_norm1 = normalize_product_name(brand1, remove_packaging=False)
            brand_norm2 = normalize_product_name(brand2, remove_packaging=False)
            
            if brand_norm1 == brand_norm2:
                brand_score = max(brand_score, 1.0)
                reasons.append("Brand match")
            elif self.fuzzy_matcher == "fuzzywuzzy_levenshtein":
                brand_similarity = fuzz.ratio(brand_norm1, brand_norm2) / 100.0
                if brand_similarity > 0.8:
                    brand_score = max(brand_score, brand_similarity)
                    reasons.append(f"Similar brand ({brand_similarity:.2f})")
        
        # 4. Variety matching
        if variety1 and variety2:
            variety_norm1 = normalize_product_name(variety1, remove_packaging=False)
            variety_norm2 = normalize_product_name(variety2, remove_packaging=False)
            
            if variety_norm1 == variety_norm2:
                variety_score = max(variety_score, 1.0)
                reasons.append("Variety match")
        
        # 5. Size matching
        if size1 and size2:
            size_norm1 = normalize_product_name(size1, remove_packaging=False)
            size_norm2 = normalize_product_name(size2, remove_packaging=False)
            
            if size_norm1 == size_norm2:
                size_score = max(size_score, 1.0)
                reasons.append("Size match")
        
        # 6. Token overlap
        tokens1 = generate_search_tokens(name1, brand1, variety1)
        tokens2 = generate_search_tokens(name2, brand2, variety2)
        
        if tokens1 and tokens2:
            intersection = tokens1.intersection(tokens2)
            union = tokens1.union(tokens2)
            
            if union:
                token_similarity = len(intersection) / len(union)
                token_score = max(token_score, token_similarity)

                if token_similarity > 0.7:
                    reasons.append(f"High token overlap ({token_similarity:.2f})")
        
        # Calculate final similarity score
        # Special case: If name equals brand, prioritize brand+size matching
        name1_lower = name1.lower().strip()
        name2_lower = name2.lower().strip()
        brand1_lower = brand1.lower().strip() if brand1 else ""
        brand2_lower = brand2.lower().strip() if brand2 else ""
        
        name1_is_brand = brand1_lower and (name1_lower == brand1_lower or name1_lower.replace('-', ' ').replace('_', ' ') == brand1_lower.replace('-', ' ').replace('_', ' '))
        name2_is_brand = brand2_lower and (name2_lower == brand2_lower or name2_lower.replace('-', ' ').replace('_', ' ') == brand2_lower.replace('-', ' ').replace('_', ' '))
        
        if (name1_is_brand or name2_is_brand) and brand_score >= 0.8 and size_score >= 0.8:
            final_score = (
                0.20 * name_score +
                0.40 * brand_score +
                0.30 * size_score +
                0.08 * token_score +
                0.02 * variety_score
            )
            reasons.append("Brand-named product matching")
        else:
            final_score = (
                0.55 * name_score +
                0.20 * size_score +
                0.15 * brand_score +
                0.07 * token_score +
                0.03 * variety_score
            )
        
        final_score = max(0.0, min(final_score, 1.0))
        
        return final_score, reasons
