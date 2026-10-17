import { useState } from 'preact/hooks';
import { useStore, insertRow, toast, openPlace } from '../lib/store.js';
import { planDay, ideasFor } from '../lib/planner.js';
import { legForDate, legTz, fmtDayLong, minsToHM, zonedToISO } from '../lib/time.js';
import { catById, photoUrl, hasKey } from '../lib/google.js';
import { lodgingOf } from '../lib/legs.js';
import { eventsOnDay } from './Calendar.jsx';
import { Sheet, Icon, Seg, Spinner, Stars } from './ui.jsx';

const fmt12 = m => { const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0'); return `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'am' : 'pm'}`; };

export function PlanDay({ day, onClose }) {
  const legs = useStore(s => s.legs);
  const events = useStore(s => s.events);
  const leg = legForDate(legs, day);
  const tz = legTz(leg);
  const home = lodgingOf(leg);
  const [mode, setMode] = useState('plan');
  const [pace, setPace] = useState('balanced');
  const [startT, setStartT] = useState('08:30');
  const [endT, setEndT] = useState('22:00');
  const [items, setItems] = useState(null);
  const [ideas, setIdeas] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  async function go() {
    setBusy(true); setErr('');
    try {
      if (mode === 'plan') {
        const r = await planDay({ tz, lodging: home, events: eventsOnDay(events, legs, day), dayStart: toMin(startT), dayEnd: toMin(endT), pace });
        setItems(r.map(x => (x.kind === 'suggestion' ? { ...x, status: 'keep' } : x)));
      } else {
        setIdeas(await ideasFor(home));
      }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const swap = key => setItems(xs => xs.map(x => {
    if (x.key !== key || !x.alternates.length) return x;
    const [next, ...rest] = x.alternates;
    return { ...x, place: next, alternates: [...rest, x.place] };
  }));
  const setStatus = (key, status) => setItems(xs => xs.map(x => (x.key === key ? { ...x, status } : x)));

  async function addAll() {
    const keep = items.filter(x => x.kind === 'suggestion' && x.status === 'keep');
    setBusy(true);
    try {
      for (const x of keep) {
        await insertRow('events', {
          title: `${x.label}: ${x.place.name}`, start_at: zonedToISO(day, minsToHM(x.start), tz), end_at: zonedToISO(day, minsToHM(x.end), tz),
          location_name: x.place.name, address: x.place.fullAddress || x.place.address, lat: x.place.lat, lng: x.place.lng,
          place_id: x.place.place_id, category: x.cat, source: 'suggestion', meta: x.place,
        });
      }
      toast(`Added ${keep.length} stops to ${fmtDayLong(day)}`);
      onClose();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  const kept = items?.filter(x => x.kind === 'suggestion' && x.status === 'keep').length || 0;

  return (
    <Sheet open onClose={onClose} title={'Concierge · ' + fmtDayLong(day)} tall
      footer={mode === 'plan' && items ? <button class="btn primary big" disabled={!kept || busy} onClick={addAll}><Icon name="check" />Add {kept} stop{kept === 1 ? '' : 's'} to the day</button> : null}>
      {!hasKey() && <div class="card notice err">Add a Google Maps key in Trip → Settings first.</div>}
      {!home && <div class="card notice">Set where you're staying in {leg?.city} (Trip tab) so suggestions start nearby.</div>}
      <Seg value={mode} onChange={m => { setMode(m); setItems(null); setIdeas(null); }} options={[{ value: 'plan', label: 'Plan the day', icon: 'sparkle' }, { value: 'ideas', label: 'Just ideas', icon: 'compass' }]} />

      {mode === 'plan' && !items && (
        <div class="form">
          <p class="muted">I'll keep your existing plans and fill the gaps with breakfast, lunch, dinner and things to see, all close together so there's less walking.</p>
          <div class="row2">
            <label>Start<input type="time" value={startT} onInput={e => setStartT(e.currentTarget.value)} /></label>
            <label>Finish<input type="time" value={endT} onInput={e => setEndT(e.currentTarget.value)} /></label>
          </div>
          <label>Pace</label>
          <Seg value={pace} onChange={setPace} options={[{ value: 'relaxed', label: 'Relaxed' }, { value: 'balanced', label: 'Balanced' }, { value: 'full', label: 'Pack it in' }]} />
          <button class="btn primary big" disabled={busy || !home || !hasKey()} onClick={go}><Icon name="sparkle" />Suggest my day</button>
        </div>
      )}
      {mode === 'ideas' && !ideas && (
        <div class="form">
          <p class="muted">A quick list of the best-rated spots near {leg?.lodging_name || 'where you\'re staying'}, by type.</p>
          <button class="btn primary big" disabled={busy || !home || !hasKey()} onClick={go}><Icon name="compass" />Show me ideas</button>
        </div>
      )}
      {busy && <Spinner label="Putting the day together…" />}
      {err && <div class="card notice err">{err}</div>}

      {items && (
        <ol class="plan">
          {items.map(x => x.kind === 'fixed' ? (
            <li class="plan-fixed"><span class="pt">{fmt12(x.start)}</span><div><b>{x.title}</b><small class="muted">Already planned</small></div></li>
          ) : (
            <li class={'plan-sugg ' + x.status}>
              <span class="pt">{fmt12(x.start)}</span>
              <div class="ps-card">
                <div class="ps-top" onClick={() => openPlace(x.place)}>
                  <div class="thumb sm">{x.place.photo ? <img loading="lazy" src={photoUrl(x.place.photo, 160)} alt="" /> : catById(x.cat)?.icon}</div>
                  <div>
                    <small class="kicker">{catById(x.cat)?.icon} {x.label} · {x.end - x.start} min</small>
                    <b>{x.place.name}</b>
                    <div class="meta"><Stars rating={x.place.rating} count={x.place.ratingCount} />{x.place.price && <span>{x.place.price}</span>}<span><Icon name="walk" size={12} /> {x.travel} min</span></div>
                  </div>
                </div>
                <div class="ps-actions">
                  {x.status === 'keep'
                    ? <button class="chip on" onClick={() => setStatus(x.key, 'drop')}><Icon name="check" size={14} />Keep</button>
                    : <button class="chip" onClick={() => setStatus(x.key, 'keep')}>Removed · undo</button>}
                  <button class="chip" disabled={!x.alternates.length} onClick={() => swap(x.key)}><Icon name="swap" size={14} />Swap</button>
                </div>
              </div>
            </li>
          ))}
          {!items.length && <p class="muted">The day is already full. Nice.</p>}
          <button class="btn ghost" onClick={() => setItems(null)}><Icon name="back" size={16} />Change settings</button>
        </ol>
      )}

      {ideas && ideas.map(g => (
        <section class="ideas">
          <h3>{catById(g.cat)?.icon} {catById(g.cat)?.label}</h3>
          <div class="idea-row scroll-x">
            {g.places.map(p => (
              <button class="idea" onClick={() => openPlace(p)}>
                {p.photo ? <img loading="lazy" src={photoUrl(p.photo, 300)} alt="" /> : <div class="ph">{catById(g.cat)?.icon}</div>}
                <b>{p.name}</b>
                <Stars rating={p.rating} count={p.ratingCount} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </Sheet>
  );
}
