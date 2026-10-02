from pydantic import BaseModel
from typing import List, Optional

class MedicineDetail(BaseModel):
    name: str
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    instructions: Optional[str] = None

class PrescriptionResponse(BaseModel):
    medicines: List[MedicineDetail]
    doctor_name: Optional[str] = None
    date: Optional[str] = None
    diagnosis: Optional[str] = None
    raw_text: Optional[str] = None
