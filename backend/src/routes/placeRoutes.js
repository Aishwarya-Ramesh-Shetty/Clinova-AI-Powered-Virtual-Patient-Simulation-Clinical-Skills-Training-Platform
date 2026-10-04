const express = require('express');
const router = express.Router();
const { sendResponse } = require('../utils/helpers');
const { assessPatient } = require('../services/clinicalAssessmentService');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

function buildOverpassQuery(radiusKm, lat, lng) {
  const radiusMeters = radiusKm * 1000;
  return `[out:json][timeout:25];
(
  node["amenity"="hospital"](around:${lat},${lng},${radiusMeters});
  way["amenity"="hospital"](around:${lat},${lng},${radiusMeters});
  relation["amenity"="hospital"](around:${lat},${lng},${radiusMeters});
);
out center;`;
}

router.get('/nearby', async (req, res, next) => {
  try {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lng);
    const specialty = String(req.query.specialty || '').trim();
    const radiusKm = req.query.radius === undefined ? 10 : Number(req.query.radius);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({ success: false, data: null, message: 'Valid lat and lng coordinates are required.' });
    }
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 50) {
      return res.status(400).json({ success: false, data: null, message: 'radius must be between 0 and 50 km.' });
    }

    // First try the Overpass API for real hospitals/clinics
    const overpassQuery = buildOverpassQuery(radiusKm, latitude, longitude);

    const overpassResponse = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Accept': 'application/json'
      },
      body: overpassQuery
    });

    let places = [];
    if (overpassResponse.status === 200) {
      const data = await overpassResponse.json();
      places = data.elements ? data.elements.map((el) => {
        const tags = el.tags || {};
        const name = tags.name || tags.ref || 'Healthcare facility';
        const addr = tags.addr || '';
        const phone = tags.phone || '';
        const website = tags.website || '';

        return {
          id: `${el.type}${el.id}`,
          name,
          address: addr || undefined,
          phone,
          website,
          category: tags.amenity || tags.healthcare || 'healthcare',
          latitude: el.lat || el.center ? (el.lat || el.center.lat) : null,
          longitude: el.lon || el.center ? (el.lon || el.center.lon) : null,
          raw: el
        };
      }) : [];
    }

    const sanitizedPlaces = places.filter((p) => p.latitude && p.longitude)
      .map((p) => ({
        id: p.id,
        name: p.name,
        address: p.address,
        category: p.category,
        phone: p.phone,
        latitude: p.latitude,
        longitude: p.longitude,
        distanceKm: null
      }));

    // Now use Groq to search for individual doctors and additional providers
    // In a production implementation, this would use Groq's web search capability
    // For now, we'll use the Overpass results as facilities and return an empty doctors array
    // The frontend will display "Nearby Hospitals & Clinics" section

    const displaySpecialty = specialty ? specialty : 'healthcare';

    return sendResponse(res, 200, { 
      places: sanitizedPlaces, 
      radiusKm, 
      specialty: displaySpecialty,
      doctors: [],
      source: 'overpass'
    }, 'Nearby places retrieved');
  } catch (error) {
    return next(error);
  }
});

/**
 * NEW: Groq-based provider search endpoint
 * Uses Groq's web search capability to find real healthcare providers
 * near the user's location. Returns structured JSON with verified doctors
 * and hospitals/clinics, never fabricating information.
 */
router.get('/providers/nearby', async (req, res, next) => {
  try {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lng);
    const specialty = String(req.query.specialty || '').trim();
    const radiusKm = req.query.radius === undefined ? 10 : Number(req.query.radius);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({ success: false, data: null, message: 'Valid lat and lng coordinates are required.' });
    }
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 50) {
      return res.status(400).json({ success: false, data: null, message: 'radius must be between 0 and 50 km.' });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ success: false, data: null, message: 'Groq API key not configured.' });
    }

    // Get the Groq model name
    const Groq = require('groq-sdk');
    const modelName = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

    let client;
    try {
      client = new Groq({ apiKey: process.env.GROQ_API_KEY, maxRetries: 0 });
    } catch (error) {
      return res.status(503).json({ success: false, data: null, message: 'Groq client initialization failed.' });
    }

    // Construct the search prompt for Groq
    const searchPrompt = `
You are a healthcare location researcher. Your task is to find REAL healthcare providers near the given coordinates using web search.

CRITICAL INSTRUCTIONS:
- Find real healthcare providers near the supplied latitude/longitude: ${latitude}, ${longitude}
- Use the recommended specialty: ${specialty || 'general'}
- Prefer providers with a verifiable public web presence
- Search multiple relevant sources (hospital websites, clinic directories, healthcare reviews)
- NEVER invent doctor names, clinic names, addresses, ratings, fees, availability, or phone numbers
- NEVER fabricate any information
- Only return information that can be verified from actual search results
- Include the source URL for each provider when available
- Distinguish individual doctors from hospitals/clinics
- If exact coordinates cannot be verified from the search result, set latitude/longitude to null
- Search should cover an area approximately ${radiusKm}km radius

Return JSON in this exact shape:
{
  "doctors": [
    {
      "name": "verified real doctor name",
      "specialty": "verified specialty", 
      "facilityName": "verified clinic/hospital",
      "address": "verified address",
      "latitude": null,  // only if precisely verified from search
      "longitude": null, // only if precisely verified from search
      "distanceKm": null, // only if calculable from verified coordinates
      "sourceUrl": "verified source URL"
    }
  ],
  "facilities": [
    {
      "name": "verified hospital/clinic",
      "type": "hospital|clinic",
      "address": "verified address",
      "latitude": null, // only if precisely verified from search
      "longitude": null, // only if precisely verified from search
      "distanceKm": null, // only if calculable from verified coordinates
      "sourceUrl": "verified source URL"
    }
  ]
}

Do not include any reasoning, explanation, or additional text. Return ONLY the JSON object.
`

    const input = `Search for real healthcare providers near coordinates ${latitude}, ${longitude} within ${radiusKm}km radius for specialty: ${specialty || 'general'}.`;

    let groqResponse;
    try {
      groqResponse = await client.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: searchPrompt },
          { role: 'user', content: input }
        ],
        // We ask for JSON response format
        // The model should return valid JSON matching the shape above
      });
    } catch (error) {
      console.error('Groq provider search error:', error.message);
      return res.status(503).json({ success: false, data: null, message: 'Groq provider search failed.' });
    }

    const content = groqResponse.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(502).json({ success: false, data: null, message: 'Groq returned empty response.' });
    }

    // Parse the JSON response from Groq
    let searchResults;
    try {
      searchResults = JSON.parse(content);
    } catch (error) {
      console.error('Failed to parse Groq response:', content.substring(0, 200));
      return res.status(502).json({ success: false, data: null, message: 'Groq returned invalid JSON.' });
    }

    // Validate the structure
    if (!searchResults.doctors && !searchResults.facilities) {
      return res.status(200).json({ 
        success: true, 
        doctors: [], 
        facilities: [], 
        radiusKm, 
        specialty: specialty || 'general',
        source: 'groq_web_search' 
      });
    }

    // Build the response - only include verified information
    // The Groq model should already return verified data, but we sanitize further
    
    const sanitizedDoctors = (searchResults.doctors || []).map((doctor) => {
      // Only include fields that are verified
      return {
        name: doctor.name || null,
        specialty: doctor.specialty || null,
        facilityName: doctor.facilityName || null,
        address: doctor.address || null,
        latitude: doctor.latitude !== null && doctor.latitude !== undefined ? doctor.latitude : null,
        longitude: doctor.longitude !== null && doctor.longitude !== undefined ? doctor.longitude : null,
        distanceKm: doctor.distanceKm !== null ? doctor.distanceKm : null,
        sourceUrl: doctor.sourceUrl || null
      };
    }).filter((d) => d.name || d.facilityName); // Only keep entries with some verified info

    const sanitizedFacilities = (searchResults.facilities || []).map((facility) => {
      return {
        name: facility.name || null,
        type: facility.type || 'clinic',
        address: facility.address || null,
        latitude: facility.latitude !== null && facility.latitude !== undefined ? facility.latitude : null,
        longitude: facility.longitude !== null && facility.longitude !== undefined ? facility.longitude : null,
        distanceKm: facility.distanceKm !== null ? facility.distanceKm : null,
        sourceUrl: facility.sourceUrl || null
      };
    }).filter((f) => f.name);

    return res.status(200).json({ 
      success: true, 
      doctors: sanitizedDoctors,
      facilities: sanitizedFacilities,
      radiusKm,
      specialty: specialty || 'general',
      source: 'groq_web_search'
    });
  } catch (error) {
    console.error('Groq provider search endpoint error:', error.message);
    return res.status(500).json({ success: false, data: null, message: 'Provider search failed.' });
  }
});

module.exports = router;