// Google Maps Platform: Maps JS (display), Places API (New) + Routes API (REST, CORS-enabled).

let apiKey = null;
let loadPromise = null;
const cache = new Map();

export function setApiKey(k) {
  if (k && k !== apiKey) { apiKey = k.trim(); }
}
export const hasKey = () => !!apiKey;

export function loadMaps() {
  if (!apiKey) return Promise.reject(new Error('No Google Maps key yet'));
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    window.__gmReady = () => resolve(window.google.maps);
    window.gm_authFailure = () => reject(new Error('Google rejected the Maps key. Check that Maps JavaScript API is enabled and the key allows this website.'));
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=marker,geometry&loading=async&callback=__gmReady`;
    s.async = true;
    s.onerror = () => { loadPromise = null; reject(new Error('Could not load Google Maps (offline?)')); };
    document.head.appendChild(s);
  });
  return loadPromise;
}

const PLACE_FIELDS = [
  'id', 'displayName', 'formattedAddress', 'shortFormattedAddress', 'location', 'rating', 'userRatingCount',
  'priceLevel', 'currentOpeningHours.openNow', 'currentOpeningHours.weekdayDescriptions', 'photos', 'primaryType',
  'primaryTypeDisplayName', 'googleMapsUri', 'editorialSummary', 'websiteUri', 'nationalPhoneNumber', 'types',
];

async function gpost(url, body, fields, cacheable = true) {
  if (!apiKey) throw new Error('Add your Google Maps key in Trip → Settings first.');
  const ck = url + JSON.stringify(body);
  if (cacheable && cache.has(ck)) return cache.get(ck);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': fields },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `Google error ${res.status}`;
    const hint = /not been used|disabled|SERVICE_DISABLED/i.test(msg)
      ? (url.includes('routes') ? ' → Enable "Routes API" for this key.' : ' → Enable "Places API (New)" for this key.')
      : /referer|referrer/i.test(msg) ? ' → Add this site to the key\'s website restrictions.' : '';
    throw new Error(msg + hint);
  }
  if (cacheable) cache.set(ck, json);
  return json;
}

const lang = () => (navigator.language || 'en').slice(0, 2);

export function normalizePlace(p) {
  return {
    place_id: p.id,
    name: p.displayName?.text || 'Unnamed',
    address: p.shortFormattedAddress || p.formattedAddress || '',
    fullAddress: p.formattedAddress || '',
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    rating: p.rating,
    ratingCount: p.userRatingCount,
    price: priceLabel(p.priceLevel),
    openNow: p.currentOpeningHours?.openNow,
    hours: p.currentOpeningHours?.weekdayDescriptions,
    photo: p.photos?.[0]?.name,
    photos: (p.photos || []).slice(0, 6).map(x => x.name),
    type: p.primaryTypeDisplayName?.text || '',
    primaryType: p.primaryType,
    types: p.types || [],
    mapsUri: p.googleMapsUri,
    summary: p.editorialSummary?.text || '',
    website: p.websiteUri,
    phone: p.nationalPhoneNumber,
  };
}

function priceLabel(level) {
  const m = { PRICE_LEVEL_FREE: 'Free', PRICE_LEVEL_INEXPENSIVE: '€', PRICE_LEVEL_MODERATE: '€€', PRICE_LEVEL_EXPENSIVE: '€€€', PRICE_LEVEL_VERY_EXPENSIVE: '€€€€' };
  return m[level] || '';
}

export function photoUrl(name, w = 600) {
  if (!name || !apiKey) return null;
  return `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${w}&key=${encodeURIComponent(apiKey)}`;
}

export async function searchNearby({ lat, lng, types, radius = 1200, rank = 'POPULARITY', max = 20 }) {
  const body = {
    includedTypes: types,
    maxResultCount: Math.min(max, 20),
    rankPreference: rank,
    languageCode: lang(),
    locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } },
  };
  const fm = PLACE_FIELDS.map(f => 'places.' + f).join(',');
  let json;
  try {
    json = await gpost('https://places.googleapis.com/v1/places:searchNearby', body, fm);
  } catch (e) {
    if (types.length > 1 && /type/i.test(e.message)) json = await gpost('https://places.googleapis.com/v1/places:searchNearby', { ...body, includedTypes: [types[0]] }, fm);
    else throw e;
  }
  return (json.places || []).map(normalizePlace);
}

export async function searchText({ query, lat, lng, radius = 3000, includedType, encodedPolyline, max = 20, cacheable = true }) {
  const body = { textQuery: query, pageSize: Math.min(max, 20), languageCode: lang() };
  if (includedType) body.includedType = includedType;
  if (encodedPolyline) body.searchAlongRouteParameters = { polyline: { encodedPolyline } };
  else if (lat != null) body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius } };
  const json = await gpost('https://places.googleapis.com/v1/places:searchText', body, PLACE_FIELDS.map(f => 'places.' + f).join(','), cacheable);
  return (json.places || []).map(normalizePlace);
}

/** Address / hotel name -> {lat,lng,address,name} */
export async function geocode(query, near) {
  const r = await searchText({ query, max: 1, ...(near || {}) });
  return r[0] || null;
}

export async function computeRoute(origin, dest, mode = 'WALK') {
  const body = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: { location: { latLng: { latitude: dest.lat, longitude: dest.lng } } },
    travelMode: mode,
    languageCode: navigator.language || 'en',
    units: 'METRIC',
  };
  if (mode === 'TRANSIT') body.departureTime = new Date(Date.now() + 60000).toISOString();
  const fields = 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction,routes.legs.steps.distanceMeters,routes.legs.steps.travelMode,routes.legs.steps.transitDetails.transitLine.nameShort,routes.legs.steps.transitDetails.transitLine.name,routes.legs.steps.transitDetails.stopDetails.departureStop.name,routes.legs.steps.transitDetails.stopDetails.arrivalStop.name,routes.legs.steps.transitDetails.stopCount';
  const json = await gpost('https://routes.googleapis.com/directions/v2:computeRoutes', body, fields, false);
  const r = json.routes?.[0];
  if (!r) throw new Error(mode === 'TRANSIT' ? 'No transit route found — try walking.' : 'No route found.');
  return {
    seconds: parseInt(r.duration || '0', 10),
    meters: r.distanceMeters,
    polyline: r.polyline?.encodedPolyline,
    steps: (r.legs || []).flatMap(l => l.steps || []).map(s => ({
      text: s.navigationInstruction?.instructions || (s.transitDetails ? `Take ${s.transitDetails.transitLine?.nameShort || s.transitDetails.transitLine?.name || 'transit'} from ${s.transitDetails.stopDetails?.departureStop?.name || ''} to ${s.transitDetails.stopDetails?.arrivalStop?.name || ''} (${s.transitDetails.stopCount || '?'} stops)` : ''),
      meters: s.distanceMeters,
      mode: s.travelMode,
    })).filter(s => s.text),
  };
}

export function decodePolyline(str) {
  let index = 0, lat = 0, lng = 0; const out = [];
  while (index < str.length) {
    let b, shift = 0, result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}

export function haversine(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return Infinity;
  const R = 6371000, toR = x => x * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** rough walking minutes between two points (street factor 1.3, 4.8 km/h) */
export const walkMinutes = (a, b) => Math.round((haversine(a, b) * 1.3) / 80);

export function externalDirections(dest, mode = 'walking') {
  const g = `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}${dest.place_id ? `&destination_place_id=${dest.place_id}` : ''}&travelmode=${mode}`;
  const a = `https://maps.apple.com/?daddr=${dest.lat},${dest.lng}&dirflg=${mode === 'transit' ? 'r' : mode === 'driving' ? 'd' : 'w'}`;
  return { google: g, apple: a };
}

export const CATEGORIES = [
  { id: 'restaurants', label: 'Restaurants', icon: '🍽️', types: ['restaurant'] },
  { id: 'cafes', label: 'Cafés', icon: '☕', types: ['cafe', 'coffee_shop'] },
  { id: 'bakeries', label: 'Bakeries', icon: '🥐', types: ['bakery'] },
  { id: 'grocery', label: 'Grocery', icon: '🛒', types: ['grocery_store', 'supermarket'] },
  { id: 'bars', label: 'Bars & pubs', icon: '🍷', types: ['bar', 'pub', 'wine_bar'] },
  { id: 'sights', label: 'Tourist sights', icon: '📸', types: ['tourist_attraction', 'historical_landmark'] },
  { id: 'museums', label: 'Museums', icon: '🏛️', types: ['museum', 'art_gallery'] },
  { id: 'parks', label: 'Parks & gardens', icon: '🌳', types: ['park'] },
  { id: 'shopping', label: 'Shopping', icon: '🛍️', types: ['clothing_store', 'book_store', 'gift_shop', 'shopping_mall'] },
  { id: 'nightlife', label: 'Nightlife', icon: '🌙', types: ['night_club', 'bar'] },
  { id: 'pharmacy', label: 'Pharmacy', icon: '💊', types: ['pharmacy', 'drugstore'] },
  { id: 'gems', label: 'Hidden gems', icon: '💎', text: 'hidden gem local favorite' },
];

export const catById = id => CATEGORIES.find(c => c.id === id);

export function guessCategory(place) {
  const t = new Set([place.primaryType, ...(place.types || [])]);
  for (const c of CATEGORIES) if (c.types?.some(x => t.has(x))) return c.id;
  return 'sights';
}
