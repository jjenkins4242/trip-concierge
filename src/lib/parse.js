// Turn pasted itinerary text, PDFs and screenshots into draft calendar events (no AI, all on-device).

const ADDR_RE = /\b\d{1,4}[a-z]?,?\s+(?:bis\s+)?(?:rue|avenue|av\.?|boulevard|bd|blvd|place|quai|allée|impasse|chemin|road|rd|street|st|lane|ln|square|sq|drive|dr|way|terrace|quay|parade|row|court)\b[^\n,;]*(?:,\s*[^\n;]{0,60})?/i;
const LABEL_ADDR_RE = /(?:address|adresse|location|lieu|venue|where)\s*[:\-]\s*(.+)/i;
const NOISE_RE = /^(?:date|time|heure|when|from|to|du|au|le|on|at|check[- ]?in|check[- ]?out|departure|arrival|depart|arrive)\s*[:\-]?\s*$/i;

function cleanTitle(s) {
  return s
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—•*:|,.;@]+|[\s\-–—•*:|,.;@]+$/g, '')
    .replace(/\b(?:at|on|from|le|à|du|@)\s*$/i, '')
    .trim();
}

export async function parseItinerary(text, { refDate, tz } = {}) {
  const chrono = await import('chrono-node');
  const parsers = [chrono.en.casual, chrono.fr?.casual].filter(Boolean);
  const ref = refDate ? new Date(refDate + 'T12:00:00') : new Date();
  const lines = text.split(/\r?\n/).map(l => l.trim());
  const out = [];
  let lastTitleLine = '';
  let lastDate = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    let results = [];
    for (const p of parsers) {
      results = p.parse(line, { instant: ref, timezone: undefined }, { forwardDate: true });
      if (results.length) break;
    }
    if (!results.length) {
      if (!NOISE_RE.test(line) && line.length > 2 && line.length < 90) lastTitleLine = line;
      continue;
    }
    // one line = one plan: take the day from whichever match has it, the time from whichever has it
    const isDay = r => r.start.isCertain('day') || r.start.isCertain('weekday');
    const dayR = results.find(isDay);
    const timeR = results.find(r => r.start.isCertain('hour'));
    const pad = n => String(n).padStart(2, '0');
    let y, m, d;
    if (dayR) { y = dayR.start.get('year'); m = dayR.start.get('month'); d = dayR.start.get('day'); lastDate = { y, m, d }; }
    else if (lastDate) ({ y, m, d } = lastDate);
    else if (!timeR) continue;
    else { const s = timeR.start; y = s.get('year'); m = s.get('month'); d = s.get('day'); }
    const date = `${y}-${pad(m)}-${pad(d)}`;
    const time = timeR ? `${pad(timeR.start.get('hour'))}:${pad(timeR.start.get('minute') || 0)}` : '';
    const endTime = timeR?.end?.isCertain('hour') ? `${pad(timeR.end.get('hour'))}:${pad(timeR.end.get('minute') || 0)}` : '';

    // a bare date line ("Saturday 18 October") is a header for the lines below it
    let rest = line;
    for (const r of results) rest = rest.replace(r.text, ' ');
    const sameAddr = (line.match(LABEL_ADDR_RE) || [])[1] || (line.match(ADDR_RE) || [])[0] || '';
    const next = lines[i + 1] || '';
    const nextHasDate = parsers.some(p => p.parse(next, { instant: ref }).length);
    const nextAddr = !nextHasDate ? ((next.match(LABEL_ADDR_RE) || [])[1] || (next.match(ADDR_RE) || [])[0] || '') : '';
    const addr = (sameAddr || nextAddr).trim();
    if (sameAddr) rest = rest.replace(sameAddr, ' ');
    let title = cleanTitle(rest);
    if (!timeR && title.length < 3) continue; // header only
    if (title.length < 3 || NOISE_RE.test(title)) title = cleanTitle(lastTitleLine) || 'Plan';
    out.push({ key: Math.random().toString(36).slice(2), include: true, title: title.slice(0, 80), date, time, endTime, address: addr.slice(0, 120), notes: '' });
  }
  // de-dup identical date+time+title
  const seen = new Set();
  return out.filter(e => { const k = e.date + e.time + e.title; if (seen.has(k)) return false; seen.add(k); return true; });
}

export async function pdfToText(file, onProgress) {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = '';
  for (let p = 1; p <= Math.min(doc.numPages, 15); p++) {
    onProgress?.(`Reading page ${p} of ${doc.numPages}…`);
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let lastY = null;
    for (const it of tc.items) {
      const y = it.transform?.[5];
      if (lastY != null && Math.abs(y - lastY) > 4) text += '\n';
      else if (lastY != null) text += ' ';
      text += it.str;
      lastY = y;
    }
    text += '\n\n';
  }
  if (text.replace(/\s/g, '').length < 20) {
    // scanned PDF: rasterize first pages and OCR them
    let ocr = '';
    for (let p = 1; p <= Math.min(doc.numPages, 3); p++) {
      onProgress?.(`Scanning page ${p}…`);
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 2 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      ocr += await imageToText(blob, onProgress) + '\n';
    }
    return ocr;
  }
  return text;
}

let workerP = null;
export async function imageToText(file, onProgress) {
  const { createWorker } = await import('tesseract.js');
  if (!workerP) {
    onProgress?.('Loading text reader (first time only)…');
    workerP = createWorker(['eng', 'fra'], 1, {
      logger: m => { if (m.status === 'recognizing text') onProgress?.(`Reading text… ${Math.round(m.progress * 100)}%`); },
    });
  }
  const w = await workerP;
  const { data } = await w.recognize(file);
  return data.text;
}
