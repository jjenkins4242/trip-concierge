import { useState } from 'preact/hooks';
import { useStore, toast, goTab, me } from '../lib/store.js';
import { capture } from '../lib/photos.js';
import { legForDate, legTz, fmtDayLong, todayIn, deviceTz, tripDays } from '../lib/time.js';
import { Icon } from './ui.jsx';
import { PhotoThumb } from './Album.jsx';

export function Camera() {
  const legs = useStore(s => s.legs);
  const photos = useStore(s => s.photos);
  const pending = useStore(s => s.pendingUploads);
  const [busy, setBusy] = useState(0);
  const today = todayIn(deviceTz());
  const leg = legForDate(legs, today);
  const days = tripDays(legs);
  const dayNum = days.indexOf(todayIn(legTz(leg))) + 1;
  const mine = photos.filter(p => p.taken_by === me()).slice(0, 9);

  async function onFiles(e) {
    const files = [...(e.currentTarget.files || [])];
    e.currentTarget.value = '';
    if (!files.length) return;
    setBusy(b => b + files.length);
    for (const f of files) {
      try { await capture(f); } catch (x) { toast('Couldn\'t save a photo: ' + x.message, 'error'); }
      setBusy(b => b - 1);
    }
    toast(files.length > 1 ? `${files.length} photos filed to the trip` : '📸 Filed to the trip album');
  }

  return (
    <div class="page camera">
      <header class="top">
        <h1>Camera</h1>
        <p class="muted">{dayNum > 0 ? `Day ${dayNum} · ${leg?.city} · ${fmtDayLong(today)}` : 'Photos are filed by day, place and who took them.'}</p>
      </header>

      <label class="shutter">
        <input type="file" accept="image/*" capture="environment" onChange={onFiles} />
        <span class="shutter-ring"><span class="shutter-btn"><Icon name="camera" size={40} /></span></span>
        <b>Take a photo</b>
        <small class="muted">Saved straight to the shared album, with the place it was taken.</small>
      </label>

      <label class="btn big library">
        <input type="file" accept="image/*" multiple onChange={onFiles} />
        <Icon name="images" />Add from my photo library
      </label>

      {(busy > 0 || pending > 0) && (
        <div class="card notice">
          <span class="spinner" /> {busy > 0 ? `Preparing ${busy}…` : `${pending} uploading${navigator.onLine ? '…' : ' when you\'re back online'}`}
        </div>
      )}

      {mine.length > 0 && (
        <section>
          <div class="title-row"><h2>Your latest</h2><button class="btn ghost" onClick={() => goTab('album')}>Album<Icon name="chevron" size={16} /></button></div>
          <div class="grid3">{mine.map(p => <PhotoThumb p={p} />)}</div>
        </section>
      )}
      <p class="muted small center">Tip: allow location when asked so each photo is tagged with where it was taken.</p>
    </div>
  );
}
