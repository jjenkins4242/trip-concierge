import { useState } from 'preact/hooks';
import { useStore, insertRow, toast } from '../lib/store.js';
import { parseItinerary, pdfToText, imageToText } from '../lib/parse.js';
import { tripDays, legForDate, legTz, zonedToISO } from '../lib/time.js';
import { geocode, hasKey } from '../lib/google.js';
import { lodgingOf } from '../lib/legs.js';
import { Sheet, Icon, Seg, Spinner } from './ui.jsx';

export function ImportSheet({ open, onClose, defaultDate }) {
  const legs = useStore(s => s.legs);
  const [tab, setTab] = useState('paste');
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState(null);
  const [busy, setBusy] = useState('');
  const [source, setSource] = useState('paste');
  const days = tripDays(legs);

  const reset = () => { setText(''); setDrafts(null); setBusy(''); };
  const close = () => { reset(); onClose(); };

  async function parse(t = text, src = 'paste') {
    setBusy('Reading your plans…');
    try {
      const d = await parseItinerary(t, { refDate: days[0] || defaultDate });
      setSource(src);
      setDrafts(d.length ? d : []);
      if (!d.length) toast('I couldn\'t spot any dates or times. You can add them by hand.', 'error');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
  }

  async function onFile(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    try {
      setBusy('Opening ' + file.name + '…');
      const t = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
        ? await pdfToText(file, m => setBusy(m))
        : await imageToText(file, m => setBusy(m));
      setText(t);
      setBusy('');
      await parse(t, 'upload');
    } catch (x) { setBusy(''); toast('Couldn\'t read that file: ' + x.message, 'error'); }
  }

  const upd = (k, patch) => setDrafts(ds => ds.map(d => (d.key === k ? { ...d, ...patch } : d)));

  async function saveAll() {
    const chosen = drafts.filter(d => d.include && d.date);
    if (!chosen.length) return;
    setBusy(`Adding ${chosen.length} plan${chosen.length > 1 ? 's' : ''}…`);
    let n = 0;
    for (const d of chosen) {
      const leg = legForDate(legs, d.date); const tz = legTz(leg);
      let loc = null;
      if (d.address && hasKey()) {
        try { const near = lodgingOf(leg); loc = await geocode(d.address, near ? { lat: near.lat, lng: near.lng, radius: 50000 } : undefined); } catch {}
      }
      try {
        await insertRow('events', {
          title: d.title || 'Plan', start_at: zonedToISO(d.date, d.time || '09:00', tz),
          end_at: d.endTime ? zonedToISO(d.date, d.endTime, tz) : null,
          address: d.address || null, location_name: loc?.name || null, lat: loc?.lat ?? null, lng: loc?.lng ?? null, place_id: loc?.place_id ?? null,
          notes: d.time ? null : 'Time not found — check this one', source,
        });
        n++;
      } catch (e) { toast(e.message, 'error'); }
    }
    toast(`Added ${n} to your itinerary`);
    close();
  }

  return (
    <Sheet open={open} onClose={close} title="Import plans" tall
      footer={drafts?.length ? <button class="btn primary big" onClick={saveAll} disabled={!!busy}>Add {drafts.filter(d => d.include).length} to calendar</button> : null}>
      {!drafts && (
        <>
          <Seg value={tab} onChange={setTab} options={[{ value: 'paste', label: 'Paste text', icon: 'paste' }, { value: 'upload', label: 'PDF or screenshot', icon: 'upload' }]} />
          {tab === 'paste' ? (
            <div class="form">
              <textarea rows={10} value={text} onInput={e => setText(e.currentTarget.value)}
                placeholder={'Paste an email, notes or itinerary, e.g.\n\nSat Oct 18 10:00 Louvre (timed entry)\n19:30 Dinner at Le Comptoir, 9 Carrefour de l\'Odéon\nOct 22 07:15 Flight CDG → DUB EI521'} />
              <button class="btn primary big" disabled={!text.trim() || !!busy} onClick={() => parse()}><Icon name="sparkle" />Find the plans</button>
            </div>
          ) : (
            <div class="form">
              <label class="drop">
                <Icon name="upload" size={28} />
                <b>Choose a booking PDF, screenshot or photo</b>
                <span class="muted small">Text is read right on your phone. Clean screenshots work best.</span>
                <input type="file" accept="application/pdf,image/*" onChange={onFile} />
              </label>
            </div>
          )}
          {busy && <Spinner label={busy} />}
        </>
      )}

      {drafts && (
        <div class="review">
          <p class="muted">Check these before adding. Untick anything that's wrong.</p>
          {busy && <Spinner label={busy} />}
          {drafts.map(d => (
            <div class={'draft ' + (d.include ? '' : 'off')}>
              <label class="check"><input type="checkbox" checked={d.include} onChange={e => upd(d.key, { include: e.currentTarget.checked })} /></label>
              <div class="draft-fields">
                <input value={d.title} onInput={e => upd(d.key, { title: e.currentTarget.value })} />
                <div class="row3">
                  <input type="date" value={d.date} onInput={e => upd(d.key, { date: e.currentTarget.value })} />
                  <input type="time" value={d.time} onInput={e => upd(d.key, { time: e.currentTarget.value })} />
                  <input type="time" value={d.endTime} onInput={e => upd(d.key, { endTime: e.currentTarget.value })} />
                </div>
                <input value={d.address} placeholder="Address (optional)" onInput={e => upd(d.key, { address: e.currentTarget.value })} />
                {days.length && !days.includes(d.date) && <small class="warn">Outside your trip dates</small>}
              </div>
            </div>
          ))}
          <button class="btn ghost" onClick={() => setDrafts(ds => [...ds, { key: Math.random().toString(36).slice(2), include: true, title: '', date: defaultDate, time: '', endTime: '', address: '' }])}><Icon name="plus" size={16} />Add a row</button>
          <button class="btn ghost" onClick={() => setDrafts(null)}><Icon name="back" size={16} />Back</button>
          {source === 'upload' && text && (
            <details><summary class="muted small">Text I read from the file</summary><pre class="ocr">{text.slice(0, 4000)}</pre></details>
          )}
        </div>
      )}
    </Sheet>
  );
}
