import { Link } from 'react-router-dom';
import { FaStethoscope, FaPrescription, FaUserMd } from 'react-icons/fa';

export default function HomePage() {
  return (
    <div className="bg-white">
      <div className="max-w-7xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl">
            Clinova AI Platform
          </h1>
          <p className="mt-4 text-xl text-gray-600">
            Virtual Patient Simulation & Clinical Skills Training
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link to="/symptoms" className="bg-teal-600 text-white px-6 py-3 rounded-md font-medium hover:bg-teal-700">
              Get Started
            </Link>
            <Link to="/login" className="bg-gray-100 text-teal-700 px-6 py-3 rounded-md font-medium hover:bg-gray-200">
              Login
            </Link>
          </div>
        </div>

        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="bg-gray-50 p-6 rounded-lg text-center">
            <FaStethoscope className="text-teal-600 text-4xl mx-auto mb-4" />
            <h3 className="text-lg font-bold">Symptom Analysis</h3>
            <p className="mt-2 text-gray-600">AI-powered preliminary diagnosis</p>
          </div>
          {/* Feature 2 */}
          <div className="bg-gray-50 p-6 rounded-lg text-center">
            <FaUserMd className="text-teal-600 text-4xl mx-auto mb-4" />
            <h3 className="text-lg font-bold">Doctor Discovery</h3>
            <p className="mt-2 text-gray-600">Find the right specialist nearby</p>
          </div>
          {/* Feature 3 */}
          <div className="bg-gray-50 p-6 rounded-lg text-center">
            <FaPrescription className="text-teal-600 text-4xl mx-auto mb-4" />
            <h3 className="text-lg font-bold">Prescription Vault</h3>
            <p className="mt-2 text-gray-600">Smart OCR extraction for prescriptions</p>
          </div>
        </div>
      </div>
    </div>
  );
}
