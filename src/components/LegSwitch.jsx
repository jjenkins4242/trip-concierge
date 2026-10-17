import { setUi } from '../lib/store.js';
import { useActiveLeg } from '../lib/legs.js';
import { fmtDayShort } from '../lib/time.js';

export function LegSwitch() {
  const { leg, legs } = useActiveLeg();
  if (!legs.length) return null;
  const sorted = [...legs].sort((a, b) => a.start_date.localeCompare(b.start_date));
  return (
    <div class="legs">
      {sorted.map(l => {
        const a = fmtDayShort(l.start_date), b = fmtDayShort(l.end_date);
        return (
          <button class={'leg ' + (leg?.id === l.id ? 'on' : '')} onClick={() => setUi({ legId: l.id })}>
            <span class="leg-city">{l.city}</span>
            <span class="leg-dates">{a.mon} {a.day}–{a.mon === b.mon ? '' : b.mon + ' '}{b.day}</span>
          </button>
        );
      })}
    </div>
  );
}
