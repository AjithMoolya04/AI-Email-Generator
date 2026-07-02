import json

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.models.schema import (
    EmailGenerateRequest,
    EmailGenerateResponse,
    PromptHistoryResponse,
)
from app.services.gemini import (
    GeminiError,
    GeminiRateLimitError,
    GeminiTimeoutError,
    GeminiSafetyError,
    GeminiService,
)
from app.services.openai import (
    OpenAITaskError,
    OpenAIRateLimitError,
    OpenAITimeoutError,
    OpenAIService,
)
from app.services.groq_service import (
    GroqTaskError,
    GroqRateLimitError,
    GroqTimeoutError,
    GroqService,
)
from app.services.mongo_history import MongoHistoryError, MongoHistoryService
from app.core.config import settings

router = APIRouter(tags=["email"])


def _format_sse(event: str, data: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/generate-email", response_model=EmailGenerateResponse)
async def generate_email(
    payload: EmailGenerateRequest,
    stream: bool = Query(default=False),
) -> EmailGenerateResponse | StreamingResponse:
    if not payload.prompt.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Prompt cannot be empty",
        )

    try:
        if payload.model == "groq":
            service = GroqService()
            result = await service.generate_email(payload.prompt.strip(), payload.tone)
        elif payload.model == "openai":
            service = OpenAIService()
            result = await service.generate_email(payload.prompt.strip(), payload.tone)
        else:
            service = GeminiService()
            result = await service.generate_email(payload.prompt.strip(), payload.tone)
    except (GeminiRateLimitError, OpenAIRateLimitError, GroqRateLimitError) as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except (GeminiTimeoutError, OpenAITimeoutError, GroqTimeoutError) as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=str(exc),
        ) from exc
    except GeminiSafetyError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except (GeminiError, OpenAITaskError, GroqTaskError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    async def save_history() -> str | None:
        history_id = None
        try:
            history_service = MongoHistoryService()
            history_id = history_service.save_prompt_history(
                prompt=payload.prompt.strip(),
                tone=payload.tone,
                subject=result["subject"],
                email=result["email"],
            )
        except MongoHistoryError:
            history_id = None
        return history_id

    if stream:
        async def event_generator():
            yield _format_sse("status", {"message": "stream started"})

            history_id = await save_history()

            yield _format_sse(
                "result",
                {
                    "subject": result["subject"],
                    "email": result["email"],
                    "tone": payload.tone.value,
                    "model": payload.model,
                    "history_id": history_id,
                },
            )
            yield _format_sse("done", {"message": "stream completed"})

        return StreamingResponse(event_generator(), media_type="text/event-stream")

    history_id = await save_history()

    return EmailGenerateResponse(
        subject=result["subject"],
        email=result["email"],
        tone=payload.tone,
        model=payload.model,
        history_id=history_id,
    )


@router.get("/history", response_model=PromptHistoryResponse)
def get_history(limit: int = 20) -> PromptHistoryResponse:
    try:
        history_service = MongoHistoryService()
        items = history_service.get_recent_history(limit=limit)
    except MongoHistoryError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return PromptHistoryResponse(items=items)

