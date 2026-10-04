import json
import asyncio
import google.generativeai as genai
from config import config
from case_studies.medical_cases import CASE_STUDIES, VALID_SPECIALISTS


def get_model():
    """Build a GenerativeModel. genai is already configured at startup in main.py."""
    return genai.GenerativeModel(
        model_name=config.GEMINI_MODEL,
        generation_config={"response_mime_type": "application/json"}
    )


def _call_gemini(model, *args):
    """Synchronous Gemini call — wrapped by asyncio.to_thread to avoid blocking the event loop."""
    return model.generate_content(*args)


# ─────────────────────────────────────────────────────────────────────────────
# Symptom Analysis
# ─────────────────────────────────────────────────────────────────────────────

async def analyze_symptoms_with_gemini(symptoms_text: str, language: str, patient_info: dict) -> dict:
    model = get_model()

    prompt = f"""
    You are an AI medical assistant. Analyze the following patient symptoms.

    Patient Info: {patient_info}
    Symptoms: {symptoms_text}
    Requested Language: {language}

    Case Studies for reference:
    {json.dumps(CASE_STUDIES, indent=2)}

    Valid Specialists list (You MUST choose one from this exact list):
    {json.dumps(VALID_SPECIALISTS)}

    Instructions:
    1. Respond ONLY with valid JSON. Do not include markdown formatting or explanation text.
    2. The JSON must match this exact schema:
    {{
      "symptoms": [
        {{ "name": "string", "duration": "string", "severity": "string" }}
      ],
      "assessment": "string",
      "recommended_specialist": "string",
      "confidence": 0.85,
      "reasoning": "string",
      "case_study_reference": "string"
    }}
    3. 'recommended_specialist' must ALWAYS be in English and EXACTLY match one of the valid specialists.
    4. If 'Requested Language' is not 'en-US', translate the 'assessment' and 'reasoning' fields to that language, but keep 'recommended_specialist' in English.
    """

    try:
        response = await asyncio.to_thread(_call_gemini, model, prompt)
        data = json.loads(response.text)
    except Exception:
        # Retry once on failure
        response = await asyncio.to_thread(_call_gemini, model, prompt)
        data = json.loads(response.text)

    # Safety guard — ensure specialist is always valid
    if data.get("recommended_specialist") not in VALID_SPECIALISTS:
        data["recommended_specialist"] = "General Medicine"

    return data


# ─────────────────────────────────────────────────────────────────────────────
# Consultation Summary
# ─────────────────────────────────────────────────────────────────────────────

async def generate_summary_with_gemini(symptoms: list, assessment: str, specialist: str, additional_notes: str) -> dict:
    model = get_model()

    prompt = f"""
    You are an AI medical assistant. Generate a structured consultation summary for the following case.

    Symptoms: {json.dumps(symptoms)}
    Assessment: {assessment}
    Recommended Specialist: {specialist}
    Additional Notes: {additional_notes}

    Instructions:
    1. Respond ONLY with valid JSON. Do not include markdown formatting or explanation text.
    2. The JSON must match this exact schema:
    {{
      "chief_complaint": "string",
      "assessment": "string",
      "summary_text": "string (markdown formatted full summary)"
    }}
    """

    try:
        response = await asyncio.to_thread(_call_gemini, model, prompt)
        return json.loads(response.text)
    except Exception:
        response = await asyncio.to_thread(_call_gemini, model, prompt)
        return json.loads(response.text)


# ─────────────────────────────────────────────────────────────────────────────
# Prescription — Gemini Vision (directly reads image)
# ─────────────────────────────────────────────────────────────────────────────

class PrescriptionOCRError(Exception):
    """Gemini could not produce usable prescription JSON. Its message is safe to return."""


def _redact_sensitive(text: str) -> str:
    """Make sure the Gemini API key can never appear in logs or responses."""
    key = config.GEMINI_API_KEY
    if key and key in text:
        return text.replace(key, "[REDACTED]")
    return text


async def extract_prescription_with_gemini(image_data: bytes, mime_type: str = "image/jpeg") -> dict:
    """Send the image directly to Gemini Vision using its REAL MIME type."""
    model = get_model()

    prompt = """
    Extract the prescription details from this image.
    Respond ONLY with valid JSON matching this schema:
    {
      "medicines": [
        {
          "name": "string",
          "dosage": "string",
          "frequency": "string",
          "duration": "string",
          "instructions": "string"
        }
      ],
      "doctor_name": "string",
      "date": "string (YYYY-MM-DD)",
      "diagnosis": "string",
      "raw_text": "string (the full text extracted)"
    }
    """

    # Use the MIME type the caller actually uploaded (jpeg / png / webp),
    # instead of always claiming the image is a JPEG.
    image_part = {
        "mime_type": mime_type,
        "data": image_data,
    }

    try:
        print(f"[gemini] prescription OCR request (mime={mime_type}, bytes={len(image_data)})")
        response = await asyncio.to_thread(_call_gemini, model, [prompt, image_part])
    except Exception as e:
        message = _redact_sensitive(str(e))
        print(f"[gemini] prescription OCR request failed: {type(e).__name__}: {message}")
        raise PrescriptionOCRError(
            f"Gemini Vision request failed ({type(e).__name__}): {message[:300]}"
        ) from e

    try:
        text = response.text
    except Exception as e:
        message = _redact_sensitive(str(e))
        print(f"[gemini] prescription OCR returned no readable text: {type(e).__name__}: {message}")
        raise PrescriptionOCRError(
            f"Gemini returned no readable text ({type(e).__name__}): {message[:300]}"
        ) from e

    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        snippet = _redact_sensitive(text[:160])
        print(f"[gemini] prescription OCR returned invalid JSON: {e.msg}")
        raise PrescriptionOCRError(
            f"Gemini returned invalid JSON ({e.msg}); response started with: {snippet!r}"
        ) from e

    if not isinstance(data, dict):
        raise PrescriptionOCRError(f"Gemini returned an unexpected JSON type: {type(data).__name__}")

    # Normalize to the expected shape so the Node backend always receives it
    data.setdefault("medicines", [])
    if not isinstance(data["medicines"], list):
        raise PrescriptionOCRError("'medicines' in the Gemini response is not a list.")
    for field in ("doctor_name", "date", "diagnosis", "raw_text"):
        data.setdefault(field, "")

    print("[gemini] prescription OCR succeeded")
    return data
