// Time-zone helpers (no library): every leg has its own local zone.

const TZ_HINTS = [
  [/paris|france|lyon|nice|marseille|bordeaux/i, 'Europe/Paris'],
  [/ireland|dublin|galway|cork|kerry|killarney|limerick|kilkenny|belfast|donegal|sligo|dingle|wicklow/i, 'Europe/Dublin'],
  [/london|england|scotland|edinburgh|wales|uk\b|united kingdom/i, 'Europe/London'],
  [/rome|italy|milan|florence|venice/i, 'Europe/Rome'],
  [/madrid|spain|barcelona/i, 'Europe/Madrid'],
  [/amsterdam|netherlands/i, 'Europe/Amsterdam'],
  [/phoenix|arizona|scottsdale/i, 'America/Phoenix'],
];

export const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export function legTz(leg) {
  if (!leg) return deviceTz();
  const s = `${leg.city || ''} ${leg.lodging_address || ''}`;
  for (const [re, tz] of TZ_HINTS) if (re.test(s)) return tz;
  return deviceTz();
}

function parts(date, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const o = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return o;
}

function tzOffsetMs(date, tz) {
  const p = parts(date, tz);
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUTC - Math.floor(date.getTime() / 1000) * 1000;
}

/** "2026-10-18" + "09:30" in Europe/Paris -> ISO string (UTC) */
export function zonedToISO(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let off = tzOffsetMs(new Date(guess), tz);
  let t = guess - off;
  const off2 = tzOffsetMs(new Date(t), tz);
  if (off2 !== off) t = guess - off2;
  return new Date(t).toISOString();
}

export function localDate(iso, tz) {
  const p = parts(new Date(iso), tz);
  return `${p.year}-${p.month}-${p.day}`;
}
export function localHM(iso, tz) {
  const p = parts(new Date(iso), tz);
  return `${p.hour}:${p.minute}`;
}
export function minutesOfDay(iso, tz) {
  const p = parts(new Date(iso), tz);
  return (+p.hour % 24) * 60 + +p.minute;
}

export function fmtTime(iso, tz) {
  return new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}
export function fmtDayLong(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}
export function fmtDayShort(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return {
    dow: new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(dt),
    day: d,
    mon: new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' }).format(dt),
  };
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function tripDays(legs) {
  if (!legs?.length) return [];
  const start = legs.map(l => l.start_date).sort()[0];
  const end = legs.map(l => l.end_date).sort().slice(-1)[0];
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Which leg are we in on a given date? A travel day belongs to the leg that starts that day. */
export function legForDate(legs, dateStr) {
  if (!legs?.length) return null;
  const sorted = [...legs].sort((a, b) => a.start_date.localeCompare(b.start_date));
  let hit = sorted.find(l => l.start_date <= dateStr && dateStr < l.end_date);
  if (!hit) hit = [...sorted].reverse().find(l => l.start_date <= dateStr && dateStr <= l.end_date);
  if (!hit) hit = dateStr < sorted[0].start_date ? sorted[0] : sorted[sorted.length - 1];
  return hit;
}

export function todayIn(tz) {
  return localDate(new Date().toISOString(), tz);
}

export function minsToHM(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function fmtDuration(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim();
}
export function fmtDistance(meters) {
  if (meters == null) return '';
  return meters < 950 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}
