from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
from schemas.prescription_schemas import PrescriptionResponse
from services.ocr_service import process_prescription_image

router = APIRouter()

@router.post("/extract-prescription")
async def extract_prescription(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        result = await process_prescription_image(contents)
        return JSONResponse(content=result)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
