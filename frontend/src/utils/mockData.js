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
