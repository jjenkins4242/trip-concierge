import { useEffect, useRef } from 'preact/hooks';
import { useStore } from '../lib/store.js';

const P = {
  compass: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3.5 6.5-2 5-5 2 2-5 5-2Z',
  calendar: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  camera: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm8 3.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
  images: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15.5 9.5h.01',
  suitcase: 'M9 6V4h6v2M4 7h16v12H4zM9 7v12M15 7v12',
  pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  nav: 'M3 11 21 3l-8 18-2-8-8-2Z',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6 6 18',
  share: 'M12 3v12M8 7l4-4 4 4M5 13v6h14v-6',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5Z',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  walk: 'M13 4.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM10 22l2-7 3 3v4M8 12l2-5 4 1 2 4 3 1M10 7 7 9v3',
  bus: 'M6 17v2M18 17v2M5 4h14v13H5zM5 11h14M8 14h.01M16 14h.01',
  car: 'M5 16v2M19 16v2M4 12l2-5h12l2 5v4H4v-4ZM7.5 13.5h.01M16.5 13.5h.01',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v4h16v-4',
  paste: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M9 12h6M9 16h4',
  edit: 'M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4',
  locate: 'M12 2v3M12 19v3M2 12h3M19 12h3M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z',
  check: 'M5 12l5 5 9-10',
  swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  ext: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 6v1',
  key: 'M15 7a4 4 0 1 0-3.9 5L4 19v2h3v-2h2v-2h2l1.9-1.9A4 4 0 0 0 15 7ZM16 7h.01',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z',
  wifi: 'M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
};

export function Icon({ name, size = 20, fill = false, class: cls = '', stroke = 1.8 }) {
  return (
    <svg class={'ic ' + cls} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill={fill ? 'currentColor' : 'none'} stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round">
      <path d={P[name] || ''} />
    </svg>
  );
}

export function Sheet({ open, onClose, title, children, tall = false, footer }) {
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const onKey = e => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('noscroll');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('noscroll'); };
  }, [open]);
  if (!open) return null;
  return (
    <div class="sheet-wrap" onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div class={'sheet' + (tall ? ' tall' : '')} ref={ref} role="dialog" aria-label={title}>
        <div class="sheet-grip" />
        {title && (
          <div class="sheet-head">
            <h2>{title}</h2>
            <button class="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
        )}
        <div class="sheet-body">{children}</div>
        {footer && <div class="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

export const Spinner = ({ label }) => (
  <div class="spinner-row"><span class="spinner" />{label && <span>{label}</span>}</div>
);

export function Empty({ icon = 'compass', title, children }) {
  return (
    <div class="empty">
      <div class="empty-ic"><Icon name={icon} size={28} /></div>
      <h3>{title}</h3>
      {children && <div class="muted">{children}</div>}
    </div>
  );
}

export function Stars({ rating, count }) {
  if (!rating) return null;
  return (
    <span class="stars"><Icon name="star" size={13} fill /> {rating.toFixed(1)}{count ? <span class="muted"> ({count > 999 ? (count / 1000).toFixed(1) + 'k' : count})</span> : null}</span>
  );
}

export function Toast() {
  const t = useStore(s => s.toast);
  if (!t) return null;
  return <div key={t.id} class={'toast ' + t.kind} role="status">{t.msg}</div>;
}

export function Seg({ value, onChange, options }) {
  return (
    <div class="seg" role="tablist">
      {options.map(o => (
        <button role="tab" aria-selected={value === o.value} class={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={16} />}{o.label}
        </button>
      ))}
    </div>
  );
}
