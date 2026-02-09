"""
Intelligent Corrections Module for AI Product Classification
Contains rule-based logic to correct AI mistakes and enhance accuracy
"""

import os
import sys
import re
from typing import Dict, Optional

from backend.services.system.logger_service import get_logger

logger = get_logger(__name__)


class IntelligentCorrections:
    """
    Smart correction system that fixes AI classification errors
    """
    
    def __init__(self):
        # Known brand patterns and first words that are likely brands
        self.known_brands = [
            'keells', 'maliban', 'prima', 'kellogg', 'maggi', 'nestle', 'catch', 
            'harischandra', 'bcc', 'silvermill', 'arunalu', 'uswatte', 'munchee',
            'elephant', 'alli', 'tiara', 'happy', 'nel', 'cic', 'oateo', 'chupa',
            'renuka', 'sera', 'koluu', 'scan', 'bounty', 'finagle', 'fortune',
            'supreme', 'daawat', 'motha', 'star', 'samaposha', 'lanka'
        ]
        
        self.multi_word_brands = [
            'happy hen', 'nel farm', 'lanka soy', 'star gold', 'mr.pop'
        ]

    def intelligent_product_type_correction(self, parsed_result: Dict, product_name: str) -> Dict:
        """
        Ultra-intelligent product type correction based on keyword analysis
        """
        product_lower = product_name.lower()
        
        # CRITICAL CORRECTIONS - Override AI if it makes obvious errors
        
        # Lentil/Pulse detection (Dhal/Dal)
        if 'dhal' in product_lower or 'dal ' in product_lower:
            if parsed_result.get('product_type', '').lower() != 'lentil':
                logger.debug(f"🧠 INTELLIGENT CORRECTION: '{parsed_result.get('product_type')}' → 'Lentil' (contains 'dhal')")
                parsed_result['product_type'] = 'Lentil'
        
        # Snack Bar detection
        elif 'bar' in product_lower and ('grain' in product_lower or 'choxy' in product_lower or 'protein' in product_lower):
            if parsed_result.get('product_type', '').lower() not in ['snack bar', 'cereal bar', 'energy bar']:
                logger.debug(f"🧠 INTELLIGENT CORRECTION: '{parsed_result.get('product_type')}' → 'Snack Bar' (contains 'bar' + grain indicators)")
                parsed_result['product_type'] = 'Snack Bar'
        
        # Oil detection
        elif 'oil' in product_lower and 'coconut' in product_lower:
            if parsed_result.get('product_type', '').lower() != 'oil':
                logger.debug(f"🧠 INTELLIGENT CORRECTION: '{parsed_result.get('product_type')}' → 'Oil' (contains 'coconut oil')")
                parsed_result['product_type'] = 'Oil'
        
        # Milk detection
        elif 'milk' in product_lower and ('coconut' in product_lower or 'powder' in product_lower):
            if parsed_result.get('product_type', '').lower() not in ['milk', 'milk powder', 'coconut milk']:
                logger.debug(f"🧠 INTELLIGENT CORRECTION: '{parsed_result.get('product_type')}' → 'Milk Product' (contains milk indicators)")
                parsed_result['product_type'] = 'Milk Product'
        
        # Flour detection
        elif 'flour' in product_lower:
            if parsed_result.get('product_type', '').lower() != 'flour':
                logger.debug(f"🧠 INTELLIGENT CORRECTION: '{parsed_result.get('product_type')}' → 'Flour' (contains 'flour')")
                parsed_result['product_type'] = 'Flour'
        
        # Fish detection (more specific)
        elif any(fish in product_lower for fish in ['mackerel', 'sprats', 'tuna', 'sardine', 'salmon']):
            if parsed_result.get('product_type', '').lower() != 'fish':
                logger.debug(f"🧠 INTELLIGENT CORRECTION: '{parsed_result.get('product_type')}' → 'Fish' (contains fish type)")
                parsed_result['product_type'] = 'Fish'
        
        # Dry Fish detection
        elif 'dry fish' in product_lower or ('dry' in product_lower and any(fish in product_lower for fish in ['fish', 'thalapath', 'katta'])):
            if parsed_result.get('product_type', '').lower() not in ['dry fish', 'fish']:
                logger.debug(f"🧠 INTELLIGENT CORRECTION: '{parsed_result.get('product_type')}' → 'Dry Fish' (contains dry fish indicators)")
                parsed_result['product_type'] = 'Dry Fish'
        
        return parsed_result

    def intelligent_variety_extraction(self, product_name: str, product_type: str) -> Optional[str]:
        """
        ULTRA-INTELLIGENT variety extraction when AI misses obvious varieties
        This is very descriptive and informative as requested, encouraging reasoning
        """
        product_lower = product_name.lower()
        
        # For Lentils/Dhal - INTELLIGENT dhal variety detection
        # Reason: Dhal varieties are crucial for customer choice - Mysoore vs Masoor are very different
        if product_type and 'lentil' in product_type.lower():
            # Common dhal varieties with intelligent detection
            dhal_types = ['mysoore', 'mysore', 'masoor', 'toor', 'moong', 'urad', 'chana', 'red', 'yellow', 'black']
            for dhal_type in dhal_types:
                if dhal_type in product_lower:
                    return dhal_type.capitalize()
        
        return None

    def apply_minimal_corrections(self, parsed_result: Dict, original_name: str) -> Dict:
        """
        Apply minimal corrections to preserve AI accuracy while fixing critical errors.
        This method should NOT modify correct AI responses - only fix obvious mistakes.
        """
        # Return the result as-is - AI responses are trustworthy
        # Only product_type correction is applied if it's Unknown
        if not parsed_result.get('product_type') or parsed_result.get('product_type', '').lower() == 'unknown':
            parsed_result = self.intelligent_product_type_correction(parsed_result, original_name)
        
        return parsed_result
