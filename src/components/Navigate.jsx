import { useEffect, useMemo, useState } from 'preact/hooks';
import { useStore, setUi, openPlace, insertRow, toast } from '../lib/store.js';
import { computeRoute, decodePolyline, searchText, externalDirections, haversine, photoUrl } from '../lib/google.js';
import { fmtDuration, fmtDistance } from '../lib/time.js';
import { useActiveLeg, lodgingOf } from '../lib/legs.js';
import { useWatchPosition } from '../lib/geo.js';
import { GMap } from './GMap.jsx';
import { Icon, Spinner, Seg, Stars } from './ui.jsx';

const ALONG = [
  { id: 'sights', label: 'Sights', q: 'tourist attraction landmark', icon: '📸' },
  { id: 'cafes', label: 'Cafés', q: 'café coffee', icon: '☕' },
  { id: 'bakeries', label: 'Bakeries', q: 'bakery boulangerie', icon: '🥐' },
  { id: 'views', label: 'Views & parks', q: 'viewpoint park garden', icon: '🌳' },
  { id: 'shops', label: 'Shops', q: 'interesting shop boutique', icon: '🛍️' },
];

function distToPath(p, path) {
  let best = Infinity;
  for (let i = 0; i < path.length; i += 2) best = Math.min(best, haversine(p, path[i]));
  return best;
}

export function Navigate() {
  const dest = useStore(s => s.ui.nav);
  const { leg } = useActiveLeg();
  const { pos, error: geoErr } = useWatchPosition(!!dest);
  const [mode, setMode] = useState('WALK');
  const [route, setRoute] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [alongCat, setAlongCat] = useState('sights');
  const [along, setAlong] = useState([]);
  const [alongBusy, setAlongBusy] = useState(false);
  const [view, setView] = useState('along');
  const [origin, setOrigin] = useState(null);

  // pick an origin once: live location, or the lodging if location is unavailable
  useEffect(() => {
    if (!dest || origin) return;
    if (pos) setOrigin({ ...pos, label: 'You' });
    else if (geoErr) { const h = lodgingOf(leg); if (h) setOrigin({ ...h, label: h.name }); }
  }, [dest, pos, geoErr]);
  useEffect(() => { if (!dest) { setOrigin(null); setRoute(null); setAlong([]); } }, [dest]);
  useEffect(() => { const t = setTimeout(() => { if (dest && !origin) { const h = lodgingOf(leg); if (h) setOrigin({ ...h, label: h.name }); } }, 9000); return () => clearTimeout(t); }, [dest]);

  useEffect(() => {
    if (!dest || !origin) return;
    let dead = false;
    setBusy(true); setErr('');
    computeRoute(origin, dest, mode)
      .then(r => !dead && setRoute({ ...r, path: decodePolyline(r.polyline || '') }))
      .catch(e => !dead && setErr(e.message))
      .finally(() => !dead && setBusy(false));
    return () => { dead = true; };
  }, [dest, origin, mode]);

  useEffect(() => {
    if (!route?.polyline) return;
    let dead = false;
    setAlongBusy(true);
    const c = ALONG.find(a => a.id === alongCat);
    searchText({ query: c.q, encodedPolyline: route.polyline, max: 20 })
      .then(list => {
        if (dead) return;
        const near = list
          .map(p => ({ ...p, off: distToPath(p, route.path) }))
          .filter(p => p.off < 250 && p.place_id !== dest.place_id && haversine(p, dest) > 60)
          .map(p => ({ ...p, prog: route.path.findIndex(pt => haversine(pt, p) < Math.max(80, p.off + 30)) }))
          .sort((a, b) => a.prog - b.prog);
        setAlong(near.slice(0, 12));
      })
      .catch(() => !dead && setAlong([]))
      .finally(() => !dead && setAlongBusy(false));
    return () => { dead = true; };
  }, [route?.polyline, alongCat]);

  const markers = useMemo(() => {
    if (!dest) return [];
    const m = [{ id: 'dest', lat: dest.lat, lng: dest.lng, label: '★', kind: 'dest', title: dest.name }];
    if (origin && origin.label !== 'You') m.push({ id: 'o', lat: origin.lat, lng: origin.lng, label: '⌂', kind: 'home' });
    along.forEach((p, i) => m.push({ id: p.place_id, lat: p.lat, lng: p.lng, label: ALONG.find(a => a.id === alongCat).icon, kind: 'along', title: p.name, onClick: () => openPlace(p) }));
    return m;
  }, [dest, origin, along]);

  if (!dest) return null;
  const ext = externalDirections(dest, mode === 'TRANSIT' ? 'transit' : mode === 'DRIVE' ? 'driving' : 'walking');

  async function savePlace(p) {
    try { await insertRow('saved_places', { place_id: p.place_id, name: p.name, category: alongCat, address: p.address, lat: p.lat, lng: p.lng, meta: p }); toast('★ Saved'); }
    catch (e) { toast(e.message, 'error'); }
  }

  return (
    <div class="nav-screen">
      <div class="nav-top">
        <button class="icon-btn solid" onClick={() => setUi({ nav: null })} aria-label="Back"><Icon name="back" /></button>
        <div class="nav-title">
          <small class="muted">To</small>
          <b>{dest.name}</b>
        </div>
      </div>
      <GMap class="nav-map" center={dest} markers={markers} path={route?.path} me={pos} fitKey={(route?.polyline || '') + '|me'} />
      <div class="nav-panel">
        <Seg value={mode} onChange={m => setMode(m)} options={[{ value: 'WALK', label: 'Walk', icon: 'walk' }, { value: 'TRANSIT', label: 'Transit', icon: 'bus' }, { value: 'DRIVE', label: 'Drive', icon: 'car' }]} />
        {!origin && <Spinner label={geoErr || 'Finding where you are…'} />}
        {busy && <Spinner label="Plotting the route…" />}
        {err && <div class="card notice err">{err}</div>}
        {route && !busy && (
          <div class="route-sum">
            <div><b class="big-num">{fmtDuration(route.seconds)}</b><span class="muted"> · {fmtDistance(route.meters)}</span></div>
            <small class="muted">from {origin?.label === 'You' ? 'your location' : origin?.label}{pos && origin?.label === 'You' ? '' : ''}</small>
          </div>
        )}
        <div class="go-row">
          <a class="btn primary" href={ext.google} target="_blank" rel="noopener"><Icon name="nav" />Turn-by-turn in Google Maps</a>
          <a class="btn" href={ext.apple} target="_blank" rel="noopener">Apple Maps</a>
        </div>

        <Seg value={view} onChange={setView} options={[{ value: 'along', label: 'Along the way', icon: 'sparkle' }, { value: 'steps', label: 'Directions', icon: 'list' }]} />
        {view === 'along' && (
          <>
            <div class="chips scroll-x">
              {ALONG.map(a => <button class={'chip ' + (alongCat === a.id ? 'on' : '')} onClick={() => setAlongCat(a.id)}>{a.icon} {a.label}</button>)}
            </div>
            {alongBusy && <Spinner label="Looking along your route…" />}
            {!alongBusy && route && !along.length && <p class="muted center">Nothing notable right on this route. Try another type.</p>}
            {along.map(p => (
              <div class="along-row">
                <div class="thumb sm" onClick={() => openPlace(p)}>{p.photo ? <img loading="lazy" src={photoUrl(p.photo, 160)} alt="" /> : '📍'}</div>
                <div class="info" onClick={() => openPlace(p)}>
                  <b>{p.name}</b>
                  <div class="meta"><Stars rating={p.rating} count={p.ratingCount} /><span>{p.off < 40 ? 'right on route' : `${Math.round(p.off / 10) * 10} m off route`}</span></div>
                </div>
                <button class="icon-btn" onClick={() => savePlace(p)} aria-label="Save"><Icon name="bookmark" /></button>
              </div>
            ))}
          </>
        )}
        {view === 'steps' && route && (
          <ol class="steps">
            {route.steps.map(s => <li><span>{s.text}</span>{s.meters ? <small class="muted"> {fmtDistance(s.meters)}</small> : null}</li>)}
          </ol>
        )}
      </div>
    </div>
  );
}
