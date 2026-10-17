import { useEffect, useState } from 'preact/hooks';

/** Live position while `on` is true. Returns {pos, error} */
export function useWatchPosition(on = true) {
  const [pos, setPos] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!on || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      p => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, heading: p.coords.heading }); setError(null); },
      e => setError(e.code === 1 ? 'Location is turned off for this site.' : 'Can\'t find your location right now.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [on]);
  return { pos, error };
}
