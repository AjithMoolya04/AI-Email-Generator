import json
import logging

from openai import AsyncOpenAI, APIError, RateLimitError, APITimeoutError

from app.core.config import settings
from app.models.schema import Tone

logger = logging.getLogger(__name__)

# Ordered list of free OpenRouter models to try in sequence on rate limit
OPENROUTER_FREE_MODELS = [
    "nousresearch/hermes-3-llama-3.1-405b:free",   # 405B – best quality
    "meta-llama/llama-3.3-70b-instruct:free",       # 70B – great quality
    "meta-llama/llama-3.2-3b-instruct:free",        # 3B  – lightweight fallback
]


class OpenAITaskError(RuntimeError):
    pass

class OpenAIRateLimitError(OpenAITaskError):
    pass

class OpenAITimeoutError(OpenAITaskError):
    pass

class OpenAIService:
    def __init__(self) -> None:
        if not settings.has_openai_key:
            raise OpenAITaskError("OPENAI_API_KEY is not configured")

        # Check if it's an OpenRouter key
        if settings.openai_api_key.startswith("sk-or-"):
            self.is_openrouter = True
            self.models = OPENROUTER_FREE_MODELS
            self.client = AsyncOpenAI(
                api_key=settings.openai_api_key,
                base_url="https://openrouter.ai/api/v1"
            )
        else:
            self.is_openrouter = False
            self.models = ["gpt-3.5-turbo"]
            self.client = AsyncOpenAI(api_key=settings.openai_api_key)

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
            f"Write the email in a {OpenAIService._tone_instruction(tone)} tone. "
            "Keep the subject line short and relevant. "
            f"User request: {user_prompt}"
        )

    async def _call_model(self, model: str, prompt: str, tone: Tone) -> dict[str, str]:
        """Call a single model and parse the result. Raises on any error."""
        system_instruction = (
            "You are an expert assistant that writes professional emails. "
            "Always output in JSON format with 'subject' and 'email' keys."
        )
        user_content = self._build_prompt(prompt, tone)

        response = await self.client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": user_content},
            ],
            temperature=0.7,
            max_tokens=2048,
        )

        choice = response.choices[0]
        raw_text = choice.message.content
        if not raw_text:
            logger.error(f"[{model}] returned empty text")
            raise OpenAITaskError("OpenAI returned empty text")

        # Clean up potential markdown formatting
        raw_text = raw_text.strip()
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:]
        elif raw_text.startswith("```"):
            raw_text = raw_text[3:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
        raw_text = raw_text.strip()

        # Detect plain-text error messages returned by the provider
        if raw_text.lower().startswith("an error occurred") or raw_text.lower().startswith("error"):
            logger.error(f"[{model}] provider error: {raw_text}")
            raise OpenAITaskError(f"Provider error: {raw_text}")

        try:
            parsed = json.loads(raw_text)
        except json.JSONDecodeError as exc:
            logger.error(f"[{model}] invalid JSON: {raw_text}")
            raise OpenAITaskError("OpenAI returned an invalid response format") from exc

        subject = str(parsed.get("subject", "")).strip()
        email = str(parsed.get("email", "")).strip()

        if not subject or not email:
            logger.error(f"[{model}] response missing keys. Parsed: {parsed}")
            raise OpenAITaskError("OpenAI response is missing subject or email")

        return {"subject": subject, "email": email}

    async def generate_email(self, prompt: str, tone: Tone) -> dict[str, str]:
        """Try each model in order, falling back on rate limit errors."""
        last_exc: Exception | None = None

        for model in self.models:
            try:
                logger.info(f"Trying model: {model}")
                result = await self._call_model(model, prompt, tone)
                logger.info(f"Success with model: {model}")
                return result
            except RateLimitError as exc:
                logger.warning(f"[{model}] rate limited, trying next model. Detail: {exc}")
                last_exc = OpenAIRateLimitError(f"Rate limited on {model}") 
                continue  # try next model
            except APITimeoutError as exc:
                logger.error(f"[{model}] timed out: {exc}")
                raise OpenAITimeoutError("OpenAI API request timed out") from exc
            except APIError as exc:
                logger.error(f"[{model}] API error: {exc}")
                raise OpenAITaskError(f"OpenAI API error: {exc}") from exc
            except OpenAITaskError:
                raise
            except Exception as exc:
                logger.error(f"[{model}] unexpected error: {exc}", exc_info=True)
                raise OpenAITaskError("An unexpected error occurred communicating with OpenAI") from exc

        # All models exhausted
        logger.error("All OpenRouter free models are rate limited")
        raise OpenAIRateLimitError(
            "All free OpenRouter models are currently rate limited. Please try again in a minute."
        ) from last_exc
