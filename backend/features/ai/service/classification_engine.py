import json
import os
import re
import sys
import time
import threading
from typing import Dict, List, Optional
from backend.features.products.service.matcher.corrections import IntelligentCorrections
from backend.services.ai_handlers.groq_handler import GroqHandler
from backend.services.ai_handlers.cerebras_handler import CerebrasHandler
from backend.services.ai_handlers.gemini_handler import GeminiHandler
from backend.services.ai_handlers.openrouter_handler import OpenRouterHandler
from backend.config.env_config import get_api_config
from backend.features.products.service.matcher.legacy_cache import IntelligentProductCache

from backend.services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

class SmartFallbackAIClassifier:
    """
    AI classifier with smart model cascade: Groq → OpenRouter → Gemini → Cerebras → E2B → 1B
    Enhanced with intelligent caching for massive speed improvements
    """
    
    def __init__(self, enable_cache: bool = True):
        # Initialize intelligent cache
        self.enable_cache = enable_cache
        if self.enable_cache:
            self.cache = IntelligentProductCache()
        else:
            self.cache = None
        
        # Initialize intelligent corrections module
        self.corrections = IntelligentCorrections()
        
        # Load API configuration from .env
        self.api_config = get_api_config()
        
        # Initialize API handlers - simplified (no load balancing)
        if self.api_config.get('groq_api_key'):
            self.groq_handler = GroqHandler(self.api_config.get('groq_api_key'))
            logger.debug("Groq initialized")
        else:
            self.groq_handler = GroqHandler()
            logger.debug("⚠️ No Groq API key found")
            
        self.openrouter_handler = OpenRouterHandler(self.api_config.get('openrouter_api_key'))
        self.gemini_handler = GeminiHandler(self.api_config.get('gemini_api_key'))
        self.cerebras_handler = CerebrasHandler(self.api_config.get('cerebras_api_key'))
        
        logger.debug("✅ Smart AI Classifier initialized!")
        if self.enable_cache:
            logger.debug("⚡ Intelligent Cache: ENABLED")
        else:
            logger.debug("⚡ Intelligent Cache: DISABLED")
        logger.debug("Online API Model Priority:")
        
        logger.debug(f"   1️⃣ Groq API {'✅' if self.groq_handler.is_available() else '❌'}")
        logger.debug(f"   2️⃣ OpenRouter API {'✅' if self.openrouter_handler.is_available() else '❌'}")
        logger.debug(f"   3️⃣ Gemini API {'✅' if self.gemini_handler.is_available() else '❌'}")
        logger.debug(f"   4️⃣ Cerebras API {'✅' if self.cerebras_handler.is_available() else '❌'}")
        logger.debug("   ⚠️ Local models removed - using online APIs only")
        
        # Track model usage
        self.current_priority = 1  # Start with highest priority
        self.model_usage_stats = {
            'groq': 0,
            'cerebras': 0,
            'gemini': 0,
            'openrouter': 0,
            'failed': 0
        }

    def _create_standard_system_prompt(self) -> str:
        """
        Create comprehensive system prompt with all classification instructions.
        Used by all API handlers for consistency and token efficiency.
        """
        return """You are classifying Sri Lankan grocery products for an online store.

CRITICAL: Users find products in 2 steps: 1) Search (e.g., "chicken") 2) Filter results by variety
The product NAME handles search. VARIETY handles filtering.

REQUIRED FORMAT - Return ONLY these 5 lines:
PRODUCT_TYPE: [Choose EXACTLY from list below]
BRAND_NAME: [Company name or None - NOT descriptors]  
PRODUCT_NAME: [Full product name given without size]
SIZE: [Amount with unit (g, kg, ml, L, pieces), if "Bulk kg" use "1kg", "S" = "pieces", default "1kg" if not specified]
VARIETY: [Smart filter value - see rules below]

PRODUCT_TYPE OPTIONS (choose ONE):
Rice & Grains | Lentils & Pulses | Spices & Seasonings | Coconut Products | 
Canned Food | Snacks | Beverages | Dairy | Meat | Seafood | Dried Seafood | Frozen Food | Salt | Sugar |
Vegetables | Fruits | Dried Fruits | Bread & Bakery | Noodles & Pasta | Instant Foods | Oil & Vinegar | 
Condiments & Sauces | Pickles & Preserves | Sweets & Desserts | Tea & Coffee | 
Flour & Baking | Nuts & Seeds | Eggs | Baby Food | Cereal |
Health & Supplements | Household Items | Paper Products | Cleaning Supplies | Personal Care | Pet Food & Supplies |

SMART CATEGORIZATION: Think intelligently about where customers would logically look for this product. If unsure, consider: What aisle/section would this be in? What would customers search under? You should choose the closest and absolutely correct match that makes shopping sense.

VARIETY DECIDING RULES - APPLY THE FOLLOWING 6 RULES IN PRIORITY ORDER AND THINK LIKE A CUSTOMER SHOPPING TO DECIDE VARIETY:

    RULE 1: ORIGIN/IMPORT STATUS + PRODUCT
    - "Imported Red Apples" → "Imported Apples"
    - "Italian Olive Oil" → "Italian Oil" 
    - "Local Fresh Rice" → "Local Rice"
    - "Organic Brown Rice" → "Organic Rice"
    Combine import/origin/organic status with core product name

    RULE 2: SPECIFIC VARIETY NAMES (well-known varieties)
    - "Basmati Rice" → "Basmati"
    - "Red Lady Papaw" → "Red Lady" 
    - "Mysore Dhal" → "Mysore"
    - "Kolikuttu Medicine" → "Kolikuttu"
    Use the specific variety name only when it's a recognized variety

    RULE 3: PROCESSING + PRODUCT (when meaningful to customers)
    - "Raw Cashews" → "Raw Cashews"
    - "Roasted Peanuts" → "Roasted Peanuts"
    - "Ground Cinnamon" → "Ground Cinnamon"
    Processing method + product when it affects usage

    RULE 4: DESCRIPTIVE + PRODUCT (when needed for distinction)
    - "Sweet Melon" → "Sweet Melon"
    - "Sour Plantain" → "Sour Plantain"
    - "Brown Sugar" → "Brown Sugar"
    - "Large Eggs" → "Large Eggs"
    Include product context when descriptor alone isn't clear

    RULE 5: SIZE CONVERSION INTELLIGENCE (in product names)
    - "L" in food context → "Large" size
    - "S" in food context → "Small" size  
    - "XL", "XXL" → "Extra Large", "Extra Extra Large"
    - Always use meaningful words, never single letters
    - "Chicken Curry L" → "Large Chicken Curry"
    - "Rice Pack S" → "Small Rice Pack"

    RULE 6: PRODUCT NAME ONLY (when no meaningful variety)
    - "Pineapple" → "Pineapple"
    - "Carrots" → "Carrots"
    Use product name when no special variety exists

CRITICAL:
- Plant-based milk → Beverages (NOT Dairy)
- Only animal milk → Dairy  
- Kolikuttu, pani dodam → Fruits
- Papadums → Snacks (NOT Bread)
- Coconut milk/cream → Coconut Products (NOT Dairy or Beverages)
- Herbal remedies/Ayurvedic → Health & Supplements (traditional remedies categorized here)
- Lentils/Dhal → Lentils & Pulses (NOT Rice & Grains)

CONSISTENCY RULES:
- Use exact capitalization: "Chicken Curry" not "chicken curry" or "CHICKEN CURRY"
- Customer search terms: Use words customers search for, not internal jargon
- Each VARIETY must work standalone in filter dropdown - think searchability
- SEO-friendly: Clear names help search engines and customers find products

Examples:
"Red Lentils Mysoor Dhal 500g"
PRODUCT_TYPE: Lentils & Pulses
BRAND_NAME: None
PRODUCT_NAME: Red Lentils Mysoor Dhal
SIZE: 500g
VARIETY: Mysoor Dhal

"Prima Coconut Milk Powder 300g"
PRODUCT_TYPE: Coconut Products
BRAND_NAME: Prima
PRODUCT_NAME: Prima Coconut Milk Powder
SIZE: 300g
VARIETY: Coconut Milk Powder

"Sam's Chicken Kochchi Bites 450g"
PRODUCT_TYPE: Meat
BRAND_NAME: Sam's
PRODUCT_NAME: Sam's Chicken Kochchi Bites
SIZE: 450g
VARIETY: Chicken Kochchi Bites"""
    
    class ClassificationCancelled(Exception):
        pass

    def _get_ai_response_with_enhanced_cascade(self, prompt: str, product_name: str, progress_callback=None, cancel_event: Optional[threading.Event] = None, model_overrides: Optional[Dict[str, str]] = None) -> tuple[str, str, str]:
        """
        Model cascade: Groq → OpenRouter → Gemini → Cerebras → E2B → 1B
        Returns: (response, model_used)
        """
        def check_cancel():
            if cancel_event is not None and cancel_event.is_set():
                raise SmartFallbackAIClassifier.ClassificationCancelled()

        use_memory = self.api_config.get('use_conversation_memory', True)
        
        # Get the comprehensive system prompt
        system_prompt = self._create_standard_system_prompt()
        # User message contains only the product name.
        user_message = product_name
        
        # 1️⃣ Try Groq API
        check_cancel()
        if self.current_priority <= 1 and self.groq_handler.is_available():
            if progress_callback:
                progress_callback("Trying Groq API...", "GROQ")
            try:
                check_cancel()
                # Set system instruction for Groq if using memory and not already set
                if use_memory and self.groq_handler.get_conversation_length() == 0:
                    self.groq_handler.add_system_instruction(system_prompt)
                
                groq_model = (model_overrides or {}).get('groq') or "llama-3.3-70b-versatile"
                response, status = self.groq_handler.classify_product(
                    user_message, 
                    use_memory, 
                    model_override=groq_model,
                    system_prompt=system_prompt if not use_memory else None
                )
                check_cancel()
                if response and len(response) > 20:
                    self.model_usage_stats['groq'] += 1
                    return response, "GROQ", groq_model
                else:
                    logger.info("Groq returned empty/short response, trying next provider...")
            except SmartFallbackAIClassifier.ClassificationCancelled:
                raise
            except Exception as e:
                logger.info(f"Groq API failed ({e}), trying next provider...")

        # 2️⃣ Try OpenRouter API
        check_cancel()
        if self.current_priority <= 2 and self.openrouter_handler.is_available():
            if progress_callback:
                progress_callback("Trying OpenRouter API...", "OPENROUTER")
            try:
                check_cancel()
                # Set system instruction for OpenRouter if using memory and not already set
                if use_memory and self.openrouter_handler.get_conversation_length() == 0:
                    self.openrouter_handler.add_system_instruction(system_prompt)
                
                or_model = (model_overrides or {}).get('openrouter') or "deepseek/deepseek-r1-0528:free"
                response, status = self.openrouter_handler.classify_product(
                    user_message, 
                    use_memory, 
                    model_override=or_model,
                    system_prompt=system_prompt if not use_memory else None,
                    request_timeout=45  # Shorter timeout for cascade fallback
                )
                check_cancel()
                if response and len(response) > 20:
                    self.model_usage_stats['openrouter'] += 1
                    return response, "OPENROUTER", or_model
                else:
                    logger.info("OpenRouter returned empty/short response, trying next provider...")
            except SmartFallbackAIClassifier.ClassificationCancelled:
                raise
            except Exception as e:
                logger.info(f"OpenRouter API failed ({e}), trying next provider...")

        # 3️⃣ Try Gemini API
        check_cancel()
        if self.current_priority <= 3 and self.gemini_handler.is_available():
            if progress_callback:
                progress_callback("Trying Gemini API...", "GEMINI")
            try:
                check_cancel()
                # Set system instruction for Gemini if using memory and not already set
                if use_memory and self.gemini_handler.get_conversation_length() == 0:
                    self.gemini_handler.add_system_instruction(system_prompt)
                
                gem_model = (model_overrides or {}).get('gemini') or "gemini-2.5-pro"
                response, status = self.gemini_handler.classify_product(
                    user_message, 
                    use_memory,
                    system_prompt=system_prompt if not use_memory else None,
                    model_override=gem_model
                )
                check_cancel()
                if response and len(response) > 20:
                    self.model_usage_stats['gemini'] += 1
                    return response, "GEMINI", gem_model
                else:
                    logger.info("Gemini returned empty/short response, trying next provider...")
            except SmartFallbackAIClassifier.ClassificationCancelled:
                raise
            except Exception as e:
                logger.info(f"Gemini API failed ({e}), trying next provider...")

        # 4️⃣ Try Cerebras API
        check_cancel()
        if self.current_priority <= 4 and self.cerebras_handler.is_available():
            if progress_callback:
                progress_callback("Trying Cerebras API...", "CEREBRAS")
            try:
                check_cancel()
                # Set system instruction for Cerebras if using memory and not already set
                if use_memory and self.cerebras_handler.get_conversation_length() == 0:
                    self.cerebras_handler.add_system_instruction(system_prompt)
                
                # Use override if provided, otherwise let handler use env var or fail
                cer_model = (model_overrides or {}).get('cerebras')
                response, status = self.cerebras_handler.classify_product(
                    user_message, 
                    use_memory, 
                    system_prompt=system_prompt if not use_memory else None,
                    model_override=cer_model
                )
                check_cancel()
                if response and len(response) > 20:
                    self.model_usage_stats['cerebras'] += 1
                    return response, "CEREBRAS", "qwen-3-32b"
                else:
                    logger.info("Cerebras returned empty/short response, trying retry...")
            except SmartFallbackAIClassifier.ClassificationCancelled:
                raise
            except Exception as e:
                logger.info(f"Cerebras API failed ({e}), trying retry...")

        # All online APIs exhausted. Cycle through them again with different prompts.
        check_cancel()
        if progress_callback:
            progress_callback("Retrying with alternative approach...", "RETRY")
        
        logger.debug("All primary APIs failed, trying alternative approaches...")
        
        # Try a simplified prompt with Groq again
        try:
            check_cancel()
            if self.groq_handler.is_available():
                logger.debug("Retrying Groq with simplified prompt...")
                simplified_prompt = f"Classify this Sri Lankan product briefly: {product_name}"
                response = self.groq_handler.get_classification(simplified_prompt)
                check_cancel()
                if response and len(response) > 20:
                    logger.debug("✅ Groq retry successful!")
                    self.model_usage_stats['groq'] += 1
                    return response, "GROQ_RETRY", "retry"
        except SmartFallbackAIClassifier.ClassificationCancelled:
            raise
        except Exception as e:
            logger.debug(f"❌ Groq retry failed: {e}")
        
        # Try a simplified prompt with OpenRouter again
        try:
            check_cancel()
            if self.openrouter_handler.is_available():
                logger.debug("Retrying OpenRouter with simplified prompt...")
                simplified_prompt = f"Classify this Sri Lankan product briefly: {product_name}"
                response = self.openrouter_handler.get_classification(simplified_prompt)
                check_cancel()
                if response and len(response) > 20:
                    logger.debug("✅ OpenRouter retry successful!")
                    self.model_usage_stats['openrouter'] += 1
                    return response, "OPENROUTER_RETRY", "retry"
        except SmartFallbackAIClassifier.ClassificationCancelled:
            raise
        except Exception as e:
            logger.debug(f"❌ OpenRouter retry failed: {e}")

    def classify_product_ai_only(self, product_name: str, price: str = "", image_url: str = "", 
                               progress_callback=None, use_cache: bool = True, store_in_cache: bool = True,
                               cancel_event: Optional[threading.Event] = None,
                               model_overrides: Optional[Dict[str, str]] = None) -> Dict:
        """
        Classify product using AI with smart fallback and intelligent caching
        Enhanced with cache-first approach for massive speed improvements
        
        Args:
            product_name: Name of the product to classify
            price: Product price (stored but not used for cache matching)
            image_url: Product image URL
            progress_callback: Callback for progress updates
            use_cache: Whether to check cache for existing results (default: True)
            store_in_cache: Whether to store new results in cache (default: True)
        """
        def check_cancel():
            if cancel_event is not None and cancel_event.is_set():
                raise SmartFallbackAIClassifier.ClassificationCancelled()

        check_cancel()
        # Check cache first if enabled and requested
        if self.enable_cache and self.cache and use_cache:
            cached_result = self.cache.find_cached_result(product_name, price, image_url)
            if cached_result:
                check_cancel()
                logger.info(f"⚡ Cache HIT for: {product_name}", extra={"match_type": cached_result['match_type'], "confidence": cached_result['confidence'], "cached_name": cached_result['cached_name']})
                
                if progress_callback:
                    progress_callback(f"Cache hit: {cached_result['match_type']} match", "CACHE")
                
                # Add cache info to result and preserve actual input details
                result = cached_result['result'].copy()
                
                # Use actual input price if provided
                if price and price.strip():
                    result['price'] = price
                else:
                    result['price'] = ''  # Clear price if not provided
                
                # ALWAYS use the input image URL since cache doesn't store images
                # The image comes from the original JSON data, not the cache
                if image_url and image_url.strip():
                    result['image_url'] = image_url
                    result['image'] = image_url  # Frontend compatibility
                else:
                    result['image_url'] = ''
                    result['image'] = ''
                
                # Extract and use actual size from current input, not cached size
                actual_size = self._extract_size_from_name(product_name)
                if actual_size:
                    result['size'] = actual_size
                
                # Update original name to actual input
                result['original_name'] = product_name
                
                result['cache_info'] = {
                    'cache_hit': True,
                    'match_type': cached_result['match_type'],
                    'confidence': cached_result['confidence'],
                    'cached_name': cached_result['cached_name'],
                    'cache_timestamp': cached_result['cache_timestamp']
                }
                result['model_used'] = 'CACHE'
                return result
        
        logger.info(f"Cache miss - AI classifying: {product_name}")
        check_cancel()
        
        if progress_callback:
            # Enhanced reasoning prompt.
            progress_callback("Starting enhanced model cascade...", "Enhanced Cascade")
        prompt = f"""You are an expert product analyst. Analyze this product name intelligently: "{product_name}"

THINK STEP BY STEP - Do not just follow examples; reason through the product:

STEP 1: PRODUCT_TYPE Analysis
- Look at the CORE INGREDIENT/ITEM in the name
- Ask: "What is the main thing being sold?"

REASONING GUIDE:
• If name contains "Dhal/Dal" → It's a LENTIL/PULSE, not spice
• If name contains "Rice" → It's RICE
• If name contains "Sugar" → It's SUGAR  
• If name contains "Oil" → It's OIL
• If name contains "Flour" → It's FLOUR
• If name contains "Eggs" → It's EGGS
• If name contains "Milk/Coconut Milk" → It's MILK/MILK_PRODUCT
• If name contains "Biscuit/Cracker" → It's BISCUIT
• If name contains "Noodles/Mee" → It's NOODLES
• If name contains spice names (pepper, cinnamon, curry powder) → It's SPICE

STEP 2: BRAND_NAME Analysis - THINK LIKE A MARKETING EXPERT
- Look at the FIRST word(s) - are they a company/manufacturer name?
- Ask: "Is this a brand or just a description?"

ULTRA-INTELLIGENT BRAND REASONING:
• Companies invest millions in brand recognition - proper nouns at start are usually brands
• Capitalized proper nouns at the start = Likely BRAND (Maliban, Keells, Samaposha)
• Generic descriptive words = NOT brand (Rice, Sugar, White, Brown, Local, Imported)
• Well-known Sri Lankan companies = DEFINITE BRAND (Keells, Maliban, Prima, Happy Hen)
• If starts with product type → probably NO brand (Rice Red Kekulu = no brand)
• Multi-word brands exist (Happy Hen, Lanka Soy) - consider context
• Regional indicators (Mysoore, Local) are NOT brands, they're origin descriptions

STEP 3: SIZE Analysis
- Look for numbers + units (g, kg, ml, L, S, U)
- Convert "Bulk kg" → "1kg" (standard bulk unit)
- Convert "10S" → "10 pieces" (S = pieces)

STEP 4: VARIETY Analysis - BE ULTRA-DESCRIPTIVE AND INTELLIGENT
- Think like a customer: "What specific TYPE/FLAVOR/STYLE am I buying?"
- Only extract what's ACTUALLY mentioned in the product name
- Be VERY intelligent about what constitutes a meaningful variety

ULTRA-INTELLIGENT VARIETY REASONING:
• Colors indicate variety (Red Rice vs White Rice - different nutritional profiles)
• Flavors/styles are crucial varieties (Chocolate vs Vanilla - completely different products)
• Size descriptions for eggs/produce (Large Eggs vs Medium - affects cooking)
• Origin/type for ingredients (Basmathi Rice vs Kekulu Rice - different cooking methods)
• Processing types (Brown Sugar vs White Sugar - different refinement levels)
• Brand-specific variants (4Gb Choxy - specific product line within brand)
• Texture/consistency varieties (Bulk vs Regular, Powder vs Liquid)
• DO NOT extract generic words like "Regular", "Standard", "Normal" - these add no value
• DO extract meaningful descriptors that help customers distinguish products
• For rice: Red/White/Brown indicate nutritional content and cooking method
• For dhal: Mysoore/Masoor indicate completely different lentil types
• For eggs: Brown/White indicate shell color preference, Large/Medium indicate size needs

STEP 5: PRODUCT_NAME Analysis
- Keep the FULL DESCRIPTIVE NAME but remove size specifications
- Keep brand, variety, and descriptive words
- Remove only the size part (like "20g", "1kg", "10 pieces")

EXAMPLES:
• "Maliban Chocolate Cream Puff 200g" → "Maliban Chocolate Cream Puff"
• "Samaposha 4Gb Choxy Grain Bar 20g" → "Samaposha 4Gb Choxy Grain Bar"
• "Happy Hen Brown Eggs Large 10S" → "Happy Hen Brown Eggs Large"

NOW APPLY YOUR REASONING TO: "{product_name}"

CRITICAL EXAMPLES FOR LEARNING PATTERNS:

"Mysoore Dhal Bulk kg" 
→ THINK: Contains "Dhal" = it's a LENTIL/PULSE, not spice
→ PRODUCT_TYPE: Lentil (because Dhal = lentil)
→ BRAND_NAME: None (Mysoore might be origin, not brand)
→ PRODUCT_NAME: Mysoore Dhal (descriptive name without size)
→ SIZE: 1kg (Bulk kg = 1kg)
→ VARIETY: Mysoore (type of dhal)

"Samaposha 4Gb Choxy Grain Bar 20g"
→ THINK: Contains "Bar" + grain = it's a SNACK_BAR/CEREAL_BAR
→ PRODUCT_TYPE: Snack Bar (grain bar = snack bar)
→ BRAND_NAME: Samaposha (capitalized first word = brand)
→ PRODUCT_NAME: Samaposha 4Gb Choxy Grain Bar (descriptive name without size)
→ SIZE: 20g
→ VARIETY: 4Gb Choxy (specific product variant)

"Happy Hen Brown Eggs Large 10S"
→ THINK: Contains "Eggs" = it's EGGS
→ PRODUCT_TYPE: Eggs
→ BRAND_NAME: Happy Hen (company name)
→ PRODUCT_NAME: Happy Hen Brown Eggs Large (descriptive name without size)
→ SIZE: 10 pieces (10S = 10 pieces)
→ VARIETY: Brown Large (color + size variety)

"Rice Red Kekulu Bulk Kg - Local"
→ THINK: Contains "Rice" = it's RICE
→ PRODUCT_TYPE: Rice
→ BRAND_NAME: None (starts with product type, "Local" is origin not brand)
→ PRODUCT_NAME: Rice Red Kekulu - Local (descriptive name without size)
→ SIZE: 1kg (Bulk kg = 1kg)
→ VARIETY: Red Kekulu (rice variety and origin)

USE YOUR INTELLIGENCE, NOT JUST PATTERN MATCHING!

Answer format:
PRODUCT_TYPE: [your reasoned answer]
BRAND_NAME: [your reasoned answer or None]
PRODUCT_NAME: [descriptive name without size info]
SIZE: [your reasoned answer or None]
VARIETY: [your reasoned answer or None]""" 
        # Get AI response with enhanced cascade
        logger.debug("⏳ Getting AI analysis with enhanced model cascade...")
        ai_response, model_used, exact_model = self._get_ai_response_with_enhanced_cascade(
            prompt, product_name, progress_callback, cancel_event, model_overrides
        )
        check_cancel()
        
        if ai_response and len(ai_response) > 10:
            logger.info(f"AI Response (from {model_used} model):")
            logger.info("-" * 50)
            logger.info(ai_response)
            logger.info("-" * 50)
            
            # Parse AI response without aggressive corrections
            parsed = self._parse_structured_ai_response(ai_response, product_name)
            
            # MINIMAL CORRECTIONS - Only fix critical product type errors if AI clearly got it wrong
            if parsed.get('product_type', '').lower() == 'unknown':
                parsed = self.corrections.intelligent_product_type_correction(parsed, product_name)
            
            # Only extract variety if AI completely missed it AND it's a critical case
            if not parsed.get('variety') or parsed.get('variety') == 'None':
                # Only for very obvious cases where variety is critical
                product_lower = product_name.lower()
                if ('dhal' in product_lower and 'mysoor' in product_lower) or ('rice' in product_lower and any(v in product_lower for v in ['basmati', 'kekulu', 'red', 'white'])):
                    extracted_variety = self.corrections.intelligent_variety_extraction(product_name, parsed.get('product_type'))
                    if extracted_variety:
                        parsed['variety'] = extracted_variety
                        logger.debug(f"Added missing critical variety: '{extracted_variety}'")
            
            # Build result with EXACT SAME format as original
            result = {
                "product_type": parsed.get('product_type', 'Unknown'),
                "brand_name": parsed.get('brand_name', None),
                "product_name": parsed.get('product_name', 'Unknown'),
                "size": parsed.get('size', None),
                "variety": parsed.get('variety', None),
                "price": price,
                "image_url": image_url,
                "original_name": product_name,
                "complete_ai_response": ai_response,
                "model_used": model_used,  # Track which model was used
                "selected_model": exact_model
            }
            
            logger.info(f"Parsed Classification (by {model_used} model)", extra={"product_type": result['product_type'], "brand_name": result['brand_name'], "product_name": result['product_name'], "size": result['size'], "variety": result['variety'], "model_used": model_used})
            if parsed.get('variety') != result['variety']:
                logger.debug(f"Corrected AI hallucination: '{parsed.get('variety')}' -> '{result['variety']}'")

            # Cache the successful result if caching is enabled and requested
            if self.enable_cache and self.cache and store_in_cache:
                try:
                    self.cache.cache_result(product_name, result, price, image_url)
                    logger.info(f"Cached result for: {product_name}")
                except Exception as e:
                    logger.warning(f"Failed to cache result: {e}", extra={"error": str(e)})
            elif not store_in_cache:
                logger.info("Skipping cache storage (disabled by user)")
            
            return result
        else:
            logger.debug(f"❌ Both AI models failed for: {product_name}")
            return self._create_failed_result(product_name, price, image_url)

    def _parse_structured_ai_response(self, ai_response: str, original_name: str) -> Dict:
        """
        Parse AI response with strict format expectations (EXACT SAME as original)
        """
        try:
            result = {}
            
            # Clean response - remove think tags from reasoning models like QWQ
            response = ai_response.strip()
            
            # Remove <think>...</think> blocks completely
            response = re.sub(r'<think>.*?</think>', '', response, flags=re.DOTALL)
            # Remove any remaining think tags
            response = response.replace('<think>', '').replace('</think>', '')
            
            # Clean formatting characters
            response = response.replace('*', '').replace('#', '').strip()
            
            logger.info("Cleaned response after removing think tags:")
            logger.info(f"Length: {len(response)} characters")
            logger.info(response)
            logger.info(f"Repr: {repr(response[:200])}")
            
            # Extract each field with specific patterns (EXACT SAME as original)
            field_patterns = {
                'product_type': [
                    r'PRODUCT_TYPE:\s*([^\n\r]+)',
                    r'Product Type:\s*([^\n\r]+)',
                    r'1\.\s*PRODUCT_TYPE:\s*([^\n\r]+)'
                ],
                'brand_name': [
                    r'BRAND_NAME:\s*([^\n\r]+)',
                    r'Brand Name:\s*([^\n\r]+)', 
                    r'2\.\s*BRAND_NAME:\s*([^\n\r]+)'
                ],
                'product_name': [
                    r'PRODUCT_NAME:\s*([^\n\r]+)',
                    r'Product Name:\s*([^\n\r]+)',
                    r'3\.\s*PRODUCT_NAME:\s*([^\n\r]+)'
                ],
                'size': [
                    r'SIZE:\s*([^\n\r]+)',
                    r'Size:\s*([^\n\r]+)',
                    r'4\.\s*SIZE:\s*([^\n\r]+)'
                ],
                'variety': [
                    r'VARIETY:\s*([^\n\r]+)',
                    r'Variety:\s*([^\n\r]+)',
                    r'5\.\s*VARIETY:\s*([^\n\r]+)'
                ]
            }
              # Extract each field (EXACT SAME logic as original)
            for field_name, patterns in field_patterns.items():
                found_value = None
                
                for pattern in patterns:
                    match = re.search(pattern, response, re.IGNORECASE)
                    if match:
                        value = match.group(1).strip()
                        logger.info(f"✅ Matched {field_name}: '{value}' using pattern {pattern}")
                        # Clean up the value
                        value = value.replace('[answer]', '').strip()
                        
                        # For variety field, remove explanations in parentheses but preserve descriptive ones
                        if field_name == 'variety' and '(' in value:
                            # Only remove parentheses if they contain explanatory text, not product descriptors
                            # Keep descriptive parentheses like "(Jama Naran)" but remove explanatory ones like "(specific variety)"
                            if re.search(r'\((?:specific|type|variety|kind|style|flavor)\b', value, re.IGNORECASE):
                                value = re.sub(r'\s*\([^)]*\)', '', value).strip()
                            # Otherwise keep the parentheses as they're likely descriptive
                        
                        # Validate the value
                        if value and value.lower() not in ['unknown', 'none', 'not specified', 'n/a', 'null']:
                            found_value = value
                            break
                        elif value and value.lower() == 'none' and field_name == 'variety':
                            # For variety, "None" is a valid answer
                            found_value = None
                            break
                
                result[field_name] = found_value
              # Enhanced product_name handling - keep descriptive name, remove size
            if not result.get('product_name') or result['product_name'] == 'Unknown':
                # Remove size info from the original name to keep a descriptive product name.
                clean_name = re.sub(r'\s*\d+\s*[gGkKmMlLsS]+\b', '', original_name)  # Remove 20g, 1kg, 10S, etc.
                clean_name = re.sub(r'\s*\([^)]*[0-9]+[^)]*\)\s*', '', clean_name)  # Only remove size-related parentheses like (5U) and (10 pieces).
                clean_name = re.sub(r'\s*bulk\s*kg\s*', '', clean_name, flags=re.IGNORECASE)  # Remove "bulk kg".
                clean_name = re.sub(r'\s+', ' ', clean_name).strip()  # Clean up extra spaces.
                result['product_name'] = clean_name
            else:
                # Also clean the AI-provided product name while preserving descriptive parentheses.
                ai_name = result['product_name']
                clean_name = re.sub(r'\s*\d+\s*[gGkKmMlLsS]+\b', '', ai_name)
                clean_name = re.sub(r'\s*\([^)]*[0-9]+[^)]*\)\s*', '', clean_name)  # Only remove size-related parentheses.
                clean_name = re.sub(r'\s*bulk\s*kg\s*', '', clean_name, flags=re.IGNORECASE)  # Remove "bulk kg".
                clean_name = re.sub(r'\s+', ' ', clean_name).strip()
                result['product_name'] = clean_name

            # MINIMAL CORRECTIONS - Only fix obvious AI errors and preserve correct AI responses.
            logger.debug(f"Before corrections - Brand: '{result.get('brand_name')}', Product: '{result.get('product_name')}', Variety: '{result.get('variety')}'")
            
            # Only apply corrections if there are genuine errors; do not override correct AI responses.
            corrected_result = self.corrections.apply_minimal_corrections(result, original_name)
            
            logger.debug(f"After corrections - Brand: '{corrected_result.get('brand_name')}', Product: '{corrected_result.get('product_name')}', Variety: '{corrected_result.get('variety')}'")
            
            return corrected_result
            
        except Exception as e:
            logger.debug(f"❌ Parsing error: {e}")
            return {}
            
        except Exception as e:
            logger.debug(f"❌ Parsing error: {e}")
            return {}
            
    def _create_failed_result(self, product_name: str, price: str, image_url: str) -> Dict:
        """
        Create a result when AI fails with intelligent fallback classification.
        Enhanced to provide better results even when AI fails.
        """
        # Clean product name (remove size info for failed cases).
        clean_name = re.sub(r'\s*\d+\s*[gGkKmMlL]+\s*', '', product_name)
        clean_name = re.sub(r'\s*\([^)]*\)\s*', '', clean_name).strip()
        
        # Try to infer product type from name keywords as a fallback.
        product_type = "Unknown"
        variety = None
        brand_name = None
        
        # Keyword-based classification as an emergency fallback.
        name_lower = product_name.lower()
        
        # Basic product type detection
        if any(word in name_lower for word in ['rice', 'basmati', 'samba']):
            product_type = "Rice"
        elif any(word in name_lower for word in ['dhal', 'dal', 'lentil']):
            product_type = "Lentil"
        elif any(word in name_lower for word in ['flour', 'wheat flour', 'atta']):
            product_type = "Flour"
        elif any(word in name_lower for word in ['sugar', 'brown sugar', 'white sugar']):
            product_type = "Sugar"
        elif any(word in name_lower for word in ['oil', 'coconut oil', 'sunflower oil']):
            product_type = "Oil"
        elif any(word in name_lower for word in ['milk', 'coconut milk']):
            product_type = "Beverage" if 'coconut' in name_lower else "Dairy"
        elif any(word in name_lower for word in ['egg', 'eggs']):
            product_type = "Eggs"
        elif any(word in name_lower for word in ['biscuit', 'cookie', 'cracker']):
            product_type = "Biscuit"
        elif any(word in name_lower for word in ['noodles', 'pasta', 'mee']):
            product_type = "Noodles"
        elif any(word in name_lower for word in ['bar', 'grain bar', 'snack bar']):
            product_type = "Snack Bar"
        elif any(word in name_lower for word in ['spice', 'pepper', 'cinnamon', 'cardamom']):
            product_type = "Spice"
        
        # Try to extract size
        size_match = re.search(r'(\d+(?:\.\d+)?)\s*([gGkKmMlLsS]+|pieces?)', product_name)
        size = size_match.group(0) if size_match else None
        
        # Convert bulk kg to 1kg
        if 'bulk kg' in name_lower:
            size = "1kg"
        
        logger.debug("Emergency fallback classification applied", extra={"product_name": product_name, "guessed_product_type": product_type})
        
        return {
            "product_type": product_type, 
            "brand_name": brand_name,
            "product_name": clean_name if clean_name else "Classification Failed",
            "size": size,
            "variety": variety,
            "price": price,
            "image_url": image_url,
            "original_name": product_name,
            "error": "AI models failed - using emergency fallback classification",
            "model_used": "EMERGENCY_FALLBACK"
        }

    def process_products_json(self, input_file: str, output_file: str):
        """
        Process products with smart model fallback
        """
        logger.info(f"Loading products from {input_file}", extra={"input_file": input_file})
        
        try:
            with open(input_file, 'r', encoding='utf-8') as f:
                products = json.load(f)
        except Exception as e:
            logger.error(f"Error loading file: {e}", extra={"error": str(e)})
            return
        
        logger.info(f"Found {len(products)} products to process", extra={"products_count": len(products)})
        logger.info("Starting enhanced AI classification with model cascade")
        logger.debug("Model Cascade: Groq -> OpenRouter -> Gemini -> Cerebras (APIs)")
        
        classified_products = []
        start_time = time.time()
        
        for i, product in enumerate(products, 1):
            logger.debug(f"Product {i}/{len(products)} - Enhanced Model Cascade", extra={"index": i, "total": len(products)})
            
            product_name = product.get('product_name', '')
            price = product.get('price', '')
            image_url = product.get('image_url', '')
            
            # AI classification with enhanced cascade
            classified = self.classify_product_ai_only(product_name, price, image_url)
            classified_products.append(classified)
            
            # Optimized delay - shorter for better speed
            if i < len(products):
                logger.debug("⏳ Quick pause for optimization...")
                time.sleep(1)  # Reduced to 1 second for API speed
        
        # Performance metrics
        total_time = time.time() - start_time
        avg_time = total_time / len(products)
        
        # Save with EXACT SAME format as original
        logger.info(f"Saving results with fixed JSON format to {output_file}", extra={"output_file": output_file})
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(classified_products, f, indent=2, ensure_ascii=False)
          # Enhanced summary with model usage stats and load balancer info
        successful = len([p for p in classified_products if p.get('product_type') != 'AI_FAILED'])
        failed = len(classified_products) - successful
        
        logger.info(f"AI Classification Complete", extra={"total_time": f"{total_time:.1f}s", "avg_time": f"{avg_time:.1f}s", "successful": successful, "failed": failed})
        logger.info("Model Usage Stats", extra={"groq": self.model_usage_stats['groq'], "openrouter": self.model_usage_stats['openrouter'], "gemini": self.model_usage_stats['gemini'], "cerebras": self.model_usage_stats['cerebras'], "failed": self.model_usage_stats['failed']})
        logger.info(f"Results saved to: {output_file}", extra={"output_file": output_file})

    def debug_cache_state(self):
        """Debug method to understand current cache state"""
        if not self.enable_cache or not self.cache:
            logger.debug("Cache is disabled")
            return
        
        cache_entries = [{"key": key, "original_name": entry.get('original_name', 'N/A'), "timestamp": entry.get('timestamp', 'N/A'), "product_type": entry.get('result', {}).get('product_type', 'N/A')} for key, entry in self.cache.cache.items()]
        logger.debug("Cache debug information", extra={"cache_file": self.cache.cache_file, "total_entries": len(self.cache.cache), "entries": cache_entries[:10]})
        
        # Show stats
        stats = self.get_cache_stats()
        if stats.get('cache_enabled'):
            logger.debug("Cache statistics", extra={"hits": stats.get('hits', 0), "misses": stats.get('misses', 0), "hit_rate": f"{stats.get('hit_rate', 0):.1%}"})

    def force_clear_cache_and_restart(self):
        """Force clear cache and restart fresh - useful for debugging"""
        if not self.enable_cache or not self.cache:
            logger.debug("Cache is disabled")
            return
        
        logger.info("Force clearing cache")
        self.cache.clear_cache()
        logger.debug("Cache cleared successfully")
        logger.debug("Cache state after clearing:")
        self.debug_cache_state()
    
# === CACHE MANAGEMENT METHODS ===
    
    def get_cache_stats(self) -> Dict:
        """Get cache statistics and performance metrics"""
        if not self.enable_cache or not self.cache:
            return {'cache_enabled': False, 'message': 'Cache is disabled'}
        
        return self.cache.get_cache_stats()
    
    def get_cache_suggestions(self, product_name: str, limit: int = 5) -> List[Dict]:
        """Get fuzzy matching suggestions from cache"""
        if not self.enable_cache or not self.cache:
            return []
        
        return self.cache.get_cache_suggestions(product_name, limit)
    
    def get_all_cache_entries(self) -> List[Dict]:
        """Get all cache entries for inspection"""
        if not self.enable_cache or not self.cache:
            return []
        
        return self.cache.get_all_cache_entries()
    
    def update_cache_entry(self, cache_key: str, updated_result: Dict) -> bool:
        """Update an existing cache entry"""
        if not self.enable_cache or not self.cache:
            return False
        
        return self.cache.update_cache_entry(cache_key, updated_result)
    
    def delete_cache_entry(self, cache_key: str) -> bool:
        """Delete a specific cache entry"""
        if not self.enable_cache or not self.cache:
            return False
        
        return self.cache.delete_cache_entry(cache_key)
    
    def cleanup_cache(self) -> int:
        """Clean up expired cache entries"""
        if not self.enable_cache or not self.cache:
            return 0
        
        return self.cache.cleanup_expired_entries()
    
    def clear_cache(self):
        """Clear all cache entries"""
        if not self.enable_cache or not self.cache:
            return
        
        self.cache.clear_cache()
    
    def configure_cache_thresholds(self, similarity_threshold: float = None, 
                                 fuzzy_threshold: float = None, 
                                 max_age_days: int = None):
        """Configure cache thresholds"""
        if not self.enable_cache or not self.cache:
            return        
        self.cache.configure_thresholds(similarity_threshold, fuzzy_threshold, max_age_days)
    
    def get_cache_config(self):
        """Get current cache configuration"""
        if not self.enable_cache or not self.cache:
            return {
                'similarity_threshold': 0.85,
                'fuzzy_threshold': 0.6,
                'max_age_days': 30
            }
        
        return self.cache.get_config()
# === LOAD BALANCER MANAGEMENT METHODS ===
    
    def get_groq_load_balancer_stats(self) -> Dict:
        """Get Groq load balancer statistics"""
        if hasattr(self.groq_handler, 'get_load_balancer_stats'):
            return self.groq_handler.get_load_balancer_stats()
        return {"status": "not_available", "message": "Load balancer not available"}
    
    def print_groq_load_balancer_stats(self):
        """Print formatted Groq load balancer statistics"""
        if hasattr(self.groq_handler, 'print_load_balancer_stats'):
            self.groq_handler.print_load_balancer_stats()
        else:
            logger.warning("Load balancer statistics not available")
    
    def reset_groq_usage_stats(self):
        """Reset Groq usage statistics"""
        if hasattr(self.groq_handler, 'reset_usage_stats'):
            self.groq_handler.reset_usage_stats()
        else:
            logger.warning("Load balancer reset not available")
    
    def configure_groq_load_balance_strategy(self, strategy: str):
        """
        Configure Groq load balancing strategy
        
        Args:
            strategy: "round_robin" or "least_used"
        """
        if strategy in ["round_robin", "least_used"]:
            self.api_config['groq_load_balance_strategy'] = strategy
            logger.info(f"Groq load balancing strategy set to: {strategy}", extra={"strategy": strategy})
        else:
            logger.warning("Invalid strategy. Use 'round_robin' or 'least_used'", extra={"provided_strategy": strategy})
    
    def get_enhanced_model_usage_stats(self) -> Dict:
        """Get enhanced model usage stats including load balancer info"""
        stats = self.model_usage_stats.copy()
        
        return stats

    def _extract_size_from_name(self, product_name: str) -> str:
        """Extract size/weight information from product name"""
        import re
        
        if not product_name:
            return ""
        
        # Look for size patterns like 500g, 1kg, 250ml, storage sizes, etc.
        size_patterns = [
            # Storage/memory sizes (for electronics)
            r'\b(\d+(?:\.\d+)?\s*(?:GB|TB|MB))\b',
            # Weight patterns
            r'\b(\d+(?:\.\d+)?\s*(?:kg|kilogram|kilograms))\b',
            r'\b(\d+(?:\.\d+)?\s*(?:g|gram|grams))\b',
            # Volume patterns
            r'\b(\d+(?:\.\d+)?\s*(?:l|liter|liters|litre|litres))\b',
            r'\b(\d+(?:\.\d+)?\s*(?:ml|milliliter|milliliters))\b',
            # Other measurements
            r'\b(\d+(?:\.\d+)?\s*(?:oz|ounce|ounces))\b',
            r'\b(\d+(?:\.\d+)?\s*(?:lb|pound|pounds))\b',
            # Pieces/counts
            r'\b(\d+(?:\.\d+)?\s*(?:pcs|pieces|piece))\b',
            r'\b(\d+)S\b',  # Special case for "10S" = 10 pieces
            # Screen sizes (for electronics)
            r'\b(\d+(?:\.\d+)?)\s*(?:inch|inches|")\b'
        ]
        
        for pattern in size_patterns:
            match = re.search(pattern, product_name, re.IGNORECASE)
            if match:
                # Handle special case for "S" notation
                if pattern.endswith(r'S\b'):
                    return f"{match.group(1)} pieces"
                
                # Normalize the size format
                size = match.group(1).strip()
                size = re.sub(r'\s+', ' ', size)  # Normalize spaces
                return size
        
        # Check for "bulk kg" special case
        if re.search(r'\bbulk\s*kg\b', product_name, re.IGNORECASE):
            return "1kg"
        
        return ""

if __name__ == "__main__":
    # Example usage - you can test the classifier here
    logger.info("Smart Fallback AI Classifier with Intelligent Cache")
    logger.info("Model Cascade: Groq -> OpenRouter -> Gemini -> Cerebras")
    logger.debug("Local models removed - using online APIs only")
    logger.info("Intelligent caching enabled for speed boost")
