import { useState } from 'react';
import { FaUserMd } from 'react-icons/fa';

export default function ImageWithFallback({ src, alt, className, fallbackIconSize = '3em' }) {
  const [error, setError] = useState(false);

  if (error || !src) {
    return (
      <div className={`flex items-center justify-center bg-gray-200 text-gray-400 ${className}`}>
        <FaUserMd size={fallbackIconSize} />
      </div>
    );
  }

  return (
    <img 
      src={src} 
      alt={alt} 
      className={className} 
      onError={() => setError(true)} 
    />
  );
}
