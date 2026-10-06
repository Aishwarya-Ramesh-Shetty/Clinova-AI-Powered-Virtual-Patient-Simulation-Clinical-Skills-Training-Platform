const axios = require('axios');
const Summary = require('../models/Summary');
const { sendResponse, snakeToCamel } = require('../utils/helpers');

const aiServiceUrl = () => {
  const base = String(process.env.AI_SERVICE_URL || 'http://localhost:8000');
  return base.endsWith('/') ? base.slice(0, -1) : base;
};

// POST /api/summary/generate
exports.generateSummary = async (req, res, next) => {
  try {
    const { symptoms, assessment, recommendedSpecialist, additionalNotes = '' } = req.body;

    if (!assessment || !recommendedSpecialist) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'assessment and recommendedSpecialist are required.',
      });
    }

    let aiResult;
    try {
      const response = await axios.post(
        `${aiServiceUrl()}/generate-summary`,
        {
          symptoms: symptoms || [],
          assessment,
          recommended_specialist: recommendedSpecialist,
          additional_notes: additionalNotes,
        },
        { timeout: 30000 }
      );
      aiResult = snakeToCamel(response.data);
    } catch (aiError) {
      console.error('AI summary service error:', aiError.message);
      // Graceful fallback if AI service is down
      aiResult = {
        chiefComplaint: Array.isArray(symptoms) && symptoms.length > 0
          ? (symptoms[0].name || 'Patient symptoms')
          : 'Symptoms as described',
        assessment,
        summaryText: `## Consultation Summary\n\n**Assessment:** ${assessment}\n\n**Recommended Specialist:** ${recommendedSpecialist}\n\n${additionalNotes ? `**Notes:** ${additionalNotes}` : ''}\n\n*Please consult a qualified medical professional.*`,
      };
    }

    const summary = await Summary.create({
      patientId: req.user._id,
      chiefComplaint: aiResult.chiefComplaint || '',
      symptoms: symptoms || [],
      assessment: aiResult.assessment || assessment,
      recommendedSpecialist,
      summaryText: aiResult.summaryText || '',
      additionalNotes,
    });

    return sendResponse(res, 201, {
      summary: {
        id: String(summary._id),
        chiefComplaint: summary.chiefComplaint,
        symptoms: summary.symptoms,
        assessment: summary.assessment,
        recommendedSpecialist: summary.recommendedSpecialist,
        summaryText: summary.summaryText,
        generatedAt: summary.createdAt,
      },
    }, 'Consultation summary generated successfully');
  } catch (error) {
    return next(error);
  }
};

// GET /api/summary/:appointmentId
exports.getSummary = async (req, res, next) => {
  try {
    const { appointmentId } = req.params;

    // Try by summary _id first, then by appointmentId
    let summary = await Summary.findOne({
      _id: appointmentId,
      patientId: req.user._id,
    }).lean().catch(() => null);

    if (!summary) {
      summary = await Summary.findOne({
        appointmentId,
        patientId: req.user._id,
      }).sort({ createdAt: -1 }).lean();
    }

    if (!summary) {
      return res.status(404).json({ success: false, data: null, message: 'Summary not found.' });
    }

    return sendResponse(res, 200, {
      summary: {
        id: String(summary._id),
        chiefComplaint: summary.chiefComplaint,
        symptoms: summary.symptoms,
        assessment: summary.assessment,
        recommendedSpecialist: summary.recommendedSpecialist,
        summaryText: summary.summaryText,
        generatedAt: summary.createdAt,
      },
    }, 'Summary retrieved successfully');
  } catch (error) {
    return next(error);
  }
};
