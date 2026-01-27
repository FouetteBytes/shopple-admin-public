import re
import unicodedata
from services.system.logger_service import get_logger

logger = get_logger(__name__)

def normalize_text(text: str) -> str:
    """
    Normalize text for use in product IDs.
    
    Rules:
    - Convert to lowercase
    - Remove accents and special characters
    - Replace spaces and special chars with nothing
    - Keep only alphanumeric characters
    """
    if not text:
        return ""
    
    # Convert to lowercase
    text = text.lower()
    
    # Remove accents and normalize unicode
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    
    # Remove special characters and spaces, keep only alphanumeric
    text = re.sub(r'[^a-z0-9]', '', text)
    
    return text

def generate_product_id(brand_name: str, product_name: str, size: str) -> str:
    """
    Generate unique product ID using smart algorithm.
    
    Format: "brand_productname_size" or "none_productname_size"
    
    Examples:
    - "oateo_jumborolledoats_500g"
    - "none_banana_1kg"
    - "maliban_chocolatecreampuff_200g"
    """
    
    # Normalize all components
    brand_part = normalize_text(brand_name) if brand_name else "none"
    product_part = normalize_text(product_name) if product_name else "unknown"
    size_part = normalize_text(size) if size else "unknown"
    
    # Combine parts with underscores
    product_id = f"{brand_part}_{product_part}_{size_part}"
    
    # Clean up any double underscores
    product_id = re.sub(r'_+', '_', product_id)
    
    # Remove leading/trailing underscores
    product_id = product_id.strip('_')
    
    return product_id

def parse_size_string(size_str):
    """
    Parse a size string into numeric value and unit.
    
    Examples:
    - "1kg" -> (1.0, "kg")
    - "500g" -> (500.0, "g")
    - "250ml" -> (250.0, "ml")
    - "6 pieces" -> (6.0, "pieces")
    - "1.5L" -> (1.5, "L")
    - "2 x 500g" -> (1000.0, "g")  # Convert multi-pack
    - "pack of 12" -> (12.0, "pieces")
    - "1 dozen" -> (12.0, "pieces")
    
    Args:
        size_str: The size string to parse
        
    Returns:
        tuple: (numeric_value, unit) or (None, None) if parsing fails
    """
    if not size_str or not isinstance(size_str, str):
        return None, None
    
    # Clean the input
    size_str = size_str.strip().lower()
    
    # Handle special cases first
    if 'dozen' in size_str:
        # Extract number before "dozen"
        match = re.search(r'(\d+(?:\.\d+)?)\s*dozen', size_str)
        if match:
            return float(match.group(1)) * 12, "pieces"
        return 12.0, "pieces"
    
    # Handle "pack of X" format
    pack_match = re.search(r'pack\s+of\s+(\d+)', size_str)
    if pack_match:
        return float(pack_match.group(1)), "pieces"
    
    # Handle "X x Y unit" format (multi-pack)
    multi_pack_match = re.search(r'(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)', size_str)
    if multi_pack_match:
        count = float(multi_pack_match.group(1))
        size_per_unit = float(multi_pack_match.group(2))
        unit = multi_pack_match.group(3)
        return count * size_per_unit, unit
    
    # Handle standard "number + unit" format
    # Match patterns like: 1kg, 500g, 250ml, 1.5L, 6 pieces, etc.
    standard_match = re.search(r'(\d+(?:\.\d+)?)\s*([a-zA-Z]+)', size_str)
    if standard_match:
        value = float(standard_match.group(1))
        unit = standard_match.group(2)
        
        # Normalize common units
        unit_mapping = {
            'kg': 'kg',
            'g': 'g',
            'gram': 'g',
            'grams': 'g',
            'ml': 'ml',
            'l': 'L',
            'liter': 'L',
            'liters': 'L',
            'litre': 'L',
            'litres': 'L',
            'oz': 'oz',
            'lb': 'lb',
            'pound': 'lb',
            'pounds': 'lb',
            'piece': 'pieces',
            'pieces': 'pieces',
            'pcs': 'pieces',
            'pc': 'pieces',
            'unit': 'pieces',
            'units': 'pieces',
            'each': 'pieces',
            'bottle': 'bottles',
            'bottles': 'bottles',
            'can': 'cans',
            'cans': 'cans',
            'packet': 'packets',
            'packets': 'packets',
            'pack': 'packs',
            'packs': 'packs',
            'box': 'boxes',
            'boxes': 'boxes'
        }
        
        normalized_unit = unit_mapping.get(unit, unit)
        return value, normalized_unit
    
    # Handle numeric-only values (assume pieces).
    number_match = re.search(r'(\d+(?:\.\d+)?)', size_str)
    if number_match:
        return float(number_match.group(1)), "pieces"
    
    # If nothing matches, return None
    return None, None

def format_size_display(size_value, size_unit):
    """
    Format numeric size and unit back into a user-friendly display string.
    
    Examples:
    - (6.0, "pieces") -> "6 pieces"
    - (1.0, "kg") -> "1 kg"
    - (1.5, "L") -> "1.5 L"
    - (500.0, "g") -> "500g"
    - (250.0, "ml") -> "250ml"
    - (1000.0, "g") -> "1000g"
    
    Args:
        size_value: Numeric size value
        size_unit: Unit string
        
    Returns:
        str: Formatted size string for display
    """
    if size_value is None or size_unit is None:
        return ""
    
    # Format the number (remove unnecessary .0)
    if size_value == int(size_value):
        formatted_value = str(int(size_value))
    else:
        formatted_value = str(size_value)
    
    # Units that should have a space before them
    spaced_units = {
        "pieces", "bottles", "cans", "packets", "packs", "boxes", 
        "dozen", "pounds"
    }
    
    # Units that should be attached directly (no space)
    attached_units = {
        "g", "kg", "ml", "L", "oz", "lb"
    }
    
    # Determine spacing
    if size_unit in spaced_units:
        return f"{formatted_value} {size_unit}"
    elif size_unit in attached_units:
        return f"{formatted_value}{size_unit}"
    else:
        # Default: use space for unknown units
        return f"{formatted_value} {size_unit}"
