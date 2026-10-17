import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useStore, editEvent, navigateTo, deleteRow, toast, memberName } from '../lib/store.js';
import { tripDays, legForDate, legTz, localDate, fmtTime, fmtDayShort, fmtDayLong, todayIn, deviceTz } from '../lib/time.js';
import { catById } from '../lib/google.js';
import { Icon, Empty, Seg } from './ui.jsx';
import { ImportSheet } from './ImportSheet.jsx';
import { PlanDay } from './PlanDay.jsx';

export function eventsOnDay(events, legs, day) {
  return events
    .filter(e => localDate(e.start_at, legTz(legForDate(legs, day))) === day)
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
}

export function Calendar() {
  const legs = useStore(s => s.legs);
  const events = useStore(s => s.events);
  const days = useMemo(() => tripDays(legs), [legs]);
  const today = todayIn(deviceTz());
  const [day, setDay] = useState(null);
  const [view, setView] = useState('day');
  const [importOpen, setImportOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [openEv, setOpenEv] = useState(null);
  const strip = useRef();

  const sel = day || (days.includes(today) ? today : days[0]);
  useEffect(() => { strip.current?.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [sel, days.length]);

  if (!days.length) return <div class="page"><Empty icon="calendar" title="No trip dates yet">Add your trip legs in the Trip tab.</Empty></div>;

  const leg = legForDate(legs, sel);
  const tz = legTz(leg);
  const list = eventsOnDay(events, legs, sel);

  return (
    <div class="page calendar">
      <header class="top">
        <div class="title-row">
          <h1>Itinerary</h1>
          <Seg value={view} onChange={setView} options={[{ value: 'day', label: 'Day' }, { value: 'all', label: 'Whole trip' }]} />
        </div>
        <div class="day-strip scroll-x" ref={strip}>
          {days.map((d, i) => {
            const f = fmtDayShort(d);
            const l = legForDate(legs, d);
            const prev = i > 0 ? legForDate(legs, days[i - 1]) : null;
            const n = eventsOnDay(events, legs, d).length;
            return (
              <button class={'day ' + (d === sel ? 'on ' : '') + (d === today ? 'today' : '')} onClick={() => { setDay(d); setView('day'); }}>
                {(!prev || prev.id !== l?.id) && <span class="day-leg">{l?.city}</span>}
                <span class="dow">{f.dow}</span>
                <span class="dnum">{f.day}</span>
                <span class="dots">{n ? '•'.repeat(Math.min(n, 3)) : ' '}</span>
              </button>
            );
          })}
        </div>
      </header>

      <div class="cal-actions">
        <button class="btn primary" onClick={() => setPlanOpen(true)}><Icon name="sparkle" />Plan my day</button>
        <button class="btn" onClick={() => editEvent({ date: sel })}><Icon name="plus" />Add</button>
        <button class="btn" onClick={() => setImportOpen(true)}><Icon name="upload" />Import</button>
      </div>

      {view === 'day' ? (
        <section>
          <h2 class="day-title">{fmtDayLong(sel)} <span class="muted">· {leg?.city}</span></h2>
          {!list.length && <Empty icon="calendar" title="A free day">Add plans, import a booking, or tap <b>Plan my day</b> for ideas.</Empty>}
          <ol class="timeline">
            {list.map(e => <EventCard e={e} tz={tz} onOpen={() => setOpenEv(e)} />)}
          </ol>
        </section>
      ) : (
        <section>
          {days.map(d => {
            const l = legForDate(legs, d), z = legTz(l), evs = eventsOnDay(events, legs, d);
            return (
              <div class="all-day">
                <h3 onClick={() => { setDay(d); setView('day'); }}>{fmtDayLong(d)} <span class="muted">· {l?.city}</span></h3>
                {evs.length ? <ol class="timeline compact">{evs.map(e => <EventCard e={e} tz={z} onOpen={() => setOpenEv(e)} />)}</ol> : <p class="muted small">Nothing planned</p>}
              </div>
            );
          })}
        </section>
      )}

      {openEv && <EventDetail e={events.find(x => x.id === openEv.id) || openEv} tz={legTz(legForDate(legs, localDate(openEv.start_at, tz)))} onClose={() => setOpenEv(null)} />}
      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} defaultDate={sel} />
      {planOpen && <PlanDay day={sel} onClose={() => setPlanOpen(false)} />}
    </div>
  );
}

function EventCard({ e, tz, onOpen }) {
  const c = catById(e.category);
  return (
    <li class={'ev ' + (e.source === 'suggestion' ? 'sugg' : '')} onClick={onOpen}>
      <div class="ev-time">{fmtTime(e.start_at, tz)}{e.end_at && <small>{fmtTime(e.end_at, tz)}</small>}</div>
      <div class="ev-body">
        <b>{c?.icon ? c.icon + ' ' : ''}{e.title}</b>
        {(e.location_name || e.address) && <span class="muted small">{e.location_name && e.location_name !== e.title ? e.location_name : e.address}</span>}
      </div>
      {e.lat != null && <button class="icon-btn" onClick={ev => { ev.stopPropagation(); navigateTo({ name: e.location_name || e.title, lat: e.lat, lng: e.lng, place_id: e.place_id }); }} aria-label="Take me there"><Icon name="nav" size={18} /></button>}
    </li>
  );
}

function EventDetail({ e, tz, onClose }) {
  return (
    <div class="sheet-wrap" onClick={x => x.target === x.currentTarget && onClose()}>
      <div class="sheet">
        <div class="sheet-grip" />
        <div class="sheet-head"><h2>{e.title}</h2><button class="icon-btn" onClick={onClose}><Icon name="x" /></button></div>
        <div class="sheet-body">
          <p><Icon name="clock" size={16} /> {fmtDayLong(localDate(e.start_at, tz))}, {fmtTime(e.start_at, tz)}{e.end_at ? ` – ${fmtTime(e.end_at, tz)}` : ''}</p>
          {(e.location_name || e.address) && <p><Icon name="pin" size={16} /> {[e.location_name, e.address].filter(Boolean).join(' · ')}</p>}
          {e.notes && <p class="notes">{e.notes}</p>}
          <p class="muted small">Added by {memberName(e.created_by)}{e.source !== 'manual' ? ` · from ${e.source === 'suggestion' ? 'the concierge' : e.source === 'paste' ? 'pasted text' : 'an upload'}` : ''}</p>
          <div class="actions">
            {e.lat != null && <button class="btn primary" onClick={() => { onClose(); navigateTo({ name: e.location_name || e.title, lat: e.lat, lng: e.lng, place_id: e.place_id }); }}><Icon name="nav" />Take me there</button>}
            <button class="btn" onClick={() => { onClose(); editEvent({ ...e }); }}><Icon name="edit" />Edit</button>
            <button class="btn danger" onClick={async () => { if (!confirm('Delete this plan for both of you?')) return; try { await deleteRow('events', e.id); onClose(); toast('Deleted'); } catch (x) { toast(x.message, 'error'); } }}><Icon name="trash" />Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}
