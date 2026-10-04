import { useState, useEffect } from 'react';

export const useGeolocation = () => {
  const [location, setLocation] = useState({ latitude: null, longitude: null });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    let active = true;

    if (!navigator.geolocation) {
      setError('Location access is required to find nearby specialists.');
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!active) return;
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLoading(false);
      },
      () => {
        if (!active) return;
        setLocation({ latitude: null, longitude: null });
        setError('Location access is required to find nearby specialists.');
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );

    return () => {
      active = false;
    };
  }, [requestVersion]);

  const retry = () => setRequestVersion((version) => version + 1);

  return { ...location, error, loading, retry };
};
