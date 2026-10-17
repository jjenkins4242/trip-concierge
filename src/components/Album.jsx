import { useEffect, useMemo, useState } from 'preact/hooks';
import { useStore, memberName, me, toast, updateRow, goTab } from '../lib/store.js';
import { signedUrls, deletePhoto } from '../lib/photos.js';
import { tripDays, legForDate, fmtDayLong, fmtTime, legTz } from '../lib/time.js';
import { GMap } from './GMap.jsx';
import { Icon, Seg, Empty } from './ui.jsx';

const urlStore = { urls: {}, listeners: new Set() };
async function ensureUrls(paths) {
  const need = paths.filter(p => !urlStore.urls[p]);
  if (!need.length) return;
  for (let i = 0; i < need.length; i += 100) Object.assign(urlStore.urls, await signedUrls(need.slice(i, i + 100)));
  urlStore.listeners.forEach(l => l());
}
function useUrls(paths) {
  const [, f] = useState(0);
  useEffect(() => { const l = () => f(x => x + 1); urlStore.listeners.add(l); return () => urlStore.listeners.delete(l); }, []);
  useEffect(() => { ensureUrls(paths).catch(() => {}); }, [paths.join('|')]);
  return urlStore.urls;
}

const goAlbum = () => goTab('album');
let openViewer = goAlbum;

export function PhotoThumb({ p, list }) {
  const urls = useUrls([p.storage_path]);
  return (
    <button class="ph-thumb" onClick={() => openViewer(p, list)}>
      {urls[p.storage_path] ? <img loading="lazy" src={urls[p.storage_path]} alt={p.caption || p.place_name || ''} /> : <span class="ph-skel" />}
    </button>
  );
}

export function Album() {
  const photos = useStore(s => s.photos);
  const legs = useStore(s => s.legs);
  const members = useStore(s => s.members);
  const [by, setBy] = useState('day');
  const [viewer, setViewer] = useState(null);
  openViewer = (p, list) => setViewer({ id: p.id, list: (list || photos).map(x => x.id) });
  const urls = useUrls(by === 'map' ? photos.map(p => p.storage_path) : []);
  const days = tripDays(legs);
  useEffect(() => () => { openViewer = goAlbum; }, []);

  const groups = useMemo(() => {
    const g = new Map();
    const key = p => by === 'day' ? p.trip_day : by === 'place' ? (p.place_name || 'Somewhere') : p.taken_by;
    for (const p of photos) { const k = key(p) || '—'; if (!g.has(k)) g.set(k, []); g.get(k).push(p); }
    let arr = [...g.entries()];
    if (by === 'day') arr.sort((a, b) => b[0].localeCompare(a[0]));
    else arr.sort((a, b) => b[1].length - a[1].length);
    return arr;
  }, [photos, by]);

  const label = k => {
    if (by === 'day') { const n = days.indexOf(k) + 1; const l = legForDate(legs, k); return <>{n > 0 ? `Day ${n} · ` : ''}{fmtDayLong(k)} <span class="muted">· {l?.city}</span></>; }
    if (by === 'person') return k === me() ? 'Taken by you' : `Taken by ${memberName(k)}`;
    return k;
  };

  const markers = useMemo(() => by !== 'map' ? [] : photos.filter(p => p.lat != null).map(p => ({ id: p.id, lat: p.lat, lng: p.lng, kind: 'photo', img: urls[p.storage_path], onClick: () => openViewer(p) })), [by, photos, urls]);

  return (
    <div class="page album">
      <header class="top">
        <div class="title-row"><h1>Album</h1><span class="muted">{photos.length} photo{photos.length === 1 ? '' : 's'}</span></div>
        <Seg value={by} onChange={setBy} options={[{ value: 'day', label: 'Day' }, { value: 'place', label: 'Place' }, { value: 'person', label: 'Person' }, { value: 'map', label: 'Map' }]} />
      </header>
      {!photos.length && <Empty icon="images" title="No photos yet">Photos either of you take with the Camera tab show up here instantly.</Empty>}
      {by === 'map' ? (
        <GMap class="album-map" markers={markers} fitKey={'photos' + markers.length} />
      ) : groups.map(([k, ps]) => (
        <section class="ph-group">
          <h2>{label(k)} <span class="count">{ps.length}</span></h2>
          <div class="grid3">{ps.map(p => <PhotoThumb p={p} list={ps} />)}</div>
        </section>
      ))}
      {viewer && <Viewer viewer={viewer} onClose={() => setViewer(null)} onNav={id => setViewer({ ...viewer, id })} />}
    </div>
  );
}

function Viewer({ viewer, onClose, onNav }) {
  const photos = useStore(s => s.photos);
  const legs = useStore(s => s.legs);
  const p = photos.find(x => x.id === viewer.id);
  const ids = viewer.list.filter(id => photos.some(x => x.id === id));
  const i = ids.indexOf(viewer.id);
  const urls = useUrls(p ? [p.storage_path] : []);
  const [cap, setCap] = useState(p?.caption || '');
  const [touch, setTouch] = useState(null);
  useEffect(() => setCap(p?.caption || ''), [p?.id]);
  useEffect(() => {
    const k = e => { if (e.key === 'ArrowRight' && i < ids.length - 1) onNav(ids[i + 1]); if (e.key === 'ArrowLeft' && i > 0) onNav(ids[i - 1]); if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, [i]);
  if (!p) { setTimeout(onClose); return null; }
  const url = urls[p.storage_path];
  const tz = legTz(legForDate(legs, p.trip_day));

  async function share() {
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], (p.place_name || 'trip-photo').replace(/[^\w-]+/g, '-') + '.jpg', { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: p.place_name || 'Trip photo' });
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); }
    } catch (e) { if (e.name !== 'AbortError') toast('Couldn\'t share: ' + e.message, 'error'); }
  }

  return (
    <div class="viewer" onTouchStart={e => setTouch(e.touches[0].clientX)} onTouchEnd={e => {
      if (touch == null) return; const dx = e.changedTouches[0].clientX - touch;
      if (dx < -50 && i < ids.length - 1) onNav(ids[i + 1]); if (dx > 50 && i > 0) onNav(ids[i - 1]); setTouch(null);
    }}>
      <div class="viewer-top">
        <button class="icon-btn solid" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        <span>{i + 1} / {ids.length}</span>
        <button class="icon-btn solid" onClick={share} aria-label="Share"><Icon name="share" /></button>
      </div>
      <div class="viewer-img">{url ? <img src={url} alt={p.caption || ''} /> : <span class="spinner" />}</div>
      <div class="viewer-info">
        <b>{p.place_name || 'Somewhere lovely'}</b>
        <span class="muted small">{fmtDayLong(p.trip_day)} · {fmtTime(p.taken_at, tz)} · {p.taken_by === me() ? 'you' : memberName(p.taken_by)}</span>
        <input class="caption" value={cap} placeholder="Add a caption…" onInput={e => setCap(e.currentTarget.value)}
          onBlur={() => cap !== (p.caption || '') && updateRow('photos', p.id, { caption: cap || null }).catch(e => toast(e.message, 'error'))} />
        {p.taken_by === me() && (
          <button class="btn danger small" onClick={async () => { if (!confirm('Delete this photo for both of you?')) return; try { await deletePhoto(p); toast('Photo deleted'); } catch (e) { toast(e.message, 'error'); } }}><Icon name="trash" size={16} />Delete</button>
        )}
      </div>
    </div>
  );
}
