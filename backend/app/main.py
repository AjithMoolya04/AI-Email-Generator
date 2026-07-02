from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.services.mongo_history import MongoHistoryError, MongoHistoryService
from app.routes.email import router as email_router
from app.core.config import settings

app = FastAPI(title="AI Email Generator API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(email_router, prefix="/api")


@app.on_event("startup")
def log_database_status() -> None:
    try:
        history_service = MongoHistoryService()
        if history_service.check_connection():
            print("MongoDB status: connected")
        else:
            print("MongoDB status: not connected")
    except MongoHistoryError as exc:
        print(f"MongoDB status: not connected ({exc})")


