from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class Tone(str, Enum):
    professional = "professional"
    friendly = "friendly"
    formal = "formal"
    casual = "casual"


class EmailGenerateRequest(BaseModel):
    prompt: str = Field(min_length=5, max_length=2000)
    tone: Tone = Tone.professional
    model: str = "gemini"


class EmailGenerateResponse(BaseModel):
    subject: str
    email: str
    tone: Tone
    model: str
    history_id: str | None = None


class PromptHistoryItem(BaseModel):
    id: str
    prompt: str
    tone: Tone
    subject: str
    email: str
    created_at: datetime


class PromptHistoryResponse(BaseModel):
    items: list[PromptHistoryItem]

