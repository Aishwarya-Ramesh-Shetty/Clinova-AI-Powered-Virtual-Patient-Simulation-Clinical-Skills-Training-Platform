from services.gemini_service import extract_prescription_with_gemini

async def process_prescription_image(image_bytes: bytes) -> dict:
    """Extract prescription data directly using Gemini Vision API."""
    return await extract_prescription_with_gemini(image_bytes)
