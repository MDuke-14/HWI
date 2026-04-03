import os
from pathlib import Path

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).parent
PROJECT_ROOT = ROOT_DIR.parent
UPLOADS_DIR = PROJECT_ROOT / "uploads"
BACKEND_UPLOADS_DIR = ROOT_DIR / "uploads"
SIGNATURES_DIR = ROOT_DIR / "signatures"
ASSETS_DIR = ROOT_DIR / "assets"

load_dotenv(ROOT_DIR / ".env", override=False)

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://127.0.0.1:27017")
DB_NAME = os.environ.get("DB_NAME", "emergent")
SECRET_KEY = os.environ.get("SECRET_KEY", "hwi-timeclock-secret-key-2025")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")
CORS_ORIGINS = [origin.strip() for origin in os.environ.get("CORS_ORIGINS", "*").split(",") if origin.strip()]
ALLOW_PUBLIC_REGISTRATION = os.environ.get("ALLOW_PUBLIC_REGISTRATION", "false").lower() == "true"


def resolve_upload_path(relative_or_url: str) -> Path | None:
    if not relative_or_url:
        return None

    normalized = relative_or_url.replace("\\", "/")

    if normalized.startswith("/uploads/"):
        normalized = normalized[len("/uploads/"):]
    elif normalized.startswith("uploads/"):
        normalized = normalized[len("uploads/"):]

    return UPLOADS_DIR / normalized
