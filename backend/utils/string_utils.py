import re
from services.system.logger_service import get_logger

logger = get_logger(__name__)

def clean_product_name(name):
    """
    Clean and format product names for better display.
    
    Args:
        name: Raw product name string
        
    Returns:
        str: Cleaned and formatted product name
    """
    if not name or not isinstance(name, str):
        return "Unknown Product"
    
    # Remove extra whitespace and normalize
    name = re.sub(r'\s+', ' ', name.strip())
    
    # Handle common concatenated patterns
    # Pattern: "BrandnameBrandnameproduct" -> "Brandname product"
    name = re.sub(r'([a-z])([A-Z][a-z])', r'\1 \2', name)
    
    # Pattern: "productname500ml" -> "productname 500ml"
    name = re.sub(r'([a-zA-Z])(\d)', r'\1 \2', name)
    name = re.sub(r'(\d)([a-zA-Z])', r'\1\2', name)
    
    # Fix common concatenations
    name = re.sub(r'([a-z])([A-Z])', r'\1 \2', name)
    
    # Clean up repeated brand names
    words = name.split()
    if len(words) >= 2 and words[0].lower() == words[1].lower():
        # Remove duplicate brand name at start
        words = words[1:]
        name = ' '.join(words)
    
    # Normalize case
    # Keep acronyms uppercase, but title case other words
    words = []
    for word in name.split():
        if len(word) <= 3 and word.isupper():
            # Keep short uppercase words (like ML, KG, etc.)
            words.append(word)
        elif word.lower() in ['ml', 'kg', 'g', 'l', 'oz', 'lb']:
            # Normalize units
            words.append(word.lower())
        else:
            # Title case for regular words
            words.append(word.capitalize())
    
    name = ' '.join(words)
    
    # Final cleanup
    name = re.sub(r'\s+', ' ', name).strip()
    
    return name if name else "Unknown Product"
