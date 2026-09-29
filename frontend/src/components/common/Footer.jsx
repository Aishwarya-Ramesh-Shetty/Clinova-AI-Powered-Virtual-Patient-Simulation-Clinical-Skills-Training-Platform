export default function Footer() {
  return (
    <footer className="bg-gray-800 text-gray-300 py-6 mt-10">
      <div className="max-w-7xl mx-auto px-4 text-center text-sm">
        <p>&copy; {new Date().getFullYear()} Clinova AI Platform. All rights reserved.</p>
        <p className="mt-2 text-gray-500">Not a replacement for professional medical advice.</p>
      </div>
    </footer>
  );
}
