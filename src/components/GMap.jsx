import { useEffect, useRef, useState } from 'preact/hooks';
import { loadMaps, hasKey } from '../lib/google.js';
import { Icon } from './ui.jsx';

const dark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;

function pinEl(m) {
  const el = document.createElement('div');
  el.className = 'mk mk-' + (m.kind || 'place') + (m.active ? ' active' : '');
  if (m.img) {
    el.innerHTML = `<img src="${m.img}" alt="" />`;
  } else {
    el.textContent = m.label || '';
  }
  el.title = m.title || '';
  return el;
}

/**
 * markers: [{id, lat, lng, label, kind, title, img, active, onClick}]
 * path: [{lat,lng}] ; me: {lat,lng} ; fitKey: change to re-fit bounds
 */
export function GMap({ center, zoom = 15, markers = [], path, me, fitKey, class: cls = '', onMap }) {
  const box = useRef();
  const map = useRef();
  const objs = useRef({ markers: [], line: null, me: null });
  const [err, setErr] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hasKey()) return;
    let dead = false;
    loadMaps().then(async gm => {
      if (dead || !box.current) return;
      await gm.importLibrary('marker');
      map.current = new gm.Map(box.current, {
        center: center || { lat: 48.8566, lng: 2.3522 }, zoom,
        mapId: 'DEMO_MAP_ID', disableDefaultUI: true, zoomControl: false, clickableIcons: false,
        gestureHandling: 'greedy', colorScheme: dark() ? 'DARK' : 'LIGHT',
      });
      onMap?.(map.current);
      setReady(true);
    }).catch(e => setErr(e.message));
    return () => { dead = true; };
  }, []);

  // markers
  useEffect(() => {
    if (!ready) return;
    const gm = window.google.maps;
    objs.current.markers.forEach(m => (m.map = null));
    objs.current.markers = markers.filter(m => m.lat != null).map(m => {
      const am = new gm.marker.AdvancedMarkerElement({ map: map.current, position: { lat: m.lat, lng: m.lng }, content: pinEl(m), zIndex: m.active ? 999 : m.kind === 'home' ? 500 : 1 });
      if (m.onClick) am.addListener('click', m.onClick);
      return am;
    });
  }, [ready, markers]);

  // route line
  useEffect(() => {
    if (!ready) return;
    const gm = window.google.maps;
    objs.current.line?.setMap(null);
    if (path?.length) {
      objs.current.line = new gm.Polyline({
        path, map: map.current, strokeColor: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c4532f',
        strokeOpacity: 0.9, strokeWeight: 6,
      });
    }
  }, [ready, path]);

  // my location
  useEffect(() => {
    if (!ready) return;
    const gm = window.google.maps;
    if (!me) { if (objs.current.me) objs.current.me.map = null; objs.current.me = null; return; }
    if (!objs.current.me) {
      const el = document.createElement('div'); el.className = 'me-dot';
      objs.current.me = new gm.marker.AdvancedMarkerElement({ map: map.current, position: me, content: el, zIndex: 1000 });
    } else objs.current.me.position = me;
  }, [ready, me?.lat, me?.lng]);

  // fit
  useEffect(() => {
    if (!ready) return;
    const gm = window.google.maps;
    const pts = [...markers.filter(m => m.lat != null), ...(path || [])];
    if (me && fitKey && String(fitKey).includes('me')) pts.push(me);
    if (pts.length > 1) {
      const b = new gm.LatLngBounds();
      pts.forEach(p => b.extend({ lat: p.lat, lng: p.lng }));
      map.current.fitBounds(b, { top: 60, bottom: 60, left: 40, right: 40 });
    } else if (center) { map.current.setCenter(center); map.current.setZoom(zoom); }
  }, [ready, fitKey]);

  if (!hasKey()) {
    return (
      <div class={'map-box map-empty ' + cls}>
        <Icon name="key" size={26} />
        <p>Add a Google Maps key in <b>Trip → Settings</b> to switch on maps and places.</p>
      </div>
    );
  }
  return (
    <div class={'map-box ' + cls}>
      <div ref={box} class="map-canvas" />
      {err && <div class="map-err">{err}</div>}
    </div>
  );
}
