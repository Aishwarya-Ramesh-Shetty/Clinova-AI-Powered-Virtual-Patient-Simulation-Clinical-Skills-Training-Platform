export const mockSymptomsResponse = {
  success: true,
  data: {
    symptoms: [{ name: "knee pain", duration: "2 weeks", severity: "moderate" }],
    assessment: "Based on clinical case study analysis, this points towards early osteoarthritis.",
    recommendedSpecialist: "Orthopedic",
    confidence: 0.82,
    reasoning: "Persistent knee pain with swelling matching OA profiles.",
    caseStudyReference: "Osteoarthritis Case Study #3"
  }
};

export const mockDoctorsResponse = {
  success: true,
  data: {
    doctors: [
      {
        id: "doc1", name: "Dr. Ramesh Kumar", specialty: "Orthopedic", experience: 12, consultationFee: 500, rating: 4.5, clinicName: "Kumar Bone Clinic", location: { coordinates: [74.8425, 12.8714] }, availableSlots: [{ times: ["09:00", "10:00"] }]
      }
    ]
  }
};

export const mockSummaryResponse = { success: true, data: { summary: { id: 'sum1', chiefComplaint: 'Knee pain with swelling for 2 weeks', symptoms: [{ name: 'knee pain', duration: '2 weeks', severity: 'moderate' }], assessment: 'Based on case study analysis, this is likely early-stage osteoarthritis.', recommendedSpecialist: 'Orthopedic', summaryText: '## Consultation Summary\n\n**Chief Complaint:** Knee pain with swelling for 2 weeks\n\n**Symptoms:** Knee pain (moderate, 2 weeks)\n\n**Assessment:** Based on case study analysis, this is likely early-stage osteoarthritis.\n\n**Recommended Specialist:** Orthopedic\n\n**Note:** Please consult a qualified doctor.', generatedAt: '2026-09-30T00:00:00Z' } } };

export const mockPrescriptionResponse = { success: true, data: { prescription: { id: 'presc1', originalFileUrl: '/uploads/sample.jpg', extractedData: { medicines: [{ name: 'Diclofenac', dosage: '50mg', frequency: 'Twice a day', duration: '5 days', instructions: 'After food' }, { name: 'Pantoprazole', dosage: '40mg', frequency: 'Once a day', duration: '5 days', instructions: 'Before food' }], doctorName: 'Dr. Ramesh Kumar', date: '2026-09-28', diagnosis: 'Knee inflammation', rawText: 'Sample raw OCR text' }, uploadedAt: '2026-09-30T00:00:00Z' } } };

export const mockAppointmentsResponse = { success: true, data: { appointments: [{ id: 'appt1', doctor: { name: 'Dr. Ramesh Kumar', specialty: 'Orthopedic', clinicName: 'Kumar Bone Clinic' }, date: '2026-10-15', timeSlot: '09:00', status: 'booked', notes: '' }] } };

export const mockPrescriptionsListResponse = { success: true, data: { prescriptions: [{ id: 'presc1', originalFileUrl: '/uploads/sample.jpg', extractedData: { medicines: [{ name: 'Diclofenac', dosage: '50mg', frequency: 'Twice a day', duration: '5 days', instructions: 'After food' }], doctorName: 'Dr. Ramesh Kumar', date: '2026-09-28', diagnosis: 'Knee inflammation' }, uploadedAt: '2026-09-30T00:00:00Z' }] } };
