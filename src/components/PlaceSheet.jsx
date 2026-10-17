import { useState } from 'preact/hooks';
import { useStore, setUi, navigateTo, editEvent, insertRow, deleteRow, toast, me } from '../lib/store.js';
import { photoUrl, externalDirections, guessCategory, catById } from '../lib/google.js';
import { Sheet, Icon, Stars } from './ui.jsx';
import { errMsg } from '../lib/supabase.js';

/** Expand a saved_places row back into a place object */
export const fromSaved = row => ({ ...(row.meta || {}), ...row, place_id: row.place_id, name: row.name, address: row.address, lat: row.lat, lng: row.lng, _savedId: row.id });

export function PlaceSheet() {
  const p = useStore(s => s.ui.place);
  const saved = useStore(s => s.places);
  const [busy, setBusy] = useState(false);
  if (!p) return null;
  const close = () => setUi({ place: null });
  const savedRow = saved.find(s => (p.place_id && s.place_id === p.place_id) || s.id === p._savedId || s.id === p.id);
  const full = savedRow ? { ...fromSaved(savedRow), ...p } : p;
  const ext = externalDirections(full);
  const cat = full.category || guessCategory(full);

  async function toggleSave() {
    setBusy(true);
    try {
      if (savedRow) { await deleteRow('saved_places', savedRow.id); toast('Removed from saved'); }
      else {
        const { dist, _saved, ...meta } = full;
        await insertRow('saved_places', { place_id: full.place_id, name: full.name, category: cat, address: full.fullAddress || full.address, lat: full.lat, lng: full.lng, meta });
        toast('★ Saved — it\'s on both phones now');
      }
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  }

  return (
    <Sheet open onClose={close} tall>
      <div class="place-detail">
        {full.photos?.length ? (
          <div class="gallery scroll-x">
            {full.photos.map(ph => <img src={photoUrl(ph, 800)} alt="" loading="lazy" />)}
          </div>
        ) : full.photo ? <div class="gallery"><img src={photoUrl(full.photo, 800)} alt="" /></div> : null}
        <div class="pd-head">
          <div>
            <div class="kicker">{catById(cat)?.icon} {full.type || catById(cat)?.label}</div>
            <h2>{full.name}</h2>
            <div class="meta">
              <Stars rating={full.rating} count={full.ratingCount} />
              {full.price && <span>{full.price}</span>}
              {full.openNow === true && <span class="open">Open now</span>}
              {full.openNow === false && <span class="closed">Closed now</span>}
            </div>
          </div>
          <button class="icon-btn" onClick={close} aria-label="Close"><Icon name="x" /></button>
        </div>
        {full.summary && <p class="lede">{full.summary}</p>}
        {full.address && <p class="addr"><Icon name="pin" size={16} /> {full.fullAddress || full.address}</p>}
        {savedRow && <p class="muted small">Saved by {savedRow.added_by === me() ? 'you' : 'your partner'}</p>}

        <div class="actions">
          <button class="btn primary" onClick={() => navigateTo(full)}><Icon name="nav" />Take me there</button>
          <button class={'btn ' + (savedRow ? 'saved' : '')} disabled={busy} onClick={toggleSave}><Icon name="bookmark" fill={!!savedRow} />{savedRow ? 'Saved' : 'Save'}</button>
          <button class="btn" onClick={() => editEvent({ title: full.name, location_name: full.name, address: full.fullAddress || full.address, lat: full.lat, lng: full.lng, place_id: full.place_id, category: cat })}><Icon name="calendar" />Add to plan</button>
        </div>

        {full.hours && (
          <details class="hours">
            <summary><Icon name="clock" size={16} /> Opening hours</summary>
            <ul>{full.hours.map(h => <li>{h}</li>)}</ul>
          </details>
        )}
        <div class="links">
          <a class="btn ghost" href={ext.google} target="_blank" rel="noopener"><Icon name="ext" size={16} />Google Maps</a>
          <a class="btn ghost" href={ext.apple} target="_blank" rel="noopener"><Icon name="ext" size={16} />Apple Maps</a>
          {full.website && <a class="btn ghost" href={full.website} target="_blank" rel="noopener"><Icon name="globe" size={16} />Website</a>}
          {full.phone && <a class="btn ghost" href={'tel:' + full.phone.replace(/\s/g, '')}><Icon name="phone" size={16} />Call</a>}
        </div>
      </div>
    </Sheet>
  );
}
