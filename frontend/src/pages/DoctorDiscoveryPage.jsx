import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { searchDoctors } from '../services/api';
import { useGeolocation } from '../hooks/useGeolocation';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import Loader from '../components/common/Loader';
import ImageWithFallback from '../components/common/ImageWithFallback';

export default function DoctorDiscoveryPage() {
  const [searchParams] = useSearchParams();
  const specialty = searchParams.get('specialty') || '';
  const [doctors, setDoctors] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const { latitude, longitude, loading: geoLoading } = useGeolocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!geoLoading && latitude && longitude) {
      fetchDoctors();
    }
  }, [geoLoading, latitude, longitude, specialty]);

  const fetchDoctors = async () => {
    setLoadingDocs(true);
    try {
      const res = await searchDoctors({ specialty, lat: latitude, lng: longitude, radius: 10 });
      setDoctors(res.data.doctors);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDocs(false);
    }
  };

  if (geoLoading || loadingDocs) return <div className="mt-20"><Loader /></div>;

  return (
    <div className="max-w-7xl mx-auto p-4 flex flex-col md:flex-row gap-6 h-[calc(100vh-100px)]">
      <div className="w-full md:w-1/2 overflow-y-auto pr-2">
        <h2 className="text-2xl font-bold mb-4">Nearby {specialty}s</h2>
        <div className="space-y-4">
          {doctors.map(doc => (
            <div key={doc.id} className="bg-white p-4 rounded-lg shadow border flex justify-between items-center gap-4">
              <div className="flex gap-4 items-center">
                <ImageWithFallback 
                  src={doc.profileImageUrl} 
                  alt={doc.name} 
                  className="w-16 h-16 rounded-full object-cover border-2 border-teal-100 flex-shrink-0" 
                  fallbackIconSize="1.5em"
                />
                <div>
                  <h3 className="font-bold text-lg">{doc.name}</h3>
                  <p className="text-sm text-gray-600">{doc.clinicName}</p>
                  <p className="text-sm">Rating: {doc.rating} ⭐ | Exp: {doc.experience} yrs</p>
                  <p className="text-sm font-semibold text-teal-700">Fee: ₹{doc.consultationFee}</p>
                </div>
              </div>
              <button 
                onClick={() => navigate(`/book/${doc.id}`)}
                className="bg-teal-600 text-white px-4 py-2 rounded hover:bg-teal-700 flex-shrink-0"
              >
                Book
              </button>
            </div>
          ))}
          {doctors.length === 0 && <p>No doctors found nearby.</p>}
        </div>
      </div>
      
      <div className="w-full md:w-1/2 h-full min-h-[400px] bg-gray-100 rounded-lg overflow-hidden">
        {latitude && longitude && (
          <MapContainer center={[latitude, longitude]} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {doctors.map(doc => (
              <Marker key={doc.id} position={[doc.location.coordinates[1], doc.location.coordinates[0]]}>
                <Popup>
                  <strong>{doc.name}</strong><br/>{doc.clinicName}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>
    </div>
  );
}
