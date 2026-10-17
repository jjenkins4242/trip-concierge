import { get, set, del, keys } from 'idb-keyval';
import { supabase } from './supabase.js';
import { getState, insertRow, toast, setState } from './store.js';
import { haversine, searchNearby, hasKey } from './google.js';
import { legForDate, legTz, localDate, deviceTz } from './time.js';

export async function compress(file, maxDim = 1600, quality = 0.82) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }); }
  const w = bmp.width, h = bmp.height, s = Math.min(1, maxDim / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
}

export function getPosition(timeout = 8000) {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 },
    );
  });
}

/** Decide where a photo was taken: saved place nearby → current event → nearest Google place */
async function fileUnder(pos, takenAt) {
  const s = getState();
  const out = { place_name: null, event_id: null };
  const ev = s.events.find(e => {
    const st = new Date(e.start_at).getTime();
    const en = e.end_at ? new Date(e.end_at).getTime() : st + 90 * 60000;
    return takenAt >= st - 15 * 60000 && takenAt <= en + 15 * 60000;
  });
  if (pos) {
    const near = [...s.places, ...s.events.filter(e => e.lat != null).map(e => ({ ...e, name: e.location_name || e.title }))]
      .map(p => ({ p, d: haversine(pos, p) }))
      .filter(x => x.d < 120)
      .sort((a, b) => a.d - b.d)[0];
    if (near) out.place_name = near.p.name;
  }
  if (ev) { out.event_id = ev.id; out.place_name = out.place_name || ev.location_name || ev.title; }
  if (!out.place_name && pos && hasKey()) {
    try {
      const r = await searchNearby({ lat: pos.lat, lng: pos.lng, radius: 60, rank: 'DISTANCE', max: 1,
        types: ['tourist_attraction', 'restaurant', 'cafe', 'museum', 'park', 'bar', 'bakery', 'church', 'store'] });
      if (r[0]) out.place_name = r[0].name;
    } catch {}
  }
  return out;
}

const Q = 'tc-upload:';

export async function capture(file, caption = '') {
  const s = getState();
  const takenAt = file.lastModified && Math.abs(Date.now() - file.lastModified) < 7 * 864e5 ? file.lastModified : Date.now();
  const [blob, pos] = await Promise.all([compress(file), getPosition()]);
  const legToday = legForDate(s.legs, localDate(new Date(takenAt).toISOString(), deviceTz()));
  const tz = legTz(legToday);
  const day = localDate(new Date(takenAt).toISOString(), tz);
  const id = crypto.randomUUID();
  const job = { id, tripId: s.tripId, blob, takenAt, day, pos, caption };
  await set(Q + id, job);
  bumpPending();
  processQueue();
  return id;
}

let running = false;
export async function processQueue() {
  if (running || !navigator.onLine) return;
  running = true;
  try {
    const ks = (await keys()).filter(k => String(k).startsWith(Q));
    for (const k of ks) {
      const job = await get(k);
      if (!job) continue;
      try {
        const path = `${job.tripId}/${job.day}/${job.id}.jpg`;
        const up = await supabase.storage.from('trip-photos').upload(path, job.blob, { contentType: 'image/jpeg', upsert: true });
        if (up.error && !/exists/i.test(up.error.message)) throw up.error;
        const meta = job.tripId === getState().tripId ? await fileUnder(job.pos, job.takenAt) : {};
        const { error } = await supabase.from('photos').insert({
          id: job.id, trip_id: job.tripId, storage_path: path, taken_at: new Date(job.takenAt).toISOString(),
          trip_day: job.day, lat: job.pos?.lat ?? null, lng: job.pos?.lng ?? null,
          place_name: meta.place_name || null, event_id: meta.event_id || null, caption: job.caption || null,
        });
        if (error && !/duplicate/i.test(error.message)) throw error;
        await del(k);
        bumpPending();
      } catch (e) {
        console.warn('upload failed, will retry', e);
        break;
      }
    }
  } finally { running = false; }
}

export async function pendingCount() {
  return (await keys()).filter(k => String(k).startsWith(Q)).length;
}
async function bumpPending() { setState({ pendingUploads: await pendingCount() }); }
window.addEventListener('online', processQueue);
setInterval(processQueue, 30000);
bumpPending();

// signed URL cache
const urlCache = new Map();
export async function signedUrls(paths) {
  const need = paths.filter(p => { const c = urlCache.get(p); return !c || c.exp < Date.now(); });
  if (need.length) {
    const { data } = await supabase.storage.from('trip-photos').createSignedUrls(need, 60 * 60 * 6);
    (data || []).forEach(d => d.signedUrl && urlCache.set(d.path, { url: d.signedUrl, exp: Date.now() + 5.5 * 3600e3 }));
  }
  const out = {};
  paths.forEach(p => { if (urlCache.get(p)) out[p] = urlCache.get(p).url; });
  return out;
}

export async function deletePhoto(photo) {
  await supabase.storage.from('trip-photos').remove([photo.storage_path]);
  const { error } = await supabase.from('photos').delete().eq('id', photo.id);
  if (error) throw error;
  setState(s => ({ photos: s.photos.filter(p => p.id !== photo.id) }));
}

export { toast, insertRow };
