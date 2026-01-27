"""
Gemini API Handler for AI Product Classification
Handles Google Gemini API communication with optimized models and settings
"""

import os
import sys
from typing import Tuple
import re

from backend.services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

try:
    from google import genai
    from google.genai import types
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False


class GeminiHandler:
    """
    Handles Gemini API communication for product classification
    Uses Gemini 2.5 Pro with thinking capabilities
    """
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv('GEMINI_API_KEY')
        self.client = None
        self.conversation_history = []
        
        if not GEMINI_AVAILABLE:
            logger.error("Gemini: google-genai package not installed", extra={"install_command": "pip install google-genai"})
            return
            
        if not self.api_key or self.api_key == 'your_gemini_api_key_here':
            logger.error("Gemini: No API key provided")
            
        try:
            self.client = genai.Client(api_key=self.api_key)
            logger.info("Gemini client initialized", extra={"api_key_preview": f"{self.api_key[:8]}...{self.api_key[-4:]}"})
        except Exception as e:
            log_error(logger, e, {"context": "Failed to initialize Gemini client"})
            self.client = None
    
    def is_available(self) -> bool:
        """Check if Gemini API client is available"""
        return GEMINI_AVAILABLE and self.client is not None and self.api_key and self.api_key != 'your_gemini_api_key_here'
    
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
            logger.debug("Gemini: System instruction added")
    
    def classify_product(self, prompt: str, use_memory: bool = True, system_prompt: str = None, model_override: str = None, request_timeout: float | None = None, disable_streaming: bool = False) -> Tuple[str, str]:
        """
        Classify product using Gemini API
        
        Args:
            prompt: The product name (user message)
            use_memory: Whether to use conversation memory (default: True)
            system_prompt: System prompt to use when not using memory
        
        Returns:
            Tuple of (response, status)
        """
        if not self.is_available():
            return "", "GEMINI_NO_CLIENT"
        
        try:
            # Choose model: allow override via UI
            model_name = model_override or "gemini-2.5-pro"
            logger.info("Trying Gemini API", extra={"model": model_name})
            
            # Create content for Gemini - include minimal history if using memory
            contents = []
            if use_memory and self.conversation_history:
                # Map stored history to Gemini Content objects (system handled via system_instruction).
                for msg in self.conversation_history:
                    role = msg.get("role")
                    if role == "system":
                        continue
                    content_text = str(msg.get("content", "")).strip()
                    if not content_text:
                        continue
                    contents.append(
                        types.Content(
                            role="user" if role == "user" else "model",
                            parts=[types.Part.from_text(text=content_text)],
                        )
                    )
            # Append current user message last
            contents.append(
                types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=prompt)],
                )
            )
            
            # Configure generation with thinking capabilities and system instruction
            generate_content_config = types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(
                    thinking_budget=-1,  # Unlimited thinking budget
                ),
                response_mime_type="text/plain",
                temperature=0.1,  # Low temperature for consistent output
                max_output_tokens=1000,
            )
            
            # Add system instruction if using memory or if system_prompt provided
            if use_memory and self.conversation_history:
                # For memory mode, pass the cached system instruction explicitly
                first = self.conversation_history[0]
                if isinstance(first, dict) and first.get("role") == "system" and first.get("content"):
                    generate_content_config.system_instruction = first["content"]
                    logger.debug("Using conversation memory (system instruction applied)")
                else:
                    logger.warning("Conversation history missing system instruction; proceeding without it")
            elif system_prompt:
                # Use system_instruction parameter for fresh conversations
                generate_content_config.system_instruction = system_prompt
                logger.debug("Using system instruction parameter for classification rules")
            
            # Generate response with streaming
            ai_response = ""
            if disable_streaming:
                # Non-streaming for tests to avoid lingering threads/timeouts in background
                logger.debug("Getting non-streaming response from Gemini")
                resp = self.client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=generate_content_config,
                )
                # google-genai returns a response with an output_text property
                try:
                    ai_response = getattr(resp, 'output_text', '') or str(resp)
                except Exception:
                    ai_response = str(resp)
            else:
                logger.debug("Streaming response from Gemini")
                for chunk in self.client.models.generate_content_stream(
                    model=model_name,
                    contents=contents,
                    config=generate_content_config,
                ):
                    if chunk.text:
                        content = chunk.text
                        ai_response += content
            
            if ai_response:
                # Clean the response to remove reasoning and formatting issues
                cleaned_response = self._clean_response(ai_response)
                
                # Update conversation history if using memory
                if use_memory:
                    self.conversation_history.append({"role": "user", "content": prompt})
                    self.conversation_history.append({"role": "assistant", "content": cleaned_response})
                    # Keep history manageable
                    if len(self.conversation_history) > 21:  # 1 system + 20 exchanges
                        self.conversation_history = [self.conversation_history[0]] + self.conversation_history[-20:]
                        logger.debug("Gemini: Conversation history pruned to prevent token overflow")
                
                logger.info("Gemini API successful")
                return cleaned_response, "GEMINI"
            else:
                logger.warning("Gemini API: No response generated")
                return "", "GEMINI_NO_RESPONSE"
                
        except Exception as e:
            log_error(logger, e, {"context": "Gemini API exception"})
            return "", "GEMINI_ERROR"
    
    def reset_conversation(self):
        """Reset conversation history"""
        self.conversation_history = []
        logger.info("Gemini conversation history reset")
    
    def get_conversation_length(self) -> int:
        """Get current conversation length"""
        return len(self.conversation_history)
    
    def _clean_response(self, response: str) -> str:
        """
        Clean the AI response to remove reasoning and unwanted content
        """
        # Remove any thinking tags if present (old style) and <think> blocks
        cleaned = re.sub(r'<thinking>.*?</thinking>', '', response, flags=re.DOTALL)
        cleaned = re.sub(r'<think>.*?</think>', '', cleaned, flags=re.DOTALL)
        # Remove markdown headings and emphasis clutter
        cleaned = re.sub(r'^#{1,6}\s+.*$', '', cleaned, flags=re.MULTILINE)
        cleaned = cleaned.replace('**', '').replace('__', '')

        # Extract only the classification lines (PRODUCT_TYPE through VARIETY)
        lines = cleaned.split('\n')
        classification_lines = []

        for line in lines:
            s = line.strip()
            if re.match(r'^(PRODUCT_TYPE|BRAND_NAME|PRODUCT_NAME|SIZE|VARIETY):', s, flags=re.IGNORECASE):
                # Normalize field names to uppercase exact tokens
                key, _, val = s.partition(':')
                classification_lines.append(f"{key.upper()}: {val.strip()}")

        if classification_lines:
            # Return only the classification lines
            return '\n'.join(classification_lines)

        # Fallback to a trimmed response
        return cleaned.strip()
