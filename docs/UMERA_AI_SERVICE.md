# Umera's AI Service Implementation Guide

This is the complete guide for building the AI SERVICE module (Python + FastAPI + Google Gemini API).
Work ONLY in the `ai-service/` folder on branch `umera/ai-service`.

## 1. Getting Started

Run these exact commands in your terminal to set up the environment:

```bash
# 1. Create the project directory and navigate to it
mkdir ai-service && cd ai-service

# 2. Create and activate a virtual environment (Windows)
python -m venv venv
venv\Scripts\activate

# 3. Create requirements.txt
echo fastapi > requirements.txt
echo uvicorn[standard] >> requirements.txt
echo google-generativeai >> requirements.txt
echo python-multipart >> requirements.txt
echo python-dotenv >> requirements.txt
echo pydantic >> requirements.txt
echo Pillow >> requirements.txt
echo PyMuPDF >> requirements.txt

# 4. Install dependencies
pip install -r requirements.txt

# 5. Create .env file
echo PORT=8000 > .env
echo GEMINI_API_KEY=your_key_here >> .env

# To run the app later:
# uvicorn app.main:app --reload --port 8000
```

## 2. File-by-File Implementation Guide

Follow this structure. Create an `app` directory with subdirectories for `schemas`, `services`, `prompts`, `routers`, and `case_studies`.

### `app/main.py`
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from app.routers import symptoms, summary, prescription
from app.services.case_study_service import load_case_studies
import app.config as config

load_dotenv()

app = FastAPI(title="Clinova AI Service")

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(symptoms.router, tags=["Symptoms"])
app.include_router(summary.router, tags=["Summary"])
app.include_router(prescription.router, tags=["Prescription"])

@app.on_event("startup")
async def startup_event():
    # Initialize Gemini model
    config.init_gemini()
    # Load case studies
    load_case_studies()
    print("AI Service started successfully.")
```

### `app/config.py`
```python
import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
PORT = int(os.getenv("PORT", 8000))

model = None

def init_gemini():
    global model
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-2.0-flash')
```

### `app/schemas/symptom_schema.py`
```python
from pydantic import BaseModel
from typing import List

class PatientInfo(BaseModel):
    age: int
    gender: str

class SymptomRequest(BaseModel):
    symptoms: str
    language: str = 'en-US'
    patient_info: PatientInfo

class SymptomDetail(BaseModel):
    name: str
    duration: str
    severity: str

class SymptomResponse(BaseModel):
    symptoms: List[SymptomDetail]
    assessment: str
    recommended_specialist: str
    confidence: float
    reasoning: str
    case_study_reference: str
```

### `app/schemas/summary_schema.py`
```python
from pydantic import BaseModel
from typing import List
from .symptom_schema import SymptomDetail

class SummaryRequest(BaseModel):
    symptoms: List[SymptomDetail]
    assessment: str
    recommended_specialist: str
    patient_info: dict
    additional_notes: str = ''

class SummaryResponse(BaseModel):
    summary_text: str
    chief_complaint: str
```

### `app/schemas/prescription_schema.py`
```python
from pydantic import BaseModel
from typing import List

class Medicine(BaseModel):
    name: str
    dosage: str
    frequency: str
    duration: str
    instructions: str

class PrescriptionResponse(BaseModel):
    medicines: List[Medicine]
    doctor_name: str
    date: str
    diagnosis: str
    raw_text: str
```

### `app/services/llm_service.py`
```python
import json
import re
from app.config import model

async def generate_response(prompt: str, system_instruction: str = None) -> str:
    try:
        # In gemini-2.0-flash, system instructions can be passed if configured or prepended.
        # For simplicity, prepending to prompt if system_instruction is provided.
        full_prompt = f"{system_instruction}\n\n{prompt}" if system_instruction else prompt
        response = await model.generate_content_async(full_prompt)
        return response.text
    except Exception as e:
        print(f"Error generating response: {e}")
        raise e

async def generate_json_response(prompt: str, system_instruction: str = None) -> dict:
    try:
        full_prompt = f"{system_instruction}\n\n{prompt}" if system_instruction else prompt
        # We can use response_mime_type='application/json' if supported by the library version
        response = await model.generate_content_async(
            full_prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        text = response.text
        
        # Fallback parsing if malformed
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown code block
            match = re.search(r'```(?:json)?\n(.*?)\n```', text, re.DOTALL)
            if match:
                return json.loads(match.group(1))
            raise Exception("Failed to parse JSON from response")
            
    except Exception as e:
        print(f"Error generating JSON response: {e}")
        raise e
```

### `app/services/case_study_service.py`
```python
import json
import os
import glob

CASE_STUDIES = []

def load_case_studies():
    global CASE_STUDIES
    CASE_STUDIES = []
    cases_dir = os.path.join(os.path.dirname(__file__), '..', 'case_studies')
    for filepath in glob.glob(os.path.join(cases_dir, '*.json')):
        with open(filepath, 'r') as f:
            data = json.load(f)
            CASE_STUDIES.extend(data)

def get_relevant_case_studies(symptoms_text: str) -> list[dict]:
    # Simple keyword matching to find 2-3 relevant case studies
    keywords = set(symptoms_text.lower().split())
    scored_cases = []
    
    for case in CASE_STUDIES:
        case_text = f"{case.get('title', '')} {' '.join(case.get('symptoms', []))}".lower()
        score = sum(1 for word in keywords if word in case_text)
        scored_cases.append((score, case))
        
    scored_cases.sort(key=lambda x: x[0], reverse=True)
    return [case for score, case in scored_cases[:3]]
```

### `app/services/ocr_service.py`
```python
# Prescription image bytes are passed directly to gemini-2.0-flash as a multipart input (image + prompt). No separate OCR step.
from services.gemini_service import extract_prescription_with_gemini

async def process_prescription_image(image_bytes: bytes) -> dict:
    """Extract prescription data directly using Gemini Vision API."""
    return await extract_prescription_with_gemini(image_bytes)
```

### `app/prompts/symptom_analysis.py`
```python
SYMPTOM_ANALYSIS_SYSTEM_PROMPT = """
You are a clinical decision support system. Analyze symptoms using the provided medical case studies. 
Always recommend a specialist from this exact list: 
General Medicine, Orthopedic, Cardiologist, Dermatologist, Neurologist, Gastroenterologist, Pulmonologist, ENT, Ophthalmologist, Gynecologist, Urologist, Psychiatrist, Pediatrician, Dentist, Endocrinologist.

Output STRICT JSON matching this schema:
{
  "symptoms": [{"name": "str", "duration": "str", "severity": "str"}],
  "assessment": "str",
  "recommended_specialist": "str",
  "confidence": float,
  "reasoning": "str",
  "case_study_reference": "str"
}

Disclaimer: This is for educational/simulation purposes only, not real medical advice.
"""

def build_symptom_prompt(symptoms: str, patient_info: dict, case_studies: list, language: str) -> str:
    cases_text = "\n\n".join([str(c) for c in case_studies])
    return f"""
Patient Info: Age {patient_info.get('age')}, Gender {patient_info.get('gender')}
Symptoms reported: {symptoms}

Relevant Case Studies:
{cases_text}

Analyze the patient's symptoms based on the case studies and return the JSON.
CRITICAL INSTRUCTION: Translate the 'assessment' and 'reasoning' fields to this language/locale code if it is not English: {language}.
The 'recommended_specialist' field MUST remain in English and match the provided list exactly.
"""
```

### `app/prompts/summary_generation.py`
```python
SUMMARY_GENERATION_TEMPLATE = """
Generate a clean markdown consultation summary. 
The summary must include these sections:
- Chief Complaint
- Symptoms
- Duration & Severity
- Clinical Assessment
- Recommended Specialist
- Additional Notes

Patient Info: {patient_info}
Symptoms: {symptoms}
Assessment: {assessment}
Recommended Specialist: {recommended_specialist}
Additional Notes: {additional_notes}

Format the response cleanly.
"""
```

### `app/prompts/prescription_extraction.py`
```python
PRESCRIPTION_EXTRACTION_SYSTEM_PROMPT = """
You are a medical data extraction assistant. Extract structured prescription data from the provided OCR text.
Return strictly JSON matching this schema:
{
  "medicines": [
    {
      "name": "str",
      "dosage": "str",
      "frequency": "str",
      "duration": "str",
      "instructions": "str"
    }
  ],
  "doctor_name": "str",
  "date": "str",
  "diagnosis": "str",
  "raw_text": "str (include the exact raw text provided)"
}
"""

def build_prescription_prompt(raw_text: str) -> str:
    return f"Raw OCR Text:\n{raw_text}\n\nExtract the data into JSON."
```

### `app/routers/symptoms.py`
```python
from fastapi import APIRouter, HTTPException
from app.schemas.symptom_schema import SymptomRequest, SymptomResponse
from app.services.case_study_service import get_relevant_case_studies
from app.services.llm_service import generate_json_response
from app.prompts.symptom_analysis import SYMPTOM_ANALYSIS_SYSTEM_PROMPT, build_symptom_prompt

router = APIRouter()

@router.post('/analyze-symptoms', response_model=SymptomResponse)
async def analyze_symptoms(request: SymptomRequest):
    try:
        cases = get_relevant_case_studies(request.symptoms)
        prompt = build_symptom_prompt(request.symptoms, request.patient_info.dict(), cases, request.language)
        
        response_data = await generate_json_response(prompt, SYMPTOM_ANALYSIS_SYSTEM_PROMPT)
        return SymptomResponse(**response_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### `app/routers/summary.py`
```python
from fastapi import APIRouter, HTTPException
from app.schemas.summary_schema import SummaryRequest, SummaryResponse
from app.services.llm_service import generate_json_response
from app.prompts.summary_generation import SUMMARY_GENERATION_TEMPLATE
import json

router = APIRouter()

@router.post('/generate-summary', response_model=SummaryResponse)
async def generate_summary(request: SummaryRequest):
    try:
        prompt = SUMMARY_GENERATION_TEMPLATE.format(
            patient_info=request.patient_info,
            symptoms=[s.dict() for s in request.symptoms],
            assessment=request.assessment,
            recommended_specialist=request.recommended_specialist,
            additional_notes=request.additional_notes
        )
        
        # We need JSON to match SummaryResponse schema
        system_instruction = "Return strictly JSON: {'summary_text': 'str', 'chief_complaint': 'str'}"
        response_data = await generate_json_response(prompt, system_instruction)
        
        return SummaryResponse(**response_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### `app/routers/prescription.py`
```python
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.schemas.prescription_schema import PrescriptionResponse
from app.services.ocr_service import extract_text_from_image, extract_text_from_pdf
from app.services.llm_service import generate_json_response
from app.prompts.prescription_extraction import PRESCRIPTION_EXTRACTION_SYSTEM_PROMPT, build_prescription_prompt
import tempfile
import os

router = APIRouter()

@router.post('/extract-prescription', response_model=PrescriptionResponse)
async def extract_prescription(file: UploadFile = File(...)):
    try:
        # Save to temp file
        ext = os.path.splitext(file.filename)[1].lower()
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_file:
            temp_file.write(await file.read())
            temp_path = temp_file.name

        try:
            if ext == '.pdf':
                raw_text = await extract_text_from_pdf(temp_path)
            else:
                raw_text = await extract_text_from_image(temp_path)
        finally:
            os.remove(temp_path)
            
        if not raw_text:
            raise ValueError("Could not extract any text from the file.")

        prompt = build_prescription_prompt(raw_text)
        response_data = await generate_json_response(prompt, PRESCRIPTION_EXTRACTION_SYSTEM_PROMPT)
        
        # Ensure raw_text is included in the response data if model misses it
        if 'raw_text' not in response_data or not response_data['raw_text']:
            response_data['raw_text'] = raw_text

        return PrescriptionResponse(**response_data)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### `app/case_studies/` Example files

Create `app/case_studies/general_medicine.json`:
```json
[
  {
    "title": "Viral Fever",
    "symptoms": ["high fever", "chills", "body ache", "fatigue"],
    "patient_profile": "Adult, no underlying conditions",
    "clinical_findings": "Elevated temperature, normal throat",
    "diagnosis": "Viral Fever",
    "specialist": "General Medicine",
    "treatment_approach": "Rest, hydration, antipyretics"
  }
]
```

Create `app/case_studies/orthopedic.json`:
```json
[
  {
    "title": "Osteoarthritis Case Study #3",
    "symptoms": ["knee pain", "swelling", "stiffness after waking up"],
    "patient_profile": "Elderly or middle-aged adult",
    "clinical_findings": "Crepitus in joint, reduced range of motion",
    "diagnosis": "Osteoarthritis",
    "specialist": "Orthopedic",
    "treatment_approach": "NSAIDs, physiotherapy, joint support"
  }
]
```

Create `app/case_studies/cardiology.json`:
```json
[
  {
    "title": "Stable Angina",
    "symptoms": ["chest pain", "shortness of breath on exertion", "sweating"],
    "patient_profile": "Older adult with history of hypertension",
    "clinical_findings": "ECG shows ST depression during stress",
    "diagnosis": "Stable Angina",
    "specialist": "Cardiologist",
    "treatment_approach": "Nitrates, beta-blockers, lifestyle modification"
  }
]
```


## 3. Important Notes

- **CORS:** Ensure `allow_origins=["http://localhost:5000"]` is correctly set in `main.py`.
- **Snake Case:** All response fields use `snake_case`. This is required for compatibility with the backend (which converts them to `camelCase`).
- **Canonical Specialists:** The model is strictly instructed to only return specialists from the exact predefined list.
- **File Upload Field:** Must be named `file` in the POST request to `/extract-prescription`.
- **Environment Variables:** `GEMINI_API_KEY` goes in `.env` and is loaded via `dotenv`.
- **Gemini Model:** Use `gemini-2.0-flash` for high speed.
- **Error Handling:** Try/except blocks return HTTP 500 errors to avoid silent crashes.

## 4. Testing Guide

You can test each endpoint locally using `curl` after starting the server (`uvicorn app.main:app --reload`).

**Test `/analyze-symptoms`:**
```bash
curl -X POST http://localhost:8000/analyze-symptoms \
-H "Content-Type: application/json" \
-d '{"symptoms": "I have been having severe chest pain and sweating for the last hour.", "patient_info": {"age": 55, "gender": "male"}}'
```

**Test `/generate-summary`:**
```bash
curl -X POST http://localhost:8000/generate-summary \
-H "Content-Type: application/json" \
-d '{
  "symptoms": [{"name": "chest pain", "duration": "1 hour", "severity": "severe"}],
  "assessment": "Likely cardiac origin based on symptom presentation.",
  "recommended_specialist": "Cardiologist",
  "patient_info": {"age": 55, "gender": "male", "name": "John"},
  "additional_notes": "Patient is anxious."
}'
```

**Test `/extract-prescription`:**
```bash
curl -X POST http://localhost:8000/extract-prescription \
  -H "accept: application/json" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/your/sample/prescription_image.jpg"
```

## 5. Case Study Knowledge Base Guide

The AI Service uses a basic RAG (Retrieval-Augmented Generation) approach.
- **Structure:** Case studies are stored as JSON files in `app/case_studies/`. Each JSON file contains a list of objects describing cases.
- **Adding More Cases:** To expand the knowledge base, simply add more cases to the JSON files or create new JSON files in the `app/case_studies/` directory. They will be loaded automatically on server startup.
- **Keyword Matching:** When a symptom is queried, `get_relevant_case_studies()` tokenizes the query into keywords and matches them against the `title` and `symptoms` fields of the case studies, selecting the top 3 most relevant ones to include in the AI's context prompt.
