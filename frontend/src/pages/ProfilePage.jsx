import { useAuth } from '../context/AuthContext';

export default function ProfilePage() {
  const { user } = useAuth();
  if(!user) return null;

  return (
    <div className="max-w-2xl mx-auto p-4 mt-8 bg-white shadow rounded-lg">
      <h2 className="text-2xl font-bold mb-4">My Profile</h2>
      <div className="space-y-3">
        <p><strong>Name:</strong> {user.name}</p>
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Phone:</strong> {user.phone}</p>
        <p><strong>Gender:</strong> {user.gender}</p>
      </div>
    </div>
  );
}
