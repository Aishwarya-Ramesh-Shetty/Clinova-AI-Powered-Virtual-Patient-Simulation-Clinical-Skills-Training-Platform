import React from 'react';
import { Link } from 'react-router-dom';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] p-4 text-center">
          <div className="bg-red-50 p-6 rounded-lg max-w-lg shadow-sm border border-red-100">
            <h2 className="text-2xl font-bold text-red-700 mb-4">Something went wrong</h2>
            <p className="text-gray-700 mb-6">
              We're sorry, an unexpected error occurred while loading this page.
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 transition"
              >
                Reload Page
              </button>
              <a
                href="/"
                className="bg-gray-200 text-gray-800 px-6 py-2 rounded hover:bg-gray-300 transition"
              >
                Go Home
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
