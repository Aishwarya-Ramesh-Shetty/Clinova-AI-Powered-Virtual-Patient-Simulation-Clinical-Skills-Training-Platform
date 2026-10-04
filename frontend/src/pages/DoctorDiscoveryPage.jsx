import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { getDemoDoctors } from '../services/api';
import { useGeolocation } from '../hooks/useGeolocation';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import axios from 'axios';
import Loader from '../components/common/Loader';
import toast from 'react-hot-toast';

// ── Demo-provider specialty matching ──────────────────────────────────────────
// Normalizes wording so "General Physician", "General Medicine" and "Physician"
// all match each other. Demo providers are only ever REORDERED (matches first),
// never filtered out — the demo section can never become empty.
function specialtyKey(value) {
  const cleaned = String(value || '')
    .toLowerCase()
    .split('')
    .map((ch) => ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === ' ' ? ch : ' '))
    .join('');
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      if (word.endsWith('ologists')) return `${word.slice(0, -8)}ology`;
      if (word.endsWith('ologist')) return `${word.slice(0, -7)}ology`;
      if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
      if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
      return word;
    })
    .join(' ');
}

const SPECIALTY_ALIAS_GROUPS = [
  ['general physician', 'general medicine', 'medicine', 'physician', 'family medicine', 'internal medicine', 'primary care', 'doctor', 'gp'],
  ['ent', 'otolaryngology', 'ear nose throat'],
  ['pediatrics', 'pediatric', 'pediatrician'],
  ['orthopedics', 'orthopedic', 'orthopaedics'],
  ['gynecology', 'gynecologist', 'obgyn'],
  ['dermatology', 'dermatologist'],
  ['cardiology', 'cardiologist'],
  ['neurology', 'neurologist']
];

function demoSpecialtyScore(recommended, candidate) {
  const a = specialtyKey(recommended);
  const b = specialtyKey(candidate);
  if (!a || !b) return 1;
  if (a === b) return 3;
  if (SPECIALTY_ALIAS_GROUPS.some((group) => group.includes(a) && group.includes(b))) return 3;
  if (a.includes(b) || b.includes(a)) return 2;
  return 1;
}

function createDemoIcon() {
  return new L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-teal.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    tooltipAnchor: [16, -28],
    shadowSize: [41, 41],
  });
}

function createRealIcon() {
  return new L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-red.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    tooltipAnchor: [16, -28],
    shadowSize: [41, 41],
  });
}

const demoIcon = createDemoIcon();
const realIcon = createRealIcon();

export default function DoctorDiscoveryPage() {
  const [searchParams] = useSearchParams();
  const specialty = (searchParams.get('specialty') || '').trim();
  // Optional: the completed assessment this search came from — carried into booking so the
  // appointment can reference the SAVED diagnosis (the assessment itself is stored independently).
  const assessmentSessionId = (searchParams.get('sessionId') || '').trim();
  // Demo providers: fetched independently of geolocation / real-provider APIs so
  // the DEMO PROVIDERS section is always visible (location denied, Groq failure,
  // or /api/providers/nearby failure must never empty it).
  const [demoDoctors, setDemoDoctors] = useState([]);
  const [demoLoading, setDemoLoading] = useState(true);
  const [demoError, setDemoError] = useState('');
const [realProviders, setRealProviders] = useState([]);
const [realFacilities, setRealFacilities] = useState([]);
  const { latitude, longitude, error: locationError, loading: geoLoading, retry: retryLocation } = useGeolocation();
  const navigate = useNavigate();
  const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude);

  // ── DEMO PROVIDERS: independent, immediate fetch — no geolocation, no Groq,
  // no Nominatim, no real-provider endpoint. Local MongoDB only. ──
  useEffect(() => {
    let active = true;
    setDemoLoading(true);
    setDemoError('');

    getDemoDoctors()
      .then((response) => {
        if (!active) return;
        const results = response?.data?.doctors ?? response?.doctors ?? [];
        setDemoDoctors(Array.isArray(results) ? results : []);
      })
      .catch((error) => {
        if (!active) return;
        setDemoDoctors([]);
        setDemoError(error?.message || 'Unable to load demo providers right now.');
      })
      .finally(() => {
        if (active) setDemoLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (geoLoading || !hasLocation || !specialty) return undefined;

    let active = true;
    axios.get('/api/providers/nearby', {
      params: { lat: latitude, lng: longitude, specialty, radius: 10 },
      withCredentials: true
    })
      .then((response) => {
        if (!active) return;
        const result = response?.data || {};
        setRealProviders(result.doctors || []);
        setRealFacilities(result.facilities || []);
      })
      .catch((error) => {
        if (!active) return;
        // Real-provider failure must NOT affect the demo section (its own state).
        setRealProviders([]);
        setRealFacilities([]);
        console.error('Real providers search error:', error);
      });

    return () => {
      active = false;
    };
  }, [specialty, latitude, longitude, geoLoading, hasLocation]);



  // No full-page early returns: demo providers must render even while geolocation
  // is loading/denied or the real-provider request fails. Matching specialties are
  // only prioritized — never filtered — so minor wording differences (e.g.
  // "Physician" vs "General Medicine") can never empty the demo section.
  const sortedDemoDoctors = specialty
    ? [...demoDoctors].sort((a, b) => demoSpecialtyScore(specialty, b.specialty) - demoSpecialtyScore(specialty, a.specialty))
    : demoDoctors;

  // Helper: calculate approximate distance in km
  const calcDistanceKm = (lat1, lon1, lat2, lon2) => {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  };

  return (
    <main className="max-w-7xl mx-auto p-4 mt-6">
      <div className="flex flex-col md:flex-row gap-6 min-h-[calc(100vh-140px)]">

        {/* === SECTION: Recommended Specialist === */}
        {specialty && (
          <section className="w-full md:w-1/2 mb-6 md:mb-0">
            <h1 className="text-2xl font-bold mb-1">Recommended Specialist</h1>
            <p className="text-sm text-gray-600 mb-3">{specialty}</p>
            <p className="text-sm text-gray-700">The AI has recommended this specialist based on your symptoms.</p>
          </section>
        )}

        {/* === SECTION 1: DEMO PROVIDERS (always visible — loaded from local MongoDB) === */}
        <section className="w-full md:w-1/2 overflow-y-auto pr-1" aria-label="Demo providers">
          <h1 className="text-2xl font-bold mb-1">DEMO PROVIDERS</h1>
          <p className="text-sm text-gray-600 mb-5">
            Fictional demo providers used to demonstrate Clinova's appointment-booking workflow. Not real doctors.
          </p>

          {demoError && (
            <div className="rounded border border-red-200 bg-red-50 p-4 text-red-800" role="alert">
              <p>{demoError}</p>
            </div>
          )}

          {demoLoading && <p className="text-sm text-gray-600 py-3">Loading demo providers...</p>}

          {!demoLoading && !demoError && sortedDemoDoctors.length === 0 && (
            <p className="text-gray-700 py-3">Demo providers are unavailable right now.</p>
          )}

          <ul className="space-y-4">
            {sortedDemoDoctors.map((doctor) => {
              const doctorId = doctor.id || doctor._id;
              const facility = doctor.clinicName || doctor.hospitalName || 'Demo clinic';

              return (
                <li key={doctorId} className="bg-white p-4 rounded-lg shadow border flex justify-between items-center gap-4">
                  <div>
                    <h2 className="font-bold text-lg">{doctor.name}</h2>
                    <p className="text-sm text-gray-700">{doctor.specialty}</p>
                    <p className="text-sm text-gray-600">{facility}</p>
                    <span className="inline-block mt-2 px-2 py-0.5 text-xs font-bold rounded bg-teal-100 text-teal-800 border border-teal-200">
                      Demo Provider
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/book/${encodeURIComponent(doctorId)}${assessmentSessionId ? `?sessionId=${encodeURIComponent(assessmentSessionId)}` : ''}`)}
                    className="shrink-0 bg-teal-700 text-white px-4 py-2 rounded hover:bg-teal-800"
                  >
                    Book Appointment
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* === SECTION 2: Nearby Doctors === */}
        {hasLocation && realProviders.length > 0 && (
          <section className="w-full md:w-1/2 mb-6 md:mb-0">
            <h1 className="text-2xl font-bold mb-1">Nearby Doctors</h1>
            <p className="text-sm text-gray-600 mb-5">Real verified doctors near your current location.</p>

            <div className="space-y-4">
              {realProviders.map((provider) => {
                if (!provider.name) return null;
                const distanceKm = calcDistanceKm(latitude, longitude, provider.latitude, provider.longitude);
                return (
                  <div key={provider.name} className="bg-white p-4 rounded-lg shadow border flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <h2 className="font-bold text-lg truncate">{provider.name}</h2>
                      <p className="text-sm text-gray-600 truncate">{provider.facilityName || provider.address || 'Facility not specified'}</p>
                      {provider.address && <p className="text-xs text-gray-500">{provider.address}</p>}
                      {distanceKm !== null && <p className="text-xs text-gray-500">{distanceKm} km away</p>}
                    </div>
                    <div className="flex space-x-2">
                      {provider.sourceUrl && (
                        <button
                          type="button"
                          onClick={() => window.open(provider.sourceUrl, '_blank')}
                          className="flex-1 px-3 py-1 bg-teal-100 text-teal-800 text-xs font-medium rounded hover:bg-teal-200 transition-colors"
                        >
                          View Details
                        </button>
                      )}
                      {!provider.sourceUrl && (
                        <button
                          type="button"
                          onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(provider.name + ' ' + (provider.facilityName || '') + ' ' + latitude + ',' + longitude)}`, '_blank')}
                          className="flex-1 px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded hover:bg-gray-200 transition-colors"
                        >
                          View Details
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => navigator.clipboard ? navigator.clipboard.writeText(`${provider.name}\n${provider.address || ''}\n${distanceKm !== null ? distanceKm + ' km away' : ''}`) : null}
                        className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded hover:bg-gray-200 transition-color"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* === SECTION 3: Nearby Hospitals & Clinics === */}
        {hasLocation && realFacilities.length > 0 && (
          <section className="w-full md:w-1/2 mb-6 md:mb-0">
            <h1 className="text-2xl font-bold mb-1">Nearby Hospitals & Clinics</h1>
            <p className="text-sm text-gray-600 mb-5">Real healthcare facilities near your current location.</p>

            <div className="space-y-4">
              {realFacilities.map((facility) => {
                if (!facility.name) return null;
                const distanceKm = calcDistanceKm(latitude, longitude, facility.latitude, facility.longitude);
                const type = facility.type || 'clinic';
                return (
                  <div key={facility.name} className="bg-white p-4 rounded-lg shadow border flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <h2 className="font-bold text-lg truncate">{facility.name}</h2>
                      <p className="text-sm text-gray-600 truncate">{facility.address || 'Address not available'}</p>
                      {distanceKm !== null && <p className="text-xs text-gray-500">{distanceKm} km away</p>}
                    </div>
                    <div className="flex space-x-2">
                      {facility.sourceUrl && (
                        <button
                          type="button"
                          onClick={() => window.open(facility.sourceUrl, '_blank')}
                          className="flex-1 px-3 py-1 bg-teal-100 text-teal-800 text-xs font-medium rounded hover:bg-teal-200 transition-colors"
                        >
                          View Details
                        </button>
                      )}
                      {!facility.sourceUrl && (
                        <button
                          type="button"
                          onClick={() => window.open(`https://www.google.com/maps/search?q=${encodeURIComponent(facility.name + ' ' + facility.address)}`, '_blank')}
                          className="flex-1 px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded hover:bg-gray-200 transition-colors"
                        >
                          View Details
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* === SECTION 4: Map (needs geolocation — demo providers never do) === */}
        {!hasLocation ? (
          <section className="w-full md:w-1/2 h-[55vh] md:min-h-[400px] rounded-lg border p-6 flex flex-col items-center justify-center text-center" aria-label="Nearby results">
            {geoLoading ? (
              <Loader />
            ) : (
              <>
                <h2 className="text-xl font-bold mb-2">Nearby doctors &amp; map</h2>
                <p className="text-gray-700 mb-4">
                  Location access is needed to show nearby doctors, hospitals, and the map.
                  The demo providers above work without your location.
                </p>
                <button type="button" onClick={retryLocation} className="bg-teal-700 text-white px-4 py-2 rounded font-semibold hover:bg-teal-800">
                  Retry location
                </button>
              </>
            )}
          </section>
        ) : (
        <section className="w-full md:w-1/2 h-[55vh] md:h-auto min-h-[400px] rounded-lg overflow-hidden border" aria-label="Provider map">
          <MapContainer center={[latitude, longitude]} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            
            {/* User location marker */}
            <CircleMarker center={[latitude, longitude]} radius={9} pathOptions={{ color: '#0f766e', fillColor: '#14b8a6', fillOpacity: 0.9 }}>
              <Popup>Your current location</Popup>
            </CircleMarker>

            {/* Demo provider markers */}
            {sortedDemoDoctors.map((doctor) => {
              const coordinates = doctor.location?.coordinates;
              if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
              const [longitudeValue, latitudeValue] = coordinates;
              const doctorId = doctor.id || doctor._id;
              return (
                <Marker key={doctorId} position={[latitudeValue, longitudeValue]} icon={demoIcon}>
                  <Popup>
                    <strong>{doctor.name}</strong><br />
                    {doctor.clinicName || doctor.hospitalName}
                    <div>
                      <p className="text-xs text-gray-500">Demo provider</p>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* Real provider markers - ONLY if coordinates are verified */}
            {realProviders.map((provider) => {
              if (!provider.latitude || !provider.longitude) return null;
              return (
                <Marker key={provider.name} position={[provider.latitude, provider.longitude]} icon={realIcon}>
                  <Popup>
                    <strong>{provider.name}</strong><br />
                    {provider.facilityName || provider.address || ''}
                    {provider.distanceKm !== null && <p className="text-xs text-gray-500">{provider.distanceKm} km away</p>}
                  </Popup>
                </Marker>
              );
            })}

            {/* Real facility markers - ONLY if coordinates are verified */}
            {realFacilities.map((facility) => {
              if (!facility.latitude || !facility.longitude) return null;
              return (
                <Marker key={facility.name} position={[facility.latitude, facility.longitude]} icon={realIcon}>
                  <Popup>
                    <strong>{facility.name}</strong><br />
                    {facility.address || ''}
                    {facility.distanceKm !== null && <p className="text-xs text-gray-500">{facility.distanceKm} km away</p>}
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </section>
        )}
      </div>
    </main>
  );
}