import { useEffect, useMemo, useState } from 'preact/hooks';
import { useStore, openPlace, setUi } from '../lib/store.js';
import { CATEGORIES, catById, searchNearby, searchText, photoUrl, haversine, hasKey } from '../lib/google.js';
import { fmtDistance } from '../lib/time.js';
import { useActiveLeg, lodgingOf } from '../lib/legs.js';
import { useWatchPosition } from '../lib/geo.js';
import { GMap } from './GMap.jsx';
import { Icon, Spinner, Empty, Stars } from './ui.jsx';
import { LegSwitch } from './LegSwitch.jsx';
import { fromSaved } from './PlaceSheet.jsx';

export function Explore() {
  const { leg } = useActiveLeg();
  const saved = useStore(s => s.places);
  const trip = useStore(s => s.trip);
  const [cat, setCat] = useState(() => { try { return localStorage.getItem('tc.cat') || 'cafes'; } catch { return 'cafes'; } });
  const [nearMe, setNearMe] = useState(false);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [active, setActive] = useState(null);
  const { pos, error: geoErr } = useWatchPosition(nearMe);

  const home = lodgingOf(leg);
  const anchor = nearMe ? pos : home;

  useEffect(() => { try { localStorage.setItem('tc.cat', cat); } catch {} }, [cat]);

  useEffect(() => {
    if (!anchor || !hasKey() || cat === 'saved') return;
    let dead = false;
    setBusy(true); setErr('');
    const c = catById(cat);
    const run = query
      ? searchText({ query, lat: anchor.lat, lng: anchor.lng, radius: 2500 })
      : c.text ? searchText({ query: c.text, lat: anchor.lat, lng: anchor.lng, radius: 2000 })
      : searchNearby({ lat: anchor.lat, lng: anchor.lng, types: c.types, radius: cat === 'grocery' || cat === 'pharmacy' ? 900 : 1500 });
    run.then(r => !dead && setResults(r.map(p => ({ ...p, dist: haversine(anchor, p) }))))
      .catch(e => !dead && setErr(e.message))
      .finally(() => !dead && setBusy(false));
    return () => { dead = true; };
  }, [cat, query, anchor && Math.round(anchor.lat * 2000), anchor && Math.round(anchor.lng * 2000), trip?.google_maps_key]);

  const list = cat === 'saved'
    ? saved.map(r => fromSaved(r)).map(p => ({ ...p, dist: anchor ? haversine(anchor, p) : null, _saved: true }))
    : results;

  const markers = useMemo(() => {
    const m = list.map((p, i) => ({ id: p.place_id || p.id, lat: p.lat, lng: p.lng, label: String(i + 1), title: p.name, active: active === i, onClick: () => { setActive(i); document.getElementById('pl-' + i)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }));
    if (home) m.push({ id: 'home', lat: home.lat, lng: home.lng, label: '⌂', kind: 'home', title: home.name });
    return m;
  }, [list, active, home?.lat]);

  return (
    <div class="page explore">
      <header class="top">
        <LegSwitch />
        <div class="anchor-row">
          <button class={'chip ' + (!nearMe ? 'on' : '')} onClick={() => setNearMe(false)}><Icon name="suitcase" size={15} />{leg?.lodging_name ? `Near ${leg.lodging_name}` : 'Near our stay'}</button>
          <button class={'chip ' + (nearMe ? 'on' : '')} onClick={() => setNearMe(true)}><Icon name="locate" size={15} />Near me</button>
        </div>
      </header>

      {!home && !nearMe && (
        <div class="card notice">
          <b>Where are you staying in {leg?.city || 'this city'}?</b>
          <p class="muted">Add your hotel or address so I can find what's around you.</p>
          <button class="btn primary" onClick={() => setUi({ lodgingFor: leg?.id })}><Icon name="pin" />Set where we're staying</button>
        </div>
      )}
      {nearMe && geoErr && <div class="card notice err">{geoErr}</div>}

      <div class="finder">
        <label class="select">
          <span class="sr">Category</span>
          <select value={cat} onChange={e => { setCat(e.currentTarget.value); setQuery(''); setQ(''); setActive(null); }}>
            {CATEGORIES.map(c => <option value={c.id}>{c.icon}  {c.label}</option>)}
            <option value="saved">★  Saved by us ({saved.length})</option>
          </select>
          <Icon name="chevron" class="rot90" size={16} />
        </label>
        <form class="search" onSubmit={e => { e.preventDefault(); setQuery(q.trim()); setActive(null); if (cat === 'saved') setCat('restaurants'); }}>
          <input value={q} onInput={e => setQ(e.currentTarget.value)} placeholder="Search: crêpes, Louvre, pub with music…" enterkeyhint="search" />
          {query && <button type="button" class="icon-btn" onClick={() => { setQ(''); setQuery(''); }} aria-label="Clear"><Icon name="x" size={16} /></button>}
        </form>
      </div>

      <div class="chips scroll-x">
        {CATEGORIES.slice(0, 9).map(c => (
          <button class={'chip ' + (cat === c.id && !query ? 'on' : '')} onClick={() => { setCat(c.id); setQuery(''); setQ(''); setActive(null); }}>{c.icon} {c.label}</button>
        ))}
      </div>

      <GMap class="explore-map" center={anchor || home} zoom={15} markers={markers} me={nearMe ? pos : null} fitKey={`${cat}|${query}|${list.length}|${nearMe}`} />

      <section class="results">
        {busy && <Spinner label="Finding the good spots…" />}
        {err && <div class="card notice err">{err}</div>}
        {!busy && !err && list.length === 0 && ((anchor && hasKey()) || cat === 'saved') && (
          <Empty icon={cat === 'saved' ? 'bookmark' : 'compass'} title={cat === 'saved' ? 'Nothing saved yet' : 'No results here'}>
            {cat === 'saved' ? 'Tap ★ Save on any place and it shows up here on both phones.' : 'Try another category or search.'}
          </Empty>
        )}
        {list.map((p, i) => (
          <article id={'pl-' + i} class={'place-row ' + (active === i ? 'active' : '')} onClick={() => { setActive(i); openPlace(p); }}>
            <div class="thumb">
              {p.photo ? <img loading="lazy" src={photoUrl(p.photo, 240)} alt="" /> : <span>{catById(p.category || cat)?.icon || '📍'}</span>}
              <b class="num">{i + 1}</b>
            </div>
            <div class="info">
              <h3>{p.name}</h3>
              <div class="meta">
                <Stars rating={p.rating} count={p.ratingCount} />
                {p.price && <span>{p.price}</span>}
                {p.type && <span>{p.type}</span>}
              </div>
              <div class="meta">
                {p.dist != null && isFinite(p.dist) && <span><Icon name="walk" size={13} /> {Math.max(1, Math.round(p.dist * 1.3 / 80))} min · {fmtDistance(p.dist)}</span>}
                {p.openNow === true && <span class="open">Open now</span>}
                {p.openNow === false && <span class="closed">Closed</span>}
                {p._saved && p.notes && <span class="muted">“{p.notes}”</span>}
              </div>
            </div>
            <Icon name="chevron" size={18} class="muted" />
          </article>
        ))}
      </section>
    </div>
  );
}
