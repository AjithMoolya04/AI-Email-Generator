import json
import logging
from typing import Any

from groq import AsyncGroq, APIError, RateLimitError, APITimeoutError
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from app.core.config import settings
from app.models.schema import Tone

logger = logging.getLogger(__name__)

class GroqTaskError(RuntimeError):
    pass

class GroqRateLimitError(GroqTaskError):
    pass

class GroqTimeoutError(GroqTaskError):
    pass

class GroqService:
    def __init__(self) -> None:
        if not settings.has_groq_key:
            raise GroqTaskError("GROQ_API_KEY is not configured")
        
        self.model = "llama-3.3-70b-versatile"
        self.client = AsyncGroq(api_key=settings.groq_api_key)

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
            f"Write the email in a {GroqService._tone_instruction(tone)} tone. "
            "Keep the subject line short and relevant. "
            "CRITICAL: The email MUST have proper spacing. Use literal newline characters (\\n\\n) between the greeting, body paragraphs, and sign-off. Do NOT write the email as one single paragraph. "
            f"User request: {user_prompt}"
        )

    @retry(
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((GroqRateLimitError, GroqTimeoutError, APIError)),
        reraise=True
    )
    async def _call_groq_with_retry(self, prompt: str, tone: Tone) -> dict[str, str]:
        system_instruction = (
            "You are an expert assistant that writes professional emails. "
            "Always output in JSON format with exactly two keys: 'subject' and 'email'. "
            "You MUST use literal \\n\\n for line breaks inside the email string so it renders with multiple paragraphs."
        )
        user_content = self._build_prompt(prompt, tone)

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": user_content}
                ],
                response_format={"type": "json_object"},
                temperature=0.7,
                max_tokens=700,
            )
            
            choice = response.choices[0]
            
            raw_text = choice.message.content
            if not raw_text:
                 logger.error("Groq returned an empty text part")
                 raise GroqTaskError("Groq returned empty text")
                 
            # Clean up potential markdown formatting
            raw_text = raw_text.strip()
            if raw_text.startswith("```json"):
                raw_text = raw_text[7:]
            elif raw_text.startswith("```"):
                raw_text = raw_text[3:]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]
            raw_text = raw_text.strip()

            try:
                parsed = json.loads(raw_text)
            except json.JSONDecodeError as exc:
                logger.error(f"Groq returned invalid JSON: {raw_text}")
                raise GroqTaskError("Groq returned an invalid response format") from exc

            subject = str(parsed.get("subject", "")).strip()
            email = str(parsed.get("email", "")).strip()

            if not subject or not email:
                logger.error(f"Groq response missing keys. Parsed: {parsed}")
                raise GroqTaskError("Groq response is missing subject or email")

            return {"subject": subject, "email": email}

        except RateLimitError as exc:
            logger.error(f"Groq Rate Limit Error: {exc}")
            raise GroqRateLimitError("Groq rate limit exceeded") from exc
        except APITimeoutError as exc:
            logger.error(f"Groq API request timed out: {exc}")
            raise GroqTimeoutError("Groq API request timed out") from exc
        except APIError as exc:
            logger.error(f"Groq API Error: {exc}")
            raise GroqTaskError(f"Groq API error: {exc}") from exc
        except Exception as exc:
            logger.error(f"Unexpected error in Groq service: {exc}", exc_info=True)
            if isinstance(exc, (GroqTaskError, GroqRateLimitError, GroqTimeoutError)):
                raise
            raise GroqTaskError("An unexpected error occurred communicating with Groq") from exc

    async def generate_email(self, prompt: str, tone: Tone) -> dict[str, str]:
        return await self._call_groq_with_retry(prompt, tone)
