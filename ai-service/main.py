from pathlib import Path

from dotenv import load_dotenv

# Load ai-service/.env at import time — BEFORE any configuration is read — so the
# service works when started with `py -m uvicorn main:app --reload --port 8000`
# (no manual key entry, no getpass, no copying the key into the terminal).
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

import uvicorn  # noqa: E402
import google.generativeai as genai  # noqa: E402

from config import config  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from routers import symptoms, prescription  # noqa: E402

# Configure Gemini at application startup/import so it is ready when Uvicorn
# loads `main:app` — NOT only inside the `if __name__ == "__main__"` block.
# If the key is missing, fail fast with a clear configuration error that never
# prints the key itself.
if not config.GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is missing from ai-service/.env. "
        "Add a line 'GEMINI_API_KEY=your-key-here' to ai-service/.env "
        "and restart the AI service."
    )

genai.configure(api_key=config.GEMINI_API_KEY)
# Safe startup log: model name only — the API key is never logged.
print(f"[startup] Gemini configured (model={config.GEMINI_MODEL})")

app = FastAPI(title="Clinova AI Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(symptoms.router)
app.include_router(prescription.router)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=config.PORT, reload=True)
