import { useEffect, useState } from 'preact/hooks';
import { supabase, errMsg } from './lib/supabase.js';
import { useStore, setState, openTrip, myTrips, goTab, toast, insertRow } from './lib/store.js';
import { processQueue } from './lib/photos.js';
import { Auth } from './components/Auth.jsx';
import { Explore } from './components/Explore.jsx';
import { Calendar } from './components/Calendar.jsx';
import { Camera } from './components/Camera.jsx';
import { Album } from './components/Album.jsx';
import { Trip, LodgingSheet } from './components/Trip.jsx';
import { PlaceSheet } from './components/PlaceSheet.jsx';
import { Navigate } from './components/Navigate.jsx';
import { EventForm } from './components/EventForm.jsx';
import { Icon, Toast, Spinner } from './components/ui.jsx';

const joinCodeFromHash = () => (location.hash.match(/#\/join\/([\w-]+)/) || [])[1] || null;

export function App() {
  const session = useStore(s => s.session);
  const ready = useStore(s => s.ready);
  const tripId = useStore(s => s.tripId);
  const [boot, setBoot] = useState('init'); // init | pick | ready
  const [code] = useState(joinCodeFromHash);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, ready: true }));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setState({ session: s }));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!session) { setBoot('auth'); return; }
    setBoot('init');
    (async () => {
      try {
        if (code) {
          const { data, error } = await supabase.rpc('join_trip', { invite_code: code, name: null });
          if (!error && data) { history.replaceState(null, '', location.pathname); await openTrip(data); setBoot('ready'); processQueue(); return; }
        }
        const trips = await myTrips();
        let pick = null; try { pick = localStorage.getItem('tc.trip'); } catch {}
        const t = trips.find(x => x.id === pick) || trips[0];
        if (t) { await openTrip(t.id); setBoot('ready'); processQueue(); }
        else setBoot('pick');
      } catch (e) { toast(errMsg(e), 'error'); setBoot('pick'); }
    })();
  }, [ready, session?.user?.id]);

  if (!ready || boot === 'init') return <div class="splash"><div class="stamp">CONCIERGE</div><Spinner /></div>;
  if (!session) return <><Auth inviteCode={code} /><Toast /></>;
  if (boot === 'pick' || !tripId) return <><TripPicker onDone={() => setBoot('ready')} /><Toast /></>;
  return <Shell />;
}

function Shell() {
  const tab = useStore(s => s.ui.tab);
  const nav = useStore(s => s.ui.nav);
  const pending = useStore(s => s.pendingUploads);
  const tabs = [
    { id: 'explore', label: 'Explore', icon: 'compass' },
    { id: 'calendar', label: 'Plans', icon: 'calendar' },
    { id: 'camera', label: 'Camera', icon: 'camera', big: true },
    { id: 'album', label: 'Album', icon: 'images' },
    { id: 'trip', label: 'Trip', icon: 'suitcase' },
  ];
  return (
    <div class={'shell ' + (nav ? 'navving' : '')}>
      <main>
        {tab === 'explore' && <Explore />}
        {tab === 'calendar' && <Calendar />}
        {tab === 'camera' && <Camera />}
        {tab === 'album' && <Album />}
        {tab === 'trip' && <Trip />}
      </main>
      <nav class="tabbar" aria-label="Main">
        {tabs.map(t => (
          <button class={'tab ' + (tab === t.id ? 'on ' : '') + (t.big ? 'big' : '')} onClick={() => goTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <span class="tab-ic"><Icon name={t.icon} size={t.big ? 26 : 22} />{t.id === 'album' && pending > 0 && <i class="badge">{pending}</i>}</span>
            <span class="tab-l">{t.label}</span>
          </button>
        ))}
      </nav>
      <Navigate />
      <PlaceSheet />
      <EventForm />
      <LodgingSheet />
      <Toast />
    </div>
  );
}

function TripPicker({ onDone }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [f, setF] = useState({ trip: '', city: '', start: '', end: '' });
  const [busy, setBusy] = useState(false);

  async function join(e) {
    e.preventDefault(); setBusy(true);
    try {
      const { data, error } = await supabase.rpc('join_trip', { invite_code: code, name: name || null });
      if (error) throw error;
      await openTrip(data); onDone();
    } catch (x) { toast(errMsg(x), 'error'); } finally { setBusy(false); }
  }
  async function create(e) {
    e.preventDefault(); setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from('trips').insert({ name: f.trip, created_by: user.id }).select().single();
      if (error) throw error;
      await openTrip(data.id);
      await insertRow('trip_legs', { city: f.city, start_date: f.start, end_date: f.end });
      onDone();
    } catch (x) { toast(errMsg(x), 'error'); } finally { setBusy(false); }
  }
  return (
    <div class="auth">
      <div class="auth-hero"><h1>Let's set up<br /><em>your trip.</em></h1></div>
      <form class="card auth-card" onSubmit={join}>
        <h2>Join with a code</h2>
        <label>Invite code<input value={code} onInput={e => setCode(e.currentTarget.value)} required autocapitalize="characters" /></label>
        <label>Your first name<input value={name} onInput={e => setName(e.currentTarget.value)} /></label>
        <button class="btn primary" disabled={busy}>Join trip</button>
      </form>
      <form class="card auth-card" onSubmit={create}>
        <h2>Or start a new trip</h2>
        <label>Trip name<input value={f.trip} onInput={e => setF({ ...f, trip: e.currentTarget.value })} placeholder="Rome 2027" required /></label>
        <label>First stop<input value={f.city} onInput={e => setF({ ...f, city: e.currentTarget.value })} placeholder="Rome" required /></label>
        <div class="row2">
          <label>Arrive<input type="date" value={f.start} onInput={e => setF({ ...f, start: e.currentTarget.value })} required /></label>
          <label>Leave<input type="date" value={f.end} onInput={e => setF({ ...f, end: e.currentTarget.value })} required /></label>
        </div>
        <button class="btn" disabled={busy}>Create trip</button>
      </form>
      <button class="btn ghost center" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </div>
  );
}
