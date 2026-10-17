import { useState } from 'preact/hooks';
import { useStore, setUi, updateRow, insertRow, deleteRow, updateTrip, toast, me } from '../lib/store.js';
import { supabase, errMsg } from '../lib/supabase.js';
import { searchText, hasKey } from '../lib/google.js';
import { getPosition } from '../lib/photos.js';
import { fmtDayShort } from '../lib/time.js';
import { Sheet, Icon, Spinner } from './ui.jsx';

export function Trip() {
  const trip = useStore(s => s.trip);
  const legs = useStore(s => s.legs);
  const members = useStore(s => s.members);
  const live = useStore(s => s.live);
  const [legEdit, setLegEdit] = useState(null);
  const [keyOpen, setKeyOpen] = useState(false);
  const [invite, setInvite] = useState(null);
  const sorted = [...legs].sort((a, b) => a.start_date.localeCompare(b.start_date));

  async function makeInvite() {
    try {
      const { data, error } = await supabase.from('trip_invites').insert({ trip_id: trip.id }).select().single();
      if (error) throw error;
      const link = `${location.origin}${location.pathname}#/join/${data.code}`;
      setInvite({ code: data.code, link });
      const text = `Join our ${trip.name} trip in Concierge — tap the link, then create your account with code ${data.code}`;
      if (navigator.share) await navigator.share({ title: 'Trip Concierge', text, url: link }).catch(() => {});
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  return (
    <div class="page trip">
      <header class="top">
        <div class="kicker"><span class={'live-dot ' + (live ? 'on' : '')} /> {live ? 'Live sync on' : 'Connecting…'}</div>
        <h1>{trip?.name}</h1>
      </header>

      <section>
        <h2>Where we're staying</h2>
        {sorted.map(l => {
          const a = fmtDayShort(l.start_date), b = fmtDayShort(l.end_date);
          return (
            <div class="card leg-card">
              <div class="leg-card-top">
                <div>
                  <b class="city">{l.city}</b>
                  <span class="muted small"> {a.dow} {a.day} {a.mon} → {b.dow} {b.day} {b.mon}</span>
                </div>
                <button class="icon-btn" onClick={() => setLegEdit(l)} aria-label="Edit dates"><Icon name="edit" size={18} /></button>
              </div>
              {l.lodging_name || l.lodging_address
                ? <p class="lodging"><Icon name="suitcase" size={16} /> <span><b>{l.lodging_name}</b><br /><span class="muted small">{l.lodging_address}</span></span></p>
                : <p class="muted">No address yet</p>}
              <button class="btn" onClick={() => setUi({ lodgingFor: l.id })}><Icon name="pin" size={16} />{l.lodging_name ? 'Change' : 'Set'} where we're staying</button>
            </div>
          );
        })}
        <button class="btn ghost" onClick={() => setLegEdit({ city: '', start_date: sorted.at(-1)?.end_date || '', end_date: '' })}><Icon name="plus" size={16} />Add another stop</button>
      </section>

      <section>
        <h2>Travelers</h2>
        <div class="card">
          {members.map(m => (
            <div class="member"><span class="avatar">{(m.display_name || '?')[0].toUpperCase()}</span><b>{m.display_name || 'Traveler'}</b>{m.user_id === me() && <span class="muted small">you</span>}{m.role === 'owner' && <span class="pill">organizer</span>}</div>
          ))}
          <button class="btn primary" onClick={makeInvite}><Icon name="share" size={16} />Invite to this trip</button>
          {invite && (
            <div class="invite">
              <p>Send this link. They open it, then create an account with the code:</p>
              <code class="code">{invite.code}</code>
              <input readOnly value={invite.link} onFocus={e => e.currentTarget.select()} />
              <button class="btn ghost" onClick={() => navigator.clipboard?.writeText(invite.link).then(() => toast('Link copied'))}>Copy link</button>
            </div>
          )}
        </div>
      </section>

      <section>
        <h2>Settings</h2>
        <div class="card">
          <div class="setting">
            <div><b>Google Maps</b><br /><span class="muted small">{hasKey() ? 'Connected for both phones' : 'Needed for maps, places and routes'}</span></div>
            <button class="btn" onClick={() => setKeyOpen(true)}><Icon name="key" size={16} />{hasKey() ? 'Change' : 'Add key'}</button>
          </div>
          <div class="setting">
            <div><b>Install on your phone</b><br /><span class="muted small">iPhone: Safari → Share → Add to Home Screen. Android: Chrome ⋮ → Add to Home screen / Install app.</span></div>
          </div>
          <div class="setting">
            <div><b>Signed in</b><br /><span class="muted small">{useStore(s => s.session?.user?.email)}</span></div>
            <button class="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </div>
      </section>

      {legEdit && <LegEditor leg={legEdit} onClose={() => setLegEdit(null)} />}
      {keyOpen && <KeySheet onClose={() => setKeyOpen(false)} />}
    </div>
  );
}

function LegEditor({ leg, onClose }) {
  const [f, setF] = useState({ city: leg.city, start_date: leg.start_date, end_date: leg.end_date });
  const up = k => e => setF({ ...f, [k]: e.currentTarget.value });
  async function save(e) {
    e.preventDefault();
    if (f.end_date < f.start_date) return toast('End date is before start date', 'error');
    try {
      if (leg.id) await updateRow('trip_legs', leg.id, f);
      else await insertRow('trip_legs', f);
      onClose();
    } catch (x) { toast(errMsg(x), 'error'); }
  }
  return (
    <Sheet open onClose={onClose} title={leg.id ? 'Edit stop' : 'Add a stop'}>
      <form class="form" onSubmit={save}>
        <label>City or region<input value={f.city} onInput={up('city')} placeholder="Galway" required /></label>
        <div class="row2">
          <label>Arrive<input type="date" value={f.start_date} onInput={up('start_date')} required /></label>
          <label>Leave<input type="date" value={f.end_date} onInput={up('end_date')} required /></label>
        </div>
        <button class="btn primary big">Save</button>
        {leg.id && <button type="button" class="btn danger" onClick={async () => { if (confirm('Remove this stop?')) { await deleteRow('trip_legs', leg.id); onClose(); } }}>Remove stop</button>}
      </form>
    </Sheet>
  );
}

function KeySheet({ onClose }) {
  const trip = useStore(s => s.trip);
  const [k, setK] = useState(trip?.google_maps_key || '');
  async function save(e) {
    e.preventDefault();
    try { await updateTrip({ google_maps_key: k.trim() || null }); toast('Saved: maps are on for both phones'); onClose(); setTimeout(() => location.reload(), 600); }
    catch (x) { toast(errMsg(x), 'error'); }
  }
  return (
    <Sheet open onClose={onClose} title="Google Maps key" tall>
      <form class="form" onSubmit={save}>
        <ol class="howto">
          <li>Open <a href="https://console.cloud.google.com/google/maps-apis/start" target="_blank" rel="noopener">Google Maps Platform</a>, sign in, and create a project. Billing must be on, but normal trip use stays within Google's free monthly allowance.</li>
          <li>Enable these 3 APIs: <b>Maps JavaScript API</b>, <b>Places API (New)</b>, <b>Routes API</b>.</li>
          <li>Go to <b>Keys & Credentials → Create credentials → API key</b>. Under <i>Application restrictions</i> choose <b>Websites</b> and add <code>{location.origin}/*</code>.</li>
          <li>Paste the key below. It's stored privately for this trip, so your partner's phone gets it automatically.</li>
        </ol>
        <label>API key<input value={k} onInput={e => setK(e.currentTarget.value)} placeholder="AIza…" autocomplete="off" spellcheck={false} /></label>
        <button class="btn primary big">Save key</button>
      </form>
    </Sheet>
  );
}

export function LodgingSheet() {
  const legId = useStore(s => s.ui.lodgingFor);
  const legs = useStore(s => s.legs);
  const leg = legs.find(l => l.id === legId);
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!legId || !leg) return null;
  const close = () => { setUi({ lodgingFor: null }); setRes(null); setQ(''); };

  async function search(e) {
    e.preventDefault();
    if (!q.trim()) return;
    if (!hasKey()) {
      // no key: keep name/address now, add the location later
      await updateRow('trip_legs', leg.id, { lodging_name: q.trim() });
      toast('Saved. Add a Maps key to place it on the map.');
      return close();
    }
    setBusy(true);
    try { setRes(await searchText({ query: q, lat: leg.lat, lng: leg.lng, radius: 40000, cacheable: false })); }
    catch (x) { toast(x.message, 'error'); } finally { setBusy(false); }
  }
  async function choose(p) {
    try { await updateRow('trip_legs', leg.id, { lodging_name: p.name, lodging_address: p.fullAddress || p.address, lat: p.lat, lng: p.lng }); toast('📍 Home base set for ' + leg.city); close(); }
    catch (x) { toast(errMsg(x), 'error'); }
  }
  async function here() {
    setBusy(true);
    const pos = await getPosition(12000);
    setBusy(false);
    if (!pos) return toast('Couldn\'t get your location. Check location permission.', 'error');
    await updateRow('trip_legs', leg.id, { lodging_name: q.trim() || 'Where we\'re staying', lodging_address: leg.lodging_address || '', lat: pos.lat, lng: pos.lng });
    toast('📍 Home base set to your current spot'); close();
  }

  return (
    <Sheet open onClose={close} title={`Staying in ${leg.city}`} tall>
      <form class="form" onSubmit={search}>
        <label>Hotel name or address<input value={q} onInput={e => setQ(e.currentTarget.value)} placeholder="Hôtel des Grands Boulevards, or 12 rue…" autofocus /></label>
        <button class="btn primary big" disabled={busy}>Search</button>
        <button type="button" class="btn" onClick={here} disabled={busy}><Icon name="locate" size={16} />I'm here now. Use my location</button>
      </form>
      {busy && <Spinner />}
      {res && !res.length && <p class="muted">No matches. Try adding the street or postcode.</p>}
      {res?.map(p => (
        <button class="result" onClick={() => choose(p)}><Icon name="pin" size={18} /><span><b>{p.name}</b><br /><span class="muted small">{p.fullAddress}</span></span></button>
      ))}
    </Sheet>
  );
}
