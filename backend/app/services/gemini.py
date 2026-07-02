import json
import logging
from typing import Any

from google import genai
from google.genai import types
from google.genai.errors import APIError
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from app.core.config import settings
from app.models.schema import Tone

logger = logging.getLogger(__name__)

class GeminiError(RuntimeError):
    pass

class GeminiRateLimitError(GeminiError):
    pass

class GeminiTimeoutError(GeminiError):
    pass

class GeminiSafetyError(GeminiError):
    pass

class GeminiService:
    def __init__(self) -> None:
        if not settings.has_gemini_key:
            raise GeminiError("GEMINI_API_KEY is not configured")
        self.client = genai.Client(api_key=settings.gemini_api_key)

    @staticmethod
    def _tone_instruction(tone: Tone) -> str:
        tone_map = {
            Tone.professional: "professional, polished, and concise",
            Tone.friendly: "warm, approachable, and natural",
            Tone.formal: "formal, respectful, and polished",
            Tone.casual: "casual, clear, and conversational",
        }
        return tone_map[tone]

    @staticmethod
    def _build_prompt(user_prompt: str, tone: Tone) -> str:
        return (
            "Return exactly two keys: subject and email. "
            f"Write the email in a {GeminiService._tone_instruction(tone)} tone. "
            "Keep the subject line short and relevant. "
            f"User request: {user_prompt}"
        )

    @retry(
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((GeminiRateLimitError, GeminiTimeoutError, APIError)),
        reraise=True
    )
    async def _call_gemini_with_retry(self, prompt: str, tone: Tone) -> dict[str, str]:
        system_instruction = "You are an expert assistant that writes professional emails."
        user_content = self._build_prompt(prompt, tone)

        try:
            response = await self.client.aio.models.generate_content(
                model=settings.gemini_model,
                contents=user_content,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.7,
                    max_output_tokens=2048,
                    system_instruction=system_instruction,
                )
            )
            
            if not response.candidates:
                logger.error("Gemini returned no candidates")
                raise GeminiError("Gemini returned no candidates")
                
            candidate = response.candidates[0]
            
            if candidate.finish_reason == types.FinishReason.SAFETY:
                logger.error("Gemini response was blocked by safety filters")
                raise GeminiSafetyError("Response blocked by safety filters")
                
            if not candidate.content or not candidate.content.parts:
                logger.error("Gemini returned an empty response content")
                raise GeminiError("Gemini returned an empty response")
                
            raw_text = candidate.content.parts[0].text
            if not raw_text:
                 logger.error("Gemini returned an empty text part")
                 raise GeminiError("Gemini returned empty text")
                 
            try:
                parsed = json.loads(raw_text)
            except json.JSONDecodeError as exc:
                logger.error(f"Gemini returned invalid JSON: {raw_text}")
                raise GeminiError("Gemini returned an invalid response format") from exc

            subject = str(parsed.get("subject", "")).strip()
            email = str(parsed.get("email", "")).strip()

            if not subject or not email:
                logger.error(f"Gemini response missing keys. Parsed: {parsed}")
                raise GeminiError("Gemini response is missing subject or email")

            return {"subject": subject, "email": email}

        except APIError as exc:
            logger.error(f"Gemini API Error: {exc.code} - {exc.message}")
            if exc.code == 429:
                raise GeminiRateLimitError("Gemini rate limit exceeded") from exc
            if exc.code == 504:
                raise GeminiTimeoutError("Gemini API request timed out") from exc
            raise GeminiError(f"Gemini API error: {exc.code} - {exc.message}") from exc
        except Exception as exc:
            logger.error(f"Unexpected error in Gemini service: {exc}", exc_info=True)
            if isinstance(exc, (GeminiError, GeminiRateLimitError, GeminiTimeoutError, GeminiSafetyError)):
                raise
            raise GeminiError("An unexpected error occurred communicating with Gemini") from exc

    async def generate_email(self, prompt: str, tone: Tone) -> dict[str, str]:
        return await self._call_gemini_with_retry(prompt, tone)
