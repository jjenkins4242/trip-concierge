import { useEffect, useState } from 'preact/hooks';
import { useStore, setUi, insertRow, updateRow, toast } from '../lib/store.js';
import { tripDays, legForDate, legTz, localDate, localHM, zonedToISO, todayIn, deviceTz, fmtDayShort } from '../lib/time.js';
import { CATEGORIES, geocode, hasKey } from '../lib/google.js';
import { lodgingOf } from '../lib/legs.js';
import { Sheet, Icon } from './ui.jsx';
import { errMsg } from '../lib/supabase.js';

export function EventForm() {
  const draft = useStore(s => s.ui.eventDraft);
  const legs = useStore(s => s.legs);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState(null);

  useEffect(() => {
    if (!draft) { setF(null); return; }
    const days = tripDays(legs);
    let date = draft.date, start = '', end = '';
    if (draft.start_at) {
      const tz = legTz(legForDate(legs, localDate(draft.start_at, deviceTz())));
      date = localDate(draft.start_at, tz); start = localHM(draft.start_at, tz);
      if (draft.end_at) end = localHM(draft.end_at, tz);
    }
    if (!date) { const t = todayIn(deviceTz()); date = days.includes(t) ? t : days[0]; }
    setF({ title: draft.title || '', date, start: start || draft.time || '10:00', end: end || draft.endTime || '', location_name: draft.location_name || '', address: draft.address || '', notes: draft.notes || '', category: draft.category || '' });
    setFound(draft.lat != null ? { lat: draft.lat, lng: draft.lng, place_id: draft.place_id } : null);
  }, [draft]);

  if (!draft || !f) return null;
  const close = () => setUi({ eventDraft: null });
  const up = k => e => setF({ ...f, [k]: e.currentTarget.value });
  const days = tripDays(legs);

  async function findLoc() {
    const q = [f.location_name, f.address].filter(Boolean).join(', ');
    if (!q) return;
    try {
      const leg = legForDate(legs, f.date); const near = lodgingOf(leg);
      const p = await geocode(q + (leg?.city && !q.toLowerCase().includes(leg.city.toLowerCase()) ? ', ' + leg.city : ''), near ? { lat: near.lat, lng: near.lng, radius: 30000 } : undefined);
      if (!p) return toast('Couldn\'t find that place', 'error');
      setFound({ lat: p.lat, lng: p.lng, place_id: p.place_id });
      setF(x => ({ ...x, location_name: x.location_name || p.name, address: p.fullAddress || p.address }));
      toast('📍 Found: ' + p.name);
    } catch (e) { toast(e.message, 'error'); }
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const tz = legTz(legForDate(legs, f.date));
      let loc = found;
      if (!loc && (f.location_name || f.address) && hasKey()) {
        try { const leg = legForDate(legs, f.date); const near = lodgingOf(leg); const p = await geocode([f.location_name, f.address, leg?.city].filter(Boolean).join(', '), near ? { lat: near.lat, lng: near.lng, radius: 30000 } : undefined); if (p) loc = { lat: p.lat, lng: p.lng, place_id: p.place_id }; } catch {}
      }
      const row = {
        title: f.title.trim() || 'Plan',
        start_at: zonedToISO(f.date, f.start || '09:00', tz),
        end_at: f.end ? zonedToISO(f.date, f.end, tz) : null,
        location_name: f.location_name || null, address: f.address || null, notes: f.notes || null,
        category: f.category || null, lat: loc?.lat ?? null, lng: loc?.lng ?? null, place_id: loc?.place_id ?? null,
      };
      if (row.end_at && row.end_at < row.start_at) row.end_at = null;
      if (draft.id) await updateRow('events', draft.id, row);
      else await insertRow('events', { ...row, source: draft.source || 'manual' });
      toast(draft.id ? 'Updated' : 'Added to your plan');
      close();
    } catch (x) { toast(errMsg(x), 'error'); } finally { setBusy(false); }
  }

  return (
    <Sheet open onClose={close} title={draft.id ? 'Edit plan' : 'Add to plan'} tall>
      <form class="form" onSubmit={save}>
        <label>What<input value={f.title} onInput={up('title')} placeholder="Dinner at…, Louvre tickets, train to…" required /></label>
        <label>Day
          <select value={f.date} onChange={up('date')}>
            {days.map(d => { const x = fmtDayShort(d); return <option value={d}>{x.dow} {x.day} {x.mon} · {legForDate(legs, d)?.city}</option>; })}
          </select>
        </label>
        <div class="row2">
          <label>Starts<input type="time" value={f.start} onInput={up('start')} required /></label>
          <label>Ends<input type="time" value={f.end} onInput={up('end')} /></label>
        </div>
        <label>Place<input value={f.location_name} onInput={e => { up('location_name')(e); setFound(null); }} placeholder="Name of the place" /></label>
        <label>Address<input value={f.address} onInput={e => { up('address')(e); setFound(null); }} placeholder="Optional" /></label>
        <button type="button" class={'btn ghost ' + (found ? 'saved' : '')} onClick={findLoc} disabled={!hasKey()}><Icon name={found ? 'check' : 'pin'} size={16} />{found ? 'Located on the map' : 'Find on map'}</button>
        <label>Type
          <select value={f.category} onChange={up('category')}>
            <option value="">—</option>
            {CATEGORIES.map(c => <option value={c.id}>{c.icon} {c.label}</option>)}
          </select>
        </label>
        <label>Notes<textarea rows={3} value={f.notes} onInput={up('notes')} placeholder="Booking ref, tickets, who's paying…" /></label>
        <button class="btn primary big" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Sheet>
  );
}
