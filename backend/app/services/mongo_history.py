from datetime import UTC, datetime

from pymongo import DESCENDING, MongoClient
from pymongo.errors import PyMongoError

from app.core.config import settings
from app.models.schema import Tone


class MongoHistoryError(RuntimeError):
    pass


class MongoHistoryService:
    def __init__(self) -> None:
        if not settings.has_mongodb_uri:
            raise MongoHistoryError("MONGODB_URI is not configured")

        self.client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
        self.collection = self.client[settings.mongodb_database][settings.mongodb_collection]

    def check_connection(self) -> bool:
        try:
            self.client.admin.command("ping")
            return True
        except PyMongoError:
            return False

    def save_prompt_history(self, prompt: str, tone: Tone, subject: str, email: str) -> str:
        try:
            document = {
                "prompt": prompt,
                "tone": tone.value,
                "subject": subject,
                "email": email,
                "created_at": datetime.now(UTC),
            }
            result = self.collection.insert_one(document)
            return str(result.inserted_id)
        except PyMongoError as exc:
            raise MongoHistoryError(f"Failed to save prompt history: {exc}") from exc

    def get_recent_history(self, limit: int = 20) -> list[dict[str, object]]:
        try:
            items: list[dict[str, object]] = []
            safe_limit = max(1, min(limit, 100))
            cursor = self.collection.find().sort("created_at", DESCENDING).limit(safe_limit)

            for document in cursor:
                items.append(
                    {
                        "id": str(document["_id"]),
                        "prompt": str(document.get("prompt", "")),
                        "tone": document.get("tone", Tone.professional.value),
                        "subject": str(document.get("subject", "")),
                        "email": str(document.get("email", "")),
                        "created_at": document.get("created_at", datetime.now(UTC)),
                    }
                )

            return items
        except PyMongoError as exc:
            raise MongoHistoryError(f"Failed to load prompt history: {exc}") from exc