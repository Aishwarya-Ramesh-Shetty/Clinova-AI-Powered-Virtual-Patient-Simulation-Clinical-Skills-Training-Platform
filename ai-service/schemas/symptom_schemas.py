from pydantic import BaseModel
from typing import List, Optional

class PatientInfo(BaseModel):
    age: Optional[int] = None
    gender: Optional[str] = None

class SymptomRequest(BaseModel):
    symptoms: str
    language: str = "en-US"
    patient_info: Optional[PatientInfo] = None

class SymptomDetail(BaseModel):
    name: str
    duration: Optional[str] = None
    severity: Optional[str] = None

class SymptomResponse(BaseModel):
    symptoms: List[SymptomDetail]
    assessment: str
    recommended_specialist: str
    confidence: float
    reasoning: str
    case_study_reference: Optional[str] = None

class SummaryRequest(BaseModel):
    symptoms: List[SymptomDetail]
    assessment: str
    recommended_specialist: str
    additional_notes: Optional[str] = ""

class SummaryResponse(BaseModel):
    chief_complaint: str
    assessment: str
    summary_text: str
