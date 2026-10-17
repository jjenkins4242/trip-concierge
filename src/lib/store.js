import { useEffect, useState } from 'preact/hooks';
import { supabase } from './supabase.js';
import { setApiKey } from './google.js';

const state = {
  session: null,
  ready: false,
  tripId: null,
  trip: null,
  members: [],
  legs: [],
  events: [],
  places: [],
  photos: [],
  live: false,
  toast: null,
  pendingUploads: 0,
  ui: { tab: 'explore', legId: null, place: null, nav: null, eventDraft: null, lodgingFor: null },
};
const listeners = new Set();
export const getState = () => state;
export function setState(patch) {
  Object.assign(state, typeof patch === 'function' ? patch(state) : patch);
  listeners.forEach(l => l());
}
export function useStore(sel = s => s) {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force(x => x + 1);
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  return sel(state);
}

let toastTimer;
export function toast(msg, kind = 'info') {
  clearTimeout(toastTimer);
  setState({ toast: { msg, kind, id: Date.now() } });
  toastTimer = setTimeout(() => setState({ toast: null }), kind === 'error' ? 6000 : 3000);
}

export const me = () => state.session?.user?.id;
export function memberName(uid) {
  if (!uid) return 'Someone';
  const m = state.members.find(x => x.user_id === uid);
  return m?.display_name || (uid === me() ? 'You' : 'Partner');
}

const TBL = { trip_legs: 'legs', events: 'events', saved_places: 'places', photos: 'photos', trip_members: 'members' };
const ORDER = { trip_legs: 'start_date', events: 'start_at', saved_places: 'created_at', photos: 'taken_at', trip_members: 'joined_at' };

async function fetchTable(table) {
  const { data, error } = await supabase.from(table).select('*').eq('trip_id', state.tripId)
    .order(ORDER[table], { ascending: table !== 'photos' });
  if (error) throw error;
  setState({ [TBL[table]]: data });
}

async function fetchTrip() {
  const { data, error } = await supabase.from('trips').select('*').eq('id', state.tripId).single();
  if (error) throw error;
  setApiKey(data.google_maps_key);
  setState({ trip: data });
}

let channel = null;
let refetchTimers = {};
function scheduleRefetch(table) {
  clearTimeout(refetchTimers[table]);
  refetchTimers[table] = setTimeout(() => (table === 'trips' ? fetchTrip() : fetchTable(table)).catch(() => {}), 150);
}

export async function openTrip(tripId) {
  if (channel) { supabase.removeChannel(channel); channel = null; }
  setState({ tripId, trip: null, legs: [], events: [], places: [], photos: [], members: [] });
  try { localStorage.setItem('tc.trip', tripId); } catch {}
  await Promise.all([fetchTrip(), ...Object.keys(TBL).map(fetchTable)]);
  channel = supabase.channel('trip-' + tripId);
  for (const table of Object.keys(TBL)) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `trip_id=eq.${tripId}` }, () => scheduleRefetch(table));
    channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, () => scheduleRefetch(table));
  }
  channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` }, () => scheduleRefetch('trips'));
  channel.subscribe(status => setState({ live: status === 'SUBSCRIBED' }));
}

// Catch up after the phone wakes or reconnects (realtime can miss events while asleep)
export function refreshAll() {
  if (!state.tripId) return;
  fetchTrip().catch(() => {});
  Object.keys(TBL).forEach(t => fetchTable(t).catch(() => {}));
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshAll(); });
window.addEventListener('online', refreshAll);

export async function myTrips() {
  const { data, error } = await supabase.from('trip_members').select('trip_id, trips(id,name)').eq('user_id', me());
  if (error) throw error;
  return data.map(d => d.trips).filter(Boolean);
}

// ---------- mutations (optimistic where cheap) ----------
export async function insertRow(table, row) {
  const { data, error } = await supabase.from(table).insert({ ...row, trip_id: state.tripId }).select().single();
  if (error) throw error;
  const key = TBL[table];
  if (key && !state[key].some(r => r.id === data.id)) setState({ [key]: [...state[key], data] });
  scheduleRefetch(table);
  return data;
}
export async function updateRow(table, id, patch) {
  const key = TBL[table];
  if (key) setState({ [key]: state[key].map(r => (r.id === id ? { ...r, ...patch } : r)) });
  const { error } = await supabase.from(table).update(patch).eq('id', id);
  if (error) { scheduleRefetch(table); throw error; }
}
export async function deleteRow(table, id) {
  const key = TBL[table];
  if (key) setState({ [key]: state[key].filter(r => r.id !== id) });
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) { scheduleRefetch(table); throw error; }
}
export async function updateTrip(patch) {
  const { error } = await supabase.from('trips').update(patch).eq('id', state.tripId);
  if (error) throw error;
  if ('google_maps_key' in patch) setApiKey(patch.google_maps_key);
  setState({ trip: { ...state.trip, ...patch } });
}

// ---------- UI helpers ----------
export const setUi = patch => setState(s => ({ ui: { ...s.ui, ...patch } }));
export const openPlace = place => setUi({ place });
export const navigateTo = dest => setUi({ nav: dest, place: null });
export const editEvent = draft => setUi({ eventDraft: draft, place: null });
export const goTab = tab => { setUi({ tab }); window.scrollTo(0, 0); };
