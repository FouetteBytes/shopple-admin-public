"""
Groq API Handler for AI Product Classification
Handles Groq API communication with optimized models and settings
Enhanced with multiple API key load balancing for cost distribution
"""

import os
import sys
from typing import Tuple, List, Dict
from groq import Groq
import re
import random

from backend.services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)


class GroqHandler:
    """
    Handles Groq API communication for product classification
    Enhanced with multiple API key load balancing
    """
    
    def __init__(self, api_key: str = None, api_keys: List[str] = None):
        # Support both single key and multiple keys
        self.api_keys = []
        self.clients = {}
        self.current_key_index = 0
        self.key_usage_stats = {}
        self.conversation_histories = {}  # Separate history per key
        
        # Initialize API keys
        if api_keys:
            # Multiple keys provided
            self.api_keys = [key for key in api_keys if key and key.strip()]
        elif api_key:
            # Single key provided
            self.api_keys = [api_key]
        else:
            # Try to load from environment
            self._load_keys_from_env()
        
        # Initialize clients for each key
        self._initialize_clients()
    
    def _load_keys_from_env(self):
        """Load Groq API keys from environment variables"""
        # Try multiple environment variable patterns
        env_patterns = [
            'GROQ_API_KEY',
            'GROQ_API_KEY_1', 'GROQ_API_KEY_2', 'GROQ_API_KEY_3',
            'GROQ_KEY_1', 'GROQ_KEY_2', 'GROQ_KEY_3'
        ]
        
        for pattern in env_patterns:
            key = os.getenv(pattern)
            if key and key.strip() and not key.startswith('your_'):
                self.api_keys.append(key.strip())
        
        # Remove duplicates while preserving order
        seen = set()
        unique_keys = []
        for key in self.api_keys:
            if key not in seen:
                seen.add(key)
                unique_keys.append(key)
        self.api_keys = unique_keys
    
    def _initialize_clients(self):
        """Initialize Groq clients for each API key"""
        successful_keys = []
        
        for i, api_key in enumerate(self.api_keys):
            try:
                client = Groq(api_key=api_key)
                key_id = f"key_{i+1}"
                self.clients[key_id] = {
                    'client': client,
                    'api_key': api_key,
                    'masked_key': f"{api_key[:4]}...{api_key[-2:]}" if len(api_key) > 8 else "***"
                }
                self.key_usage_stats[key_id] = {
                    'requests': 0,
                    'successes': 0,
                    'failures': 0,
                    'total_tokens': 0
                }
                self.conversation_histories[key_id] = []
                successful_keys.append(key_id)
                logger.info(f"Groq client {i+1} initialized", extra={"key_id": key_id})
            except Exception as e:
                log_error(logger, e, {"context": f"Failed to initialize Groq client {i+1}"})
        
        if successful_keys:
            logger.info("Groq Load Balancer initialized", extra={"active_keys": len(successful_keys), "distribution": "even"})
        else:
            logger.error("No valid Groq API keys found")
    
    def is_available(self) -> bool:
        """Check if any Groq API client is available"""
        return len(self.clients) > 0
    
    def _get_next_client(self) -> Tuple[str, Dict]:
        """
        Get next client using round-robin load balancing
        Returns: (key_id, client_info)
        """
        if not self.clients:
            return None, None
        
        # Round-robin selection
        client_keys = list(self.clients.keys())
        key_id = client_keys[self.current_key_index % len(client_keys)]
        self.current_key_index += 1
        
        return key_id, self.clients[key_id]
    
    def _get_least_used_client(self) -> Tuple[str, Dict]:
        """
        Get client with least usage for better load balancing
        Returns: (key_id, client_info)
        """
        if not self.clients:
            return None, None
        
        # Find key with minimum requests
        min_requests = float('inf')
        selected_key = None
        
        for key_id in self.clients.keys():
            requests = self.key_usage_stats[key_id]['requests']
            if requests < min_requests:
                min_requests = requests
                selected_key = key_id
        
        return selected_key, self.clients[selected_key]
    
    def add_system_instruction(self, instruction: str, key_id: str = None):
        """
        Add system instruction to conversation history
        This maintains context across multiple requests
        
        Args:
            instruction: System instruction to add
            key_id: Specific key ID to add instruction to (if None, adds to all)
        """
        if key_id:
            # Add to the specific key.
            if key_id in self.conversation_histories and not self.conversation_histories[key_id]:
                self.conversation_histories[key_id].append({
                    "role": "system",
                    "content": instruction
                })
                logger.debug("Groq: System instruction added", extra={"key_id": key_id})
        else:
            # Add to all keys that do not have a system instruction yet.
            for kid in self.conversation_histories.keys():
                if not self.conversation_histories[kid]:  # Only add if not already present
                    self.conversation_histories[kid].append({
                        "role": "system",
                        "content": instruction
                    })
            logger.debug("Groq: System instruction added to all clients", extra={"client_count": len(self.conversation_histories)})
    def classify_product(self, prompt: str, use_memory: bool = True, model_override: str = None, 
                       load_balance_strategy: str = "round_robin", system_prompt: str = None) -> Tuple[str, str]:
        """
        Classify product using Groq API with load balancing across multiple keys
        
        Args:
            prompt: The classification prompt (user message)
            use_memory: Whether to use conversation memory (default: True)
            model_override: Override default model (for fallback)
            load_balance_strategy: "round_robin" or "least_used" (default: "round_robin")
            system_prompt: System prompt to use when not using memory
        
        Returns:
            Tuple of (response, status)
        """
        if not self.is_available():
            return "", "GROQ_NO_CLIENT"
        
        # Choose load balancing strategy
        if load_balance_strategy == "least_used":
            key_id, client_info = self._get_least_used_client()
        else:
            key_id, client_info = self._get_next_client()
        
        if not key_id or not client_info:
            return "", "GROQ_NO_CLIENT"
        
        # Update usage stats
        self.key_usage_stats[key_id]['requests'] += 1
        
        # Choose model - primary or fallback
        model = model_override or "llama-3.3-70b-versatile"
        
        try:
            logger.info("Trying Groq API", extra={"model": model, "key_id": key_id, "requests": self.key_usage_stats[key_id]['requests']})
            
            # Prepare messages using the specific key's conversation history
            conversation_history = self.conversation_histories[key_id]
            
            if use_memory and conversation_history:
                # Use conversation memory - system instruction should already be in history
                messages = conversation_history + [{"role": "user", "content": prompt}]
                logger.debug("Using conversation memory", extra={"key_id": key_id})
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
                            "content": "You are an expert product classifier. Follow the format exactly as requested. Return ONLY the 5 lines in the exact format requested. Do NOT include <think> tags, reasoning, explanations, or any other text. Just the 5 classification lines: PRODUCT_TYPE, BRAND_NAME, PRODUCT_NAME, SIZE, VARIETY."
                        },
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ]
            
            # Make API call with the selected client
            completion = client_info['client'].chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.6,
                max_tokens=4096,
                top_p=0.95,
                stream=True,
                stop=None,
            )
            
            # Handle streaming response
            ai_response = ""
            logger.debug("Streaming response from Groq")
            for chunk in completion:
                if chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    ai_response += content
            
            if ai_response:
                # Clean the response to remove reasoning and formatting issues
                cleaned_response = self._clean_response(ai_response)
                
                # Update conversation history if using memory (for the specific key)
                if use_memory:
                    conversation_history.append({"role": "user", "content": prompt})
                    conversation_history.append({"role": "assistant", "content": cleaned_response})
                    # Keep history manageable - more aggressive pruning for Groq due to rate limits
                    if len(conversation_history) > 11:  # 1 system + 10 exchanges (reduced from 21)
                        self.conversation_histories[key_id] = [conversation_history[0]] + conversation_history[-10:]
                        logger.debug("Groq: Conversation history pruned", extra={"key_id": key_id})
                
                # Update success stats
                self.key_usage_stats[key_id]['successes'] += 1
                
                logger.info("Groq API successful", extra={"key_id": key_id})
                return cleaned_response, f"GROQ({key_id})"
            else:
                self.key_usage_stats[key_id]['failures'] += 1
                logger.warning("Groq API: No response choices", extra={"key_id": key_id})
                return "", "GROQ_NO_RESPONSE"
                
        except Exception as e:
            self.key_usage_stats[key_id]['failures'] += 1
            
            # Check if it's a 500 error (Groq/Cloudflare issue)
            error_str = str(e)
            if '500' in error_str or 'Internal Server Error' in error_str or 'InternalServerError' in str(type(e)):
                logger.warning(f"Groq API 500 error (likely temporary)", extra={"key_id": key_id, "error_type": type(e).__name__})
                log_error(logger, e, {"context": "Groq API server error", "key_id": key_id})
                return "", "GROQ_SERVER_ERROR"
            
            # Other errors - log full details
            log_error(logger, e, {"context": "Groq API exception", "key_id": key_id})
            return "", "GROQ_ERROR"
    
    
    def reset_conversation(self, key_id: str = None):
        """
        Reset conversation history
        
        Args:
            key_id: Specific key ID to reset (if None, resets all)
        """
        if key_id:
            if key_id in self.conversation_histories:
                self.conversation_histories[key_id] = []
                logger.info("Groq conversation history reset", extra={"key_id": key_id})
        else:
            for kid in self.conversation_histories.keys():
                self.conversation_histories[kid] = []
            logger.info("Groq conversation history reset for all clients", extra={"client_count": len(self.conversation_histories)})
    
    def get_conversation_length(self, key_id: str = None) -> int:
        """
        Get current conversation length
        
        Args:
            key_id: Specific key ID (if None, returns total across all keys)
        """
        if key_id:
            return len(self.conversation_histories.get(key_id, []))
        else:
            return sum(len(history) for history in self.conversation_histories.values())
    
    def get_load_balancer_stats(self) -> Dict:
        """
        Get load balancer statistics showing usage across all API keys
        """
        if not self.clients:
            return {"status": "no_clients", "message": "No Groq clients available"}
        
        stats = {
            "total_clients": len(self.clients),
            "total_requests": sum(stats['requests'] for stats in self.key_usage_stats.values()),
            "clients": {}
        }
        
        for key_id, client_info in self.clients.items():
            usage = self.key_usage_stats[key_id]
            stats["clients"][key_id] = {
                "masked_key": client_info['masked_key'],
                "requests": usage['requests'],
                "successes": usage['successes'],
                "failures": usage['failures'],
                "success_rate": (usage['successes'] / max(usage['requests'], 1)) * 100,
                "conversation_length": len(self.conversation_histories[key_id])
            }
        
        return stats
    
    def print_load_balancer_stats(self):
        """Print formatted load balancer statistics"""
        stats = self.get_load_balancer_stats()
        
        if stats.get("status") == "no_clients":
            logger.warning("No Groq clients available")
            return
        
        client_details = {}
        for key_id, client_stats in stats["clients"].items():
            percentage = (client_stats['requests'] / max(stats['total_requests'], 1)) * 100
            client_details[key_id] = {  # Use key_id instead of masked_key
                "requests": client_stats['requests'],
                "percentage": f"{percentage:.1f}%",
                "successes": client_stats['successes'],
                "failures": client_stats['failures'],
                "success_rate": f"{client_stats['success_rate']:.1f}%",
                "conversation_length": client_stats['conversation_length']
            }
        
        logger.info("Groq Load Balancer Statistics", extra={
            "total_keys": stats['total_clients'],
            "total_requests": stats['total_requests'],
            "clients": client_details  # Now uses key_id as keys (safe)
        })
    
    def reset_usage_stats(self):
        """Reset usage statistics for all keys"""
        for key_id in self.key_usage_stats.keys():
            self.key_usage_stats[key_id] = {
                'requests': 0,
                'successes': 0,
                'failures': 0,
                'total_tokens': 0
            }
        logger.info("Usage statistics reset", extra={"key_count": len(self.key_usage_stats)})
    
    def _clean_response(self, response: str) -> str:
        """
        Clean the AI response to remove reasoning and unwanted content
        """
        # Remove <think> tags and their content
        cleaned = re.sub(r'<think>.*?</think>', '', response, flags=re.DOTALL)
        
        # Remove any remaining <think> or </think> tags
        cleaned = re.sub(r'</?think>', '', cleaned)
        
        # Extract only the classification lines (PRODUCT_TYPE through VARIETY)
        
        # Look for the structured output section
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
            # Fall back to the original response when parsing fails.
            return cleaned.strip()
