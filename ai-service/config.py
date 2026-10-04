import os
from pathlib import Path

from dotenv import load_dotenv

# Load ai-service/.env once at import time (idempotent — variables already set
# in the real environment are never overridden). This guarantees GEMINI_API_KEY
# and GEMINI_MODEL are available no matter which module is imported first.
load_dotenv(Path(__file__).resolve().parent / ".env")


class Config:
    @property
    def PORT(self):
        return int(os.environ.get("PORT", 8000))

    @property
    def GEMINI_API_KEY(self):
        # Read from the environment (.env). Never log, print, or expose this value.
        return os.environ.get("GEMINI_API_KEY")

    @property
    def GEMINI_MODEL(self):
        # Model comes from .env / environment; default only as a last resort.
        return os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")

    @property
    def ALLOWED_ORIGINS(self):
        return ["http://localhost:5000"]


config = Config()
