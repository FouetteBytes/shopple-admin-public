"""
OpenRouter API Handler for AI Product Classification
Handles OpenRouter API communication with optimized models and settings
"""

import os
import sys
import json
import re
import requests
from typing import Tuple, Dict, Any

from backend.services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)


class OpenRouterHandler:
    """
    Handles OpenRouter API communication for product classification
    """
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv('OPENROUTER_API_KEY')
        self.base_url = "https://openrouter.ai/api/v1/chat/completions"
        self.conversation_history = []  # Store conversation for memory
        
        # Headers for OpenRouter
        self.headers = {
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/product-classifier",
            "X-Title": "AI Product Classifier"
        }
        
        if self.api_key:
            self.headers["Authorization"] = f"Bearer {self.api_key}"
            logger.info("OpenRouter client initialized successfully")
        else:
            logger.error("No OpenRouter API key found")
    
    def is_available(self) -> bool:
        """Check if OpenRouter API is available"""
        return self.api_key is not None
    def add_system_instruction(self, instruction: str):
        """
        Add system instruction to conversation history
        This maintains context across multiple requests
        """
        if not self.conversation_history:  # Only add if not already present
            self.conversation_history.append({
                "role": "system",
                "content": instruction
            })
            logger.debug("System instruction added to conversation memory")
    def classify_product(self, prompt: str, use_memory: bool = True, model_override: str = None, system_prompt: str = None, request_timeout: float | None = None) -> Tuple[str, str]:
        """
        Classify product using OpenRouter API with optimized model
        
        Args:
            prompt: The classification prompt (user message)
            use_memory: Whether to use conversation memory (default: True)
            model_override: Override default model (for fallback)
            system_prompt: System prompt to use when not using memory
        
        Returns:
            Tuple of (response, status)
        """
        if not self.is_available():
            return "", "OPENROUTER_NO_KEY"
          # Choose model - primary or fallback
        model = model_override or "deepseek/deepseek-r1-0528:free"
        if "deepseek" in model:
            model_name = "deepseek-r1"
        elif "qwen3-30b" in model:
            model_name = "qwen3-30b"
        elif "qwen3" in model:
            model_name = "qwen3"
        else:
            model_name = "unknown"
        
        try:
            logger.info("Trying OpenRouter API", extra={"model": model_name})
            
            # Prepare messages
            if use_memory and self.conversation_history:
                # Use conversation memory - system instruction should already be in history
                messages = self.conversation_history + [{"role": "user", "content": prompt}]
                logger.debug("Using conversation memory", extra={"history_length": len(self.conversation_history)})
            else:
                # Single request without memory or fresh conversation
                if system_prompt:
                    # Use provided system prompt
                    messages = [
                        {
                            "role": "system",
                            "content": system_prompt
                        },
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ]
                else:
                    # Fallback to simple system prompt
                    messages = [
                        {
                            "role": "system",
                            "content": "You are an expert product classifier. Follow the format exactly as requested. Return ONLY the 5 lines in the exact format requested. Do NOT include <think> tags, reasoning, explanations, or any other text. Just the 5 classification lines."
                        },
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ]
            
            # Prepare request data
            data = {
                "model": model,
                "messages": messages,
                "temperature": 0.1,  # Low temperature for consistent classification
                "max_tokens": 800,   # Increased for detailed responses
                "top_p": 0.95
            }
            
            # Make API call
            timeout_seconds = float(request_timeout) if request_timeout is not None else 60
            response = requests.post(
                self.base_url,
                headers=self.headers,
                json=data,                timeout=timeout_seconds  # Allow override for tests
            )
            
            if response.status_code == 200:
                result = response.json()
                if 'choices' in result and len(result['choices']) > 0:
                    ai_response = result['choices'][0]['message']['content']
                    
                    # Clean the response to remove reasoning and formatting issues
                    cleaned_response = self._clean_response(ai_response)
                    
                    # Update conversation history if using memory
                    if use_memory:
                        self.conversation_history.append({"role": "user", "content": prompt})
                        self.conversation_history.append({"role": "assistant", "content": cleaned_response})
                        # Keep history manageable (last 10 exchanges)
                        if len(self.conversation_history) > 21:  # 1 system + 20 exchanges
                            self.conversation_history = [self.conversation_history[0]] + self.conversation_history[-20:]
                    
                    logger.info("OpenRouter API successful", extra={"response_length": len(cleaned_response)})
                    return cleaned_response, "OPENROUTER"
                else:
                    logger.warning("OpenRouter API: No response choices")
                    return "", "OPENROUTER_NO_RESPONSE"
            else:
                if response.status_code == 429:
                    logger.warning("Rate limit exceeded - consider upgrading or waiting", extra={"status_code": response.status_code})
                elif response.status_code == 401:
                    logger.error("Authentication failed - check API key", extra={"status_code": response.status_code})
                else:
                    logger.error("OpenRouter API error", extra={"status_code": response.status_code})
                return "", "OPENROUTER_ERROR"
                
        except requests.exceptions.Timeout:
            logger.warning("OpenRouter API timeout")
            return "", "OPENROUTER_TIMEOUT"
        except Exception as e:
            log_error(logger, e, {"context": "OpenRouter API exception"})
            return "", "OPENROUTER_ERROR"
    
    def reset_conversation(self):
        """Reset the conversation history"""
        self.conversation_history = []
        if self.system_instruction:
            self.conversation_history.append({"role": "system", "content": self.system_instruction})
        logger.info("Conversation history reset")
    
    def get_conversation_length(self) -> int:
        """Get current conversation length"""
        return len(self.conversation_history)
    def get_model_info(self, model: str = None) -> Dict[str, Any]:
        """Get information about the specified model"""
        current_model = model or "deepseek/deepseek-r1-0528:free"
        
        if "deepseek" in current_model:
            return {
                "model": "deepseek/deepseek-r1-0528:free",
                "provider": "DeepSeek",
                "tier": "Free",
                "features": ["Reasoning", "Fast inference", "Good quality"]
            }
        elif "qwen3-30b" in current_model:
            return {
                "model": "qwen/qwen3-30b:free",
                "provider": "Alibaba Cloud",
                "tier": "Free",
                "features": ["Large context", "High quality", "Multilingual"]
            }
        else:
            return {
                "model": current_model,
                "provider": "Unknown",
                "tier": "Unknown",
                "features": ["General purpose"]
            }
    
    def _clean_response(self, response: str) -> str:
        """
        Clean the AI response to remove reasoning and unwanted content
        """
        
        # Remove <think> tags and their content
        cleaned = re.sub(r'<think>.*?</think>', '', response, flags=re.DOTALL)
        
        # Remove any remaining <think> or </think> tags
        cleaned = re.sub(r'</?think>', '', cleaned)
        
        # Extract only the classification lines (PRODUCT_TYPE through VARIETY)
        lines = cleaned.split('\n')
        classification_lines = []
        
        for line in lines:
            line = line.strip()
            if any(prefix in line for prefix in ['PRODUCT_TYPE:', 'BRAND_NAME:', 'PRODUCT_NAME:', 'SIZE:', 'VARIETY:']):
                classification_lines.append(line)
        
        if classification_lines:
            # Return only the classification lines
            return '\n'.join(classification_lines)
        else:
            # Fallback to original response if we can't parse it
            return cleaned.strip()
