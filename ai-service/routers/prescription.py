from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
from services.ocr_service import process_prescription_image
from services.gemini_service import PrescriptionOCRError

router = APIRouter()

# The Node backend only forwards these three image types (and rejects others
# with a 400 before they ever reach this service).
SUPPORTED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}


@router.post("/extract-prescription")
async def extract_prescription(file: UploadFile = File(...)):
    mime_type = file.content_type or ""
    if mime_type not in SUPPORTED_MIME_TYPES:
        # Bad input from the caller -> 400 with a clear message
        return JSONResponse(
            status_code=400,
            content={"error": f"Unsupported image type '{mime_type}'. Supported: image/jpeg, image/png, image/webp."}
        )

    try:
        contents = await file.read()
        # Pass the REAL MIME type through router -> ocr_service -> gemini_service
        result = await process_prescription_image(contents, mime_type)
        if not isinstance(result, dict) or not isinstance(result.get("medicines"), list):
            raise PrescriptionOCRError("Gemini response did not contain a 'medicines' list.")
        return JSONResponse(content=result)
    except PrescriptionOCRError as e:
        # Message is already sanitized (API key redacted) inside gemini_service
        print(f"[prescription] OCR failed: {e}")
        return JSONResponse(status_code=502, content={"error": str(e)})
    except Exception as e:
        # Log the exception TYPE only — never raw internals, never the API key
        print(f"[prescription] unexpected error: {type(e).__name__}")
        return JSONResponse(
            status_code=502,
            content={"error": f"Prescription extraction failed ({type(e).__name__})."}
        )
