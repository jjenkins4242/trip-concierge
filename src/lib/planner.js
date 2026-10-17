// Rule-based day planner: fills the gaps around fixed plans with nearby picks.
import { searchNearby, walkMinutes, catById, haversine } from './google.js';
import { minutesOfDay } from './time.js';

const MEALS = [
  { key: 'breakfast', label: 'Breakfast', cat: 'bakeries', alt: 'cafes', from: 8 * 60 + 15, to: 10 * 60 + 30, dur: 45, re: /breakfast|petit[- ]d[ée]j|brunch|coffee|caf[ée]/i },
  { key: 'lunch', label: 'Lunch', cat: 'restaurants', from: 12 * 60, to: 14 * 60 + 15, dur: 75, re: /lunch|d[ée]jeuner|brunch/i },
  { key: 'snack', label: 'Afternoon coffee & pastry', cat: 'cafes', alt: 'bakeries', from: 15 * 60 + 30, to: 17 * 60, dur: 30, optional: true, re: /coffee|caf[ée]|tea|go[uû]ter/i },
  { key: 'dinner', label: 'Dinner', cat: 'restaurants', from: 19 * 60, to: 21 * 60, dur: 90, re: /dinner|d[îi]ner|supper|restaurant/i },
];
const ACTIVITIES = [
  { cat: 'sights', dur: 75, label: 'See' },
  { cat: 'museums', dur: 120, label: 'Explore' },
  { cat: 'parks', dur: 60, label: 'Stroll' },
  { cat: 'gems', dur: 60, label: 'Discover', fallback: 'sights' },
  { cat: 'shopping', dur: 60, label: 'Browse' },
];

function score(p, anchor) {
  const r = p.rating || 3.8, n = p.ratingCount || 5;
  const dist = haversine(anchor, p);
  return r * Math.log10(n + 10) - dist / 900 - (p.openNow === false ? 3 : 0);
}

async function candidates(cat, anchor) {
  const c = catById(cat);
  const types = c.types || catById(ACTIVITIES.find(a => a.cat === cat)?.fallback || 'sights').types;
  const lat = Math.round(anchor.lat * 500) / 500, lng = Math.round(anchor.lng * 500) / 500; // ~200 m grid → cache hits
  const list = await searchNearby({ lat, lng, types, radius: 1500, rank: 'POPULARITY' });
  return list.filter(p => p.lat != null && (p.ratingCount || 0) >= 20).sort((a, b) => score(b, anchor) - score(a, anchor));
}

/**
 * @param {object} o  { date, tz, lodging:{lat,lng,name}, events:[...], dayStart, dayEnd, pace:'relaxed'|'full' }
 */
export async function planDay({ tz, lodging, events, dayStart = 8 * 60 + 30, dayEnd = 22 * 60, pace = 'balanced' }) {
  const fixed = events
    .map(e => {
      const s = minutesOfDay(e.start_at, tz);
      const en = e.end_at ? minutesOfDay(e.end_at, tz) : s + 90;
      return { kind: 'fixed', start: s, end: Math.max(en, s + 15), title: e.title, ev: e, loc: e.lat != null ? { lat: e.lat, lng: e.lng } : null };
    })
    .sort((a, b) => a.start - b.start);

  const done = new Set();
  for (const m of MEALS) {
    if (fixed.some(f => (m.re.test(f.title) || f.ev.category === m.cat) && f.start < m.to + 30 && f.end > m.from - 30)) done.add(m.key);
  }

  const used = new Set(events.map(e => e.place_id).filter(Boolean));
  const out = [];
  let anchor = lodging;
  let cursor = dayStart;
  let actIdx = 0;
  const breather = pace === 'relaxed' ? 30 : pace === 'full' ? 5 : 15;

  const segments = [];
  let c = dayStart;
  for (const f of fixed) { if (f.start > c) segments.push({ from: c, to: f.start, before: f }); c = Math.max(c, f.end); segments.push({ fixed: f }); }
  if (c < dayEnd) segments.push({ from: c, to: dayEnd });

  for (const seg of segments) {
    if (seg.fixed) { out.push(seg.fixed); if (seg.fixed.loc) anchor = seg.fixed.loc; cursor = seg.fixed.end; continue; }
    cursor = Math.max(cursor, seg.from);
    let guard = 0;
    while (cursor < seg.to - 30 && guard++ < 10) {
      const meal = MEALS.find(m => !done.has(m.key) && cursor <= m.to - m.dur && cursor >= m.from - 120 && (!m.optional || pace !== 'relaxed'));
      let slot = null;
      if (meal) {
        const start = Math.max(cursor, meal.from);
        const travelGuess = 12;
        if (start + travelGuess + meal.dur <= seg.to) {
          // only take the meal now if there's no room for an activity before its window
          const roomBefore = meal.from - cursor;
          if (roomBefore < 75) slot = { meal, start, dur: meal.dur, cat: meal.cat, alt: meal.alt, label: meal.label };
        } else if (start < seg.to) { done.add(meal.key); }
      }
      if (!slot) {
        const nextMeal = MEALS.find(m => !done.has(m.key) && m.from > cursor);
        const limit = Math.min(seg.to, nextMeal ? Math.max(nextMeal.from, cursor) : seg.to);
        const room = limit - cursor;
        let act = null;
        for (let k = 0; k < ACTIVITIES.length; k++) {
          const a = ACTIVITIES[(actIdx + k) % ACTIVITIES.length];
          if (a.dur + 15 <= room) { act = a; actIdx = (actIdx + k + 1) % ACTIVITIES.length; break; }
        }
        if (!act && room >= 45) act = { cat: 'sights', dur: Math.min(60, room - 15), label: 'See' };
        if (!act) {
          if (nextMeal && nextMeal.from <= seg.to) { cursor = Math.max(cursor, nextMeal.from); continue; }
          break;
        }
        slot = { start: cursor, dur: Math.min(act.dur, room - 10), cat: act.cat, label: act.label };
      }

      let list = [];
      try { list = await candidates(slot.cat, anchor); } catch (e) { throw e; }
      if (slot.alt) { try { list = list.concat(await candidates(slot.alt, anchor)); } catch {} }
      list = list.filter(p => !used.has(p.place_id));
      if (seg.before?.loc) list.sort((a, b) => (score(b, anchor) - haversine(seg.before.loc, b) / 1500) - (score(a, anchor) - haversine(seg.before.loc, a) / 1500));
      const pick = list[0];
      if (!pick) { if (slot.meal) done.add(slot.meal.key); cursor += 30; continue; }
      const travel = Math.max(5, walkMinutes(anchor, pick));
      const start = Math.max(slot.start, cursor + travel);
      const end = Math.min(start + slot.dur, seg.to - (seg.before ? 10 : 0));
      if (end - start < 25) { if (slot.meal) done.add(slot.meal.key); cursor = seg.to; break; }
      used.add(pick.place_id);
      out.push({ kind: 'suggestion', key: Math.random().toString(36).slice(2), start, end, travel, label: slot.label, cat: slot.cat, place: pick, alternates: list.slice(1, 8) });
      if (slot.meal) done.add(slot.meal.key);
      anchor = pick;
      cursor = end + breather;
    }
  }
  return out;
}

export async function ideasFor(anchor, cats = ['sights', 'cafes', 'bakeries', 'museums', 'parks', 'restaurants']) {
  const res = [];
  for (const c of cats) {
    try { const l = await candidates(c, anchor); res.push({ cat: c, places: l.slice(0, 6) }); } catch (e) { if (!res.length) throw e; }
  }
  return res;
}
