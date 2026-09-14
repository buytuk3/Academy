"""
Feedback Worker - LLM (Gemini / OpenAI)
Used ONLY for reformulating exercise instructions.
"""

import os
import logging
from typing import Optional

import inference_pb2

logger = logging.getLogger(__name__)

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")


class FeedbackWorker:
    def __init__(self):
        self.gemini_client = None
        self.openai_client = None
        self._load_clients()

    def _load_clients(self):
        if LLM_PROVIDER == "gemini" and GEMINI_API_KEY:
            try:
                import google.generativeai as genai
                genai.configure(api_key=GEMINI_API_KEY)
                self.gemini_client = genai.GenerativeModel(GEMINI_MODEL)
                logger.info(f"Gemini client ready: {GEMINI_MODEL}")
            except ImportError:
                logger.warning("google-generativeai not installed")
            except Exception as e:
                logger.error(f"Failed to init Gemini: {e}")

        if LLM_PROVIDER == "openai" and OPENAI_API_KEY:
            try:
                from openai import AsyncOpenAI
                self.openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)
                logger.info(f"OpenAI client ready: {OPENAI_MODEL}")
            except ImportError:
                logger.warning("openai package not installed")
            except Exception as e:
                logger.error(f"Failed to init OpenAI: {e}")

    async def generate(
        self, request: inference_pb2.FeedbackRequest
    ) -> inference_pb2.FeedbackResponse:
        if LLM_PROVIDER == "gemini" and self.gemini_client:
            return await self._call_gemini(request)
        elif LLM_PROVIDER == "openai" and self.openai_client:
            return await self._call_openai(request)
        else:
            logger.warning("No LLM client available, returning empty feedback")
            return inference_pb2.FeedbackResponse(
                text="",
                model_used="none",
                tokens_used=0,
            )

    async def _call_gemini(
        self, request: inference_pb2.FeedbackRequest
    ) -> inference_pb2.FeedbackResponse:
        try:
            response = self.gemini_client.generate_content(
                request.prompt,
                generation_config={
                    "temperature": request.temperature or 0.3,
                    "max_output_tokens": 500,
                },
            )
            text = response.text or ""
            tokens = getattr(response.usage_metadata, "total_token_count", 0)

            logger.info(f"Gemini response: {len(text)} chars, {tokens} tokens")
            return inference_pb2.FeedbackResponse(
                text=text,
                model_used=GEMINI_MODEL,
                tokens_used=tokens,
            )
        except Exception as e:
            logger.error(f"Gemini call failed: {e}", exc_info=True)
            raise

    async def _call_openai(
        self, request: inference_pb2.FeedbackRequest
    ) -> inference_pb2.FeedbackResponse:
        try:
            response = await self.openai_client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=[{"role": "user", "content": request.prompt}],
                temperature=request.temperature or 0.3,
                max_tokens=500,
            )
            text = response.choices[0].message.content or ""
            tokens = response.usage.total_tokens if response.usage else 0

            logger.info(f"OpenAI response: {len(text)} chars, {tokens} tokens")
            return inference_pb2.FeedbackResponse(
                text=text,
                model_used=OPENAI_MODEL,
                tokens_used=tokens,
            )
        except Exception as e:
            logger.error(f"OpenAI call failed: {e}", exc_info=True)
            raise
