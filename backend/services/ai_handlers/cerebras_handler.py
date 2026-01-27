"""
Cerebras API Handler for AI Product Classification
Handles Cerebras Cloud SDK communication with optimized models and settings
"""

import os
import sys
from typing import Tuple, Dict, Any

from backend.services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)
import re

try:
    from cerebras.cloud.sdk import Cerebras
    CEREBRAS_AVAILABLE = True
except ImportError:
    CEREBRAS_AVAILABLE = False


class CerebrasHandler:
    """
    Handles Cerebras API communication for product classification
    Uses Qwen-3-32B model with high performance inference
    """
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv('CEREBRAS_API_KEY')
        self.client = None
        self.conversation_history = []
        
        if not CEREBRAS_AVAILABLE:
            logger.error("Cerebras: cerebras-cloud-sdk package not installed", extra={"install_command": "pip install cerebras-cloud-sdk"})
            return
            
        if not self.api_key or self.api_key == 'your_cerebras_api_key_here':
            logger.error("Cerebras: No API key provided")
            return
            
        try:
            self.client = Cerebras(api_key=self.api_key)
            logger.info("Cerebras client initialized")
        except Exception as e:
            log_error(logger, e, {"context": "Failed to initialize Cerebras client"})
            self.client = None
    
    def is_available(self) -> bool:
        """Check if Cerebras API client is available"""
        return CEREBRAS_AVAILABLE and self.client is not None and self.api_key and self.api_key != 'your_cerebras_api_key_here'
    
    def add_system_instruction(self, instruction: str):
        """
        Add system instruction to conversation history
        This maintains context across multiple requests
        """
        if not self.conversation_history:
            self.conversation_history.append({
                "role": "system",
                "content": instruction
            })
            logger.debug("Cerebras: System instruction added", extra={"chars": len(instruction)})
        else:
            # Update existing system instruction
            if self.conversation_history[0]["role"] == "system":
                self.conversation_history[0]["content"] = instruction
                logger.debug("Cerebras: System instruction updated", extra={"chars": len(instruction)})
            else:
                # Insert at the beginning
                self.conversation_history.insert(0, {
                    "role": "system", 
                    "content": instruction
                })
                logger.debug("Cerebras: System instruction inserted", extra={"chars": len(instruction)})
    
    def classify_product(self, prompt: str, use_memory: bool = True, system_prompt: str = None, use_structured_output: bool = False, disable_streaming: bool = False, request_timeout: float | None = None, model_override: str = None) -> Tuple[str, str]:
        """
        Classify product using Cerebras API with separate system and user messages
        
        Args:
            prompt: The product name (user message)
            use_memory: Whether to use conversation memory (default: True)
            system_prompt: The system prompt with instructions (if not using memory)
            use_structured_output: Whether to use structured JSON output (default: False for compatibility)
            disable_streaming: Whether to disable streaming (default: False)
            model_override: Optional model ID to override default
        
        Returns:
            Tuple of (response, status)
        """
        if not self.is_available():
            return "", "CEREBRAS_NO_CLIENT"
        
        try:
            # Prefer passed model, then env var, otherwise fail
            model = model_override or os.getenv('CEREBRAS_MODEL')
            if not model:
                raise ValueError("No model specified for Cerebras. Please configure a default model or provide one.")
                
            logger.info("Trying Cerebras API", extra={"model": model})
            
            # Prepare messages - consistent with other handlers
            user_message = prompt
            
            if use_memory and self.conversation_history:
                # Use conversation memory - system prompt already cached
                messages = self.conversation_history + [{"role": "user", "content": user_message}]
                logger.debug("Using conversation memory (system instruction cached)")
            else:
                # Single request without memory - use provided system prompt or default (consistent with Groq/OpenRouter)
                if not system_prompt:
                    # Default system prompt matching Groq/OpenRouter format
                    system_prompt = "You are an expert product classifier. Follow the format exactly as requested. Return ONLY the 5 lines in the exact format requested. Do NOT include <think> tags, reasoning, explanations, or any other text. Just the 5 classification lines."
                
                messages = [
                    {
                        "role": "system",
                        "content": system_prompt
                    },
                    {
                        "role": "user",
                        "content": user_message
                    }
                ]
            
            logger.debug("Getting response from Cerebras")
            ai_response = ""
            
            # Use text format by default (like Groq/OpenRouter) for consistency
            if disable_streaming:
                logger.debug("Using non-streaming response format")
                response = self.client.chat.completions.create(
                    messages=messages,
                    model="qwen-3-32b",  # High-performance reasoning model
                    stream=False,
                    max_completion_tokens=1000,  # Reasonable limit for text responses
                    temperature=0.1,  # Consistent with other handlers
                    top_p=0.95,
                    # No response_format - use regular text output like other handlers
                )
                ai_response = response.choices[0].message.content
                logger.debug("Received non-streaming response", extra={"chars": len(ai_response)})
            else:
                logger.debug("Streaming response from Cerebras")
                stream = self.client.chat.completions.create(
                    messages=messages,
                    model="qwen-3-32b",  # High-performance reasoning model
                    stream=True,
                    max_completion_tokens=1000,
                    temperature=0.1,  # Consistent with other handlers
                    top_p=0.95
                    # No response_format - use regular text output like other handlers
                )
                
                # Collect streaming response
                for chunk in stream:
                    if chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        ai_response += content

            
            if ai_response:
                # Clean and format the response (no JSON parsing needed)
                cleaned_response = self._clean_response(ai_response)
                
                # Update conversation history if using memory
                if use_memory:
                    self.conversation_history.append({"role": "user", "content": user_message})
                    self.conversation_history.append({"role": "assistant", "content": cleaned_response})
                    # Keep history manageable
                    if len(self.conversation_history) > 21:  # 1 system + 20 exchanges
                        self.conversation_history = [self.conversation_history[0]] + self.conversation_history[-20:]
                        logger.debug("Cerebras: Conversation history pruned to prevent token overflow")
                
                logger.info("Cerebras API successful")
                return cleaned_response, "CEREBRAS"
            else:
                logger.warning("Cerebras API: No response generated")
                return "", "CEREBRAS_NO_RESPONSE"
                
        except Exception as e:
            log_error(logger, e, {"context": "Cerebras API exception"})
            return "", "CEREBRAS_ERROR"
    
    def reset_conversation(self):
        """Reset conversation history"""
        self.conversation_history = []
        logger.info("Cerebras conversation history reset")
    
    def get_conversation_length(self) -> int:
        """Get current conversation length"""
        return len(self.conversation_history)
    
    def _clean_response(self, response: str) -> str:
        """
        Clean the AI response to remove reasoning/thinking content and extract only classification
        Handles Qwen-3-32B reasoning mode output properly
        """
        # Remove any thinking tags if present (some models use these)
        cleaned = re.sub(r'<think>.*?</think>', '', response, flags=re.DOTALL)
        
        # Remove any remaining <think> or </think> tags
        cleaned = re.sub(r'</?think>', '', cleaned)
        
        # Handle Qwen-3-32B reasoning mode: Look for the actual classification after thinking
        # The thinking usually appears before the classification
        lines = cleaned.split('\n')
        classification_lines = []
        found_classification_start = False
        
        for line in lines:
            line = line.strip()
            
            # Check if this line is a classification field
            if any(prefix in line for prefix in ['PRODUCT_TYPE:', 'BRAND_NAME:', 'PRODUCT_NAME:', 'SIZE:', 'VARIETY:']):
                classification_lines.append(line)
                found_classification_start = True
            # Once we start finding classification lines, stop if we hit other content
            elif found_classification_start and line and not line.startswith(('PRODUCT_TYPE:', 'BRAND_NAME:', 'PRODUCT_NAME:', 'SIZE:', 'VARIETY:')):
                # Stop collecting if we hit non-classification content after starting classification
                break
        
        if classification_lines:
            # Return only the classification lines
            result = '\n'.join(classification_lines)
            logger.debug("Cerebras: Extracted classification lines", extra={"count": len(classification_lines)})
            return result
        else:
            # Enhanced fallback: Try to extract from the end of the response
            # Sometimes the classification appears at the end after reasoning
            result = self._extract_classification_from_end(response)
            if result:
                return result
            
            # Final fallback - return cleaned response
            logger.warning("Cerebras: Could not parse classification format, returning raw response")
            return cleaned.strip()
    
    def _extract_classification_from_end(self, response: str) -> str:
        """
        Extract classification from the end of response (fallback method)
        """
        lines = response.split('\n')
        
        # Look for classification lines from the end backwards
        classification_lines = []
        for line in reversed(lines):
            line = line.strip()
            if any(prefix in line for prefix in ['PRODUCT_TYPE:', 'BRAND_NAME:', 'PRODUCT_NAME:', 'SIZE:', 'VARIETY:']):
                classification_lines.insert(0, line)  # Insert at beginning to maintain order
            elif classification_lines:
                # Stop if we found classification lines and hit non-classification content
                break
        
        if len(classification_lines) >= 3:  # At least 3 fields should be present
            logger.debug("Cerebras: Extracted classification from end", extra={"lines": len(classification_lines)})
            return '\n'.join(classification_lines)
        
        return ""
    
    def _format_structured_response(self, response: str) -> str:
        """
        Format JSON response from Cerebras into the expected text format
        """
        try:
            import json
            # Parse the JSON response
            data = json.loads(response.strip())
            logger.debug("Cerebras: Successfully parsed JSON response")
            
            # Convert to expected text format - handle different field name formats
            formatted_lines = []
            
            # Handle both PRODUCT_TYPE and product_type formats
            product_type = data.get('PRODUCT_TYPE') or data.get('product_type') or 'None'
            brand_name = data.get('BRAND_NAME') or data.get('brand_name') or 'None'
            product_name = data.get('PRODUCT_NAME') or data.get('product_name') or 'None'
            size = data.get('SIZE') or data.get('size') or 'None'
            variety = data.get('VARIETY') or data.get('variety') or 'None'
            
            formatted_lines.append(f"PRODUCT_TYPE: {product_type}")
            formatted_lines.append(f"BRAND_NAME: {brand_name}")
            formatted_lines.append(f"PRODUCT_NAME: {product_name}")
            formatted_lines.append(f"SIZE: {size}")
            formatted_lines.append(f"VARIETY: {variety}")
            
            result = '\n'.join(formatted_lines)
            logger.debug("Cerebras: Converted JSON to text format")
            return result
            
        except json.JSONDecodeError as e:
            logger.warning("Cerebras: JSON parsing failed", extra={"error": str(e)})
            logger.debug("Raw response preview", extra={"preview": response[:200]})
            # Fallback to regular cleaning
            return self._clean_response(response)
        except Exception as e:
            logger.warning("Cerebras: JSON formatting failed", extra={"error": str(e)})
            # Fallback to regular cleaning
            return self._clean_response(response)

    def get_model_info(self) -> dict:
        """Get information about the Cerebras model"""
        return {
            "model": "qwen-3-32b",
            "provider": "Cerebras",
            "tier": "Cloud",
            "features": ["Ultra-fast inference", "High quality", "Streaming", "32B parameters"]
        }
