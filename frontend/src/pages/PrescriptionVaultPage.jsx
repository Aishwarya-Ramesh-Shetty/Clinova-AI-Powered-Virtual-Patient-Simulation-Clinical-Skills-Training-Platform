import { useState, useEffect } from 'react';
import { getPrescriptions } from '../services/api';
import { Link } from 'react-router-dom';

export default function PrescriptionVaultPage() {
  const [prescriptions, setPrescriptions] = useState([]);

  useEffect(() => {
    getPrescriptions().then(res => setPrescriptions(res.data.prescriptions)).catch(console.error);
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-4 mt-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Prescription Vault</h2>
        <Link to="/prescriptions/upload" className="bg-teal-600 text-white px-4 py-2 rounded">Upload New</Link>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {prescriptions.map(p => (
          <div key={p.id} className="bg-white p-4 rounded shadow border">
            <h3 className="font-bold text-lg">{p.extractedData.doctor_name || 'Unknown Doctor'}</h3>
            <p className="text-sm text-gray-500">{new Date(p.createdAt).toLocaleDateString()}</p>
            <div className="mt-4">
              <h4 className="font-semibold text-sm mb-1">Medicines:</h4>
              <ul className="text-sm list-disc pl-4 space-y-1">
                {p.extractedData.medicines?.map((m, i) => (
                  <li key={i}>{m.name} - {m.dosage}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
