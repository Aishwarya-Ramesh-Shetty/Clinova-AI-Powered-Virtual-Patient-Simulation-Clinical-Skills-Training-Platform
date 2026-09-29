import { useState } from 'react';
import { uploadPrescription } from '../services/api';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function PrescriptionUploadPage() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const navigate = useNavigate();

  const handleUpload = async (e) => {
    e.preventDefault();
    if(!file) return toast.error('Select a file');
    
    const formData = new FormData();
    formData.append('prescription', file); // IMPORTANT: Key is 'prescription'

    setLoading(true);
    setExtractedData(null);
    try {
      const res = await uploadPrescription(formData);
      toast.success('Uploaded successfully');
      setExtractedData(res.data.prescription.extractedData);
    } catch(err) {
      toast.error('Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 mt-10">
      <div className="bg-white shadow rounded-lg p-6 mb-6 max-w-xl mx-auto">
        <h2 className="text-2xl font-bold mb-4">Upload Prescription</h2>
        <form onSubmit={handleUpload}>
          <input 
            type="file" 
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files[0])}
            className="w-full border p-2 mb-4"
          />
          {file && <p className="mb-4 text-sm text-gray-600">Selected: {file.name}</p>}
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-teal-600 text-white py-2 rounded hover:bg-teal-700 disabled:opacity-50"
          >
            {loading ? 'Extracting via AI...' : 'Upload & Extract'}
          </button>
        </form>
      </div>

      {extractedData && (
        <div className="bg-white shadow rounded-lg p-6 mt-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Extraction Results</h3>
          
          <div className="overflow-x-auto mb-6">
            <table className="min-w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-100 text-gray-700">
                  <th className="p-3 border-b">Medicine Name</th>
                  <th className="p-3 border-b">Dosage</th>
                  <th className="p-3 border-b">Frequency</th>
                  <th className="p-3 border-b">Duration</th>
                  <th className="p-3 border-b">Instructions</th>
                </tr>
              </thead>
              <tbody>
                {extractedData.medicines?.map((med, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-semibold text-teal-800">{med.name}</td>
                    <td className="p-3">{med.dosage}</td>
                    <td className="p-3">{med.frequency}</td>
                    <td className="p-3">{med.duration}</td>
                    <td className="p-3 text-sm text-gray-600">{med.instructions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 bg-gray-50 p-4 rounded border">
            <div>
              <p className="text-sm text-gray-500 font-semibold">Doctor Name</p>
              <p className="text-gray-800 font-medium">{extractedData.doctorName || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-semibold">Date</p>
              <p className="text-gray-800 font-medium">{extractedData.date || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-semibold">Diagnosis</p>
              <p className="text-gray-800 font-medium">{extractedData.diagnosis || 'N/A'}</p>
            </div>
          </div>

          <div className="text-center">
            <Link to="/prescriptions" className="inline-block bg-gray-800 text-white px-6 py-2 rounded hover:bg-gray-900 font-semibold">
              View Prescription Vault
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
