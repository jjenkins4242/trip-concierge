import { useStore } from './store.js';
import { legForDate, todayIn, deviceTz, legTz } from './time.js';

export function useActiveLeg() {
  const legs = useStore(s => s.legs);
  const legId = useStore(s => s.ui.legId);
  const leg = legs.find(l => l.id === legId) || legForDate(legs, todayIn(deviceTz()));
  return { leg, legs, tz: legTz(leg) };
}

export const lodgingOf = leg => (leg && leg.lat != null ? { lat: leg.lat, lng: leg.lng, name: leg.lodging_name || leg.city } : null);
