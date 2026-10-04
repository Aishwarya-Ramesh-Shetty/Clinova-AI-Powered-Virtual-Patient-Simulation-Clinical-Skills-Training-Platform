from fastapi import APIRouter
from fastapi.responses import JSONResponse
from schemas.symptom_schemas import SymptomRequest, SymptomResponse, SummaryRequest, SummaryResponse
from services.gemini_service import analyze_symptoms_with_gemini, generate_summary_with_gemini

router = APIRouter()

@router.post("/analyze-symptoms")
async def analyze_symptoms(request: SymptomRequest):
    try:
        patient_info_dict = request.patient_info.model_dump() if request.patient_info else {}
        result = await analyze_symptoms_with_gemini(
            request.symptoms, 
            request.language, 
            patient_info_dict
        )
        return JSONResponse(content=result)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@router.post("/generate-summary")
async def generate_summary(request: SummaryRequest):
    try:
        result = await generate_summary_with_gemini(
            [s.model_dump() for s in request.symptoms],
            request.assessment,
            request.recommended_specialist,
            request.additional_notes
        )
        return JSONResponse(content=result)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
