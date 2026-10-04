// providerRoutes.js
// Dedicated router for Groq‑based real doctor/provider search.

const express = require('express');
const router = express.Router();
// Using global fetch (Node 18+). No import needed.

/** Reverse‑geocode lat/lng to a short locality name using OSM Nominatim. */
async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=10&addressdetails=1`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'ClinovaApp/1.0' } });
    if (!resp.ok) return '';
    const data = await resp.json();
    const { city, town, village, neighbourhood, county, state } = data.address || {};
    return city || town || village || neighbourhood || county || state || '';
  } catch (e) {
    console.error('Reverse geocode error:', e.message);
    return '';
  }
}

/** GET /nearby – search for real individual doctors and facilities */
router.get('/nearby', async (req, res) => {
  try {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lng);
    const specialty = String(req.query.specialty || '').trim();
    const radiusKm = req.query.radius === undefined ? 10 : Number(req.query.radius);

    // ---------- Validation ----------
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({ success: false, data: null, message: 'Valid lat and lng coordinates are required.' });
    }
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 50) {
      return res.status(400).json({ success: false, data: null, message: 'radius must be between 0 and 50 km.' });
    }
    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ success: false, data: null, message: 'Groq API key not configured.' });
    }

    // ---------- Logging start ----------
    const locality = await reverseGeocode(latitude, longitude);
    console.log('[Nearby Doctor Search]');
    console.log('Specialty:', specialty || 'general');
    console.log('Location (lat,lng):', latitude, longitude);
    console.log('Approximate locality:', locality);
    console.log('Radius km:', radiusKm);
    // ---------- End logging ----------

    const Groq = require('groq-sdk');
    const modelName = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY, maxRetries: 0, timeout: 240 * 1000 });

    // ---------- Stage 1 – Browser search ----------
    const systemPromptStage1 = `You are a healthcare location researcher. Use the browser_search tool to find **REAL INDIVIDUAL DOCTORS** for the given specialty and location.

Requirements:
- Do NOT fabricate any information.
- Return plain text that lists each doctor you find, including the doctor's name, specialty, affiliated clinic/hospital, address and a source URL.
- If you find hospitals/clinics without individual doctors, list them separately.
- Be concise but include enough detail for extraction.`;
    const userPromptStage1 = `Find real individual doctors for the specialty "${specialty || 'general'}" within ${radiusKm} km of ${locality || `${latitude},${longitude}`}. Include doctors' full names, specialties, clinic/hospital names, addresses and source URLs. Also list any hospitals or clinics you encounter that do not have a named doctor. Use only verifiable information.`;

    let browserResponse;
    try {
      browserResponse = await client.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPromptStage1 },
          { role: 'user', content: userPromptStage1 }
        ],
        tools: [{ type: 'browser_search' }],
        tool_choice: 'required'
      });
    } catch (e) {
      console.error('Groq status:', e.status);
      console.error('Groq error message:', e.message);
      console.error('Groq error body:', JSON.stringify(e.error || null));
      return res.status(503).json({
        success: false,
        data: null,
        message: 'Groq browser search failed.',
        groqStatus: e.status || null,
        groqError: e.error || e.message
      });
    }

    // Extract browser search result (tool call)
    let browserContent = '';
    const firstChoice = browserResponse.choices?.[0];
    if (firstChoice?.message?.tool_calls && firstChoice.message.tool_calls.length > 0) {
      // Tool call result is in function arguments as a JSON string or plain text
      const toolCall = firstChoice.message.tool_calls[0];
      try {
        // Some implementations return arguments as a JSON string
        const args = JSON.parse(toolCall.function?.arguments || '{}');
        // The actual content may be under a key like 'content' or directly the string
        browserContent = args.content || toolCall.function?.arguments || '';
      } catch (e) {
        // Fallback to raw arguments string
        browserContent = toolCall.function?.arguments || '';
      }
    } else if (typeof firstChoice?.message?.content === 'string') {
      browserContent = firstChoice.message.content;
    }
    if (!browserContent || !browserContent.trim()) {
      console.error('Groq returned empty browser search content.', JSON.stringify(browserResponse, null, 2));
      return res.status(502).json({ success: false, data: null, message: 'Groq returned empty browser search.' });
    }
    console.log('[Groq Browser Search] Search completed. Research length:', browserContent.length);

    // ---------- Stage 2 – Structured extraction ----------
    const systemPromptStage2 = `You are a data extractor. From the research text below, extract ONLY real individual doctors and any hospitals/clinics that were mentioned. Do NOT invent any entries. Return a JSON object matching this schema exactly:\n\n${JSON.stringify({
  doctors: [{ name: '', specialty: '', facilityName: '', address: '', latitude: null, longitude: null, distanceKm: null, sourceUrl: '' }],
  facilities: [{ name: '', type: 'hospital|clinic', address: '', latitude: null, longitude: null, distanceKm: null, sourceUrl: '' }]
}, null, 2)}\n`;
    const userPromptStage2 = `Research text:\n\n${browserContent}`;

    let structuredResponse;
    try {
      structuredResponse = await client.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPromptStage2 },
          { role: 'user', content: userPromptStage2 }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'DoctorExtraction',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                doctors: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      specialty: { type: 'string' },
                      facilityName: { type: 'string' },
                      address: { type: 'string' },
                      latitude: { type: ['number', 'null'] },
                      longitude: { type: ['number', 'null'] },
                      distanceKm: { type: ['number', 'null'] },
                      sourceUrl: { type: 'string' }
                    },
                    required: []
                  }
                },
                facilities: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      type: { type: 'string', enum: ['hospital', 'clinic'] },
                      address: { type: 'string' },
                      latitude: { type: ['number', 'null'] },
                      longitude: { type: ['number', 'null'] },
                      distanceKm: { type: ['number', 'null'] },
                      sourceUrl: { type: 'string' }
                    },
                    required: []
                  }
                }
              },
              required: []
            }
          }
        }
      });
    } catch (e) {
      console.error('Groq structured extraction error:', e.message);
      return res.status(503).json({ success: false, data: null, message: 'Groq structured extraction failed.' });
    }

    const structuredContent = structuredResponse.choices?.[0]?.message?.content;
    if (typeof structuredContent !== 'string' || !structuredContent.trim()) {
      console.error('Groq returned empty structured content.');
      return res.status(502).json({ success: false, data: null, message: 'Groq returned empty structured output.' });
    }
    let extraction;
    try {
      extraction = JSON.parse(structuredContent);
    } catch (e) {
      console.error('Failed to parse structured JSON:', e.message);
      console.error('Raw structured content (first 200 chars):', structuredContent.slice(0, 200));
      return res.status(502).json({ success: false, data: null, message: 'Groq returned invalid JSON.' });
    }

    const docCount = (extraction.doctors || []).length;
    const facCount = (extraction.facilities || []).length;
    console.log('[Groq Doctor Extraction] Doctors found:', docCount);
    console.log('[Groq Doctor Extraction] Facilities found:', facCount);

    const sanitizedDoctors = (extraction.doctors || []).map(d => ({
      name: d.name || null,
      specialty: d.specialty || null,
      facilityName: d.facilityName || null,
      address: d.address || null,
      latitude: d.latitude ?? null,
      longitude: d.longitude ?? null,
      distanceKm: d.distanceKm ?? null,
      sourceUrl: d.sourceUrl || null
    })).filter(d => d.name || d.facilityName);

    const sanitizedFacilities = (extraction.facilities || []).map(f => ({
      name: f.name || null,
      type: f.type || 'clinic',
      address: f.address || null,
      latitude: f.latitude ?? null,
      longitude: f.longitude ?? null,
      distanceKm: f.distanceKm ?? null,
      sourceUrl: f.sourceUrl || null
    })).filter(f => f.name);

    return res.status(200).json({
      success: true,
      doctors: sanitizedDoctors,
      facilities: sanitizedFacilities,
      radiusKm,
      specialty: specialty || 'general',
      source: 'groq_web_search'
    });
  } catch (e) {
    console.error('Provider search endpoint error:', e.message);
    return res.status(500).json({ success: false, data: null, message: 'Provider search failed.' });
  }
});

module.exports = router;
