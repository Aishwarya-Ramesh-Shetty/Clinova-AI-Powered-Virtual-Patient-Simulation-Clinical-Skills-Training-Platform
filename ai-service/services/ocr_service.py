from services.gemini_service import extract_prescription_with_gemini

async def process_prescription_image(image_bytes: bytes, mime_type: str) -> dict:
    return await extract_prescription_with_gemini(image_bytes, mime_type)
