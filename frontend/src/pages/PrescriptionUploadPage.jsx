import { useState } from 'react';
import { uploadPrescription } from '../services/api';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function PrescriptionUploadPage() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleUpload = async (e) => {
    e.preventDefault();
    if(!file) return toast.error('Select a file');
    
    const formData = new FormData();
    formData.append('prescription', file); // IMPORTANT: Key is 'prescription'

    setLoading(true);
    try {
      await uploadPrescription(formData);
      toast.success('Uploaded successfully');
      navigate('/prescriptions');
    } catch(err) {
      toast.error('Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-4 mt-10 bg-white shadow rounded-lg">
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
  );
}
