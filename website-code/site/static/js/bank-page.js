/* bank-page.js — what the scripts of the bank's two pages share, bank-ui.js (Problems) and bank-propose-ui.js (Propose):
   two DOM helpers, and what drawing a PDF's pages with PDF.js needs (PDF.js loaded once with its own worker, the
   options of a loading task, the sheets' measure, how magnified a drawing is shown and how many pixels it may have).
   Imported with the page's ?v=, as the other modules. */

export const $ = id => document.getElementById(id);
export const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
};

/* ---- drawing a PDF's pages with PDF.js */
export const SHEET_PT = 426.79;    // the sheets' measure (preamble.tex: A4, 3 cm side margins): wider screens use it as it is
export const pxPerPt = () => (parseFloat(getComputedStyle(document.body).fontSize) || 18) / 10.95;   // the bank's \normalsize: 11pt class

let pdfjsLib = null, pdfWorker = null;
/* PDF.js, fetched once; `version` (the page data's pdfjs) goes on its address, so a new release is never mixed with a
   cached one.  One worker for every drawing, started once (otherwise each opening starts a new one and reads its 1 MB
   again: measured on an iPhone, a statement drawn again in 113 ms instead of 226), and the page's own: given to each
   loading task (docOptions), which then cannot take it down when it ends (Safari, a statement reopened at once: "the
   worker is being destroyed", and the plain PDF frame instead of the drawing). */
export function loadPdfjs(version) {
  if (!pdfjsLib) {
    const v = version ? `?v=${encodeURIComponent(version)}` : '';
    pdfjsLib = import(new URL(`../pdfjs/pdf.min.mjs${v}`, import.meta.url).href).then(lib => {
      lib.GlobalWorkerOptions.workerSrc = new URL(`../pdfjs/pdf.worker.min.mjs${v}`, import.meta.url).href;
      try { pdfWorker = new lib.PDFWorker({ port: new Worker(lib.GlobalWorkerOptions.workerSrc, { type: 'module' }) }); } catch (e) { pdfWorker = null; /* workerSrc then */ }
      return lib;
    });
    pdfjsLib.catch(() => { pdfjsLib = null; });       // tried again at the next drawing
  }
  return pdfjsLib;
}

/* The most pixels a drawing may have on this setup: on a phone or a tablet what Safari allows a canvas there (about 16.7
   million: it refuses more); on a computer 48 million, which draws a long statement sharp at the largest zoom on a Retina
   screen (drawing that many takes some 50 ms, measured). */
export const COARSE = matchMedia('(pointer: coarse)').matches;      // a touch screen
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);   // an iPad says it is a Mac
export const PIXELS = COARSE || IOS ? 16e6 : 48e6;

/* The options of a loading task (lib.getDocument), with the page's own worker.  On a touch screen the glyphs are drawn as
   shapes: the PDF's fonts added to the page would make it restyle all of itself, a long task on a slow phone (measured on
   a low-end Android: 63-75 ms at each opening).  A computer keeps the fonts' own drawing: shapes come out about 8% lighter. */
export const docOptions = () => ({ useWasm: false, stopAtErrors: false, disableFontFace: COARSE, ...(pdfWorker ? { worker: pdfWorker } : {}) });

/* How magnified an element is shown: by a pinch on a trackpad (site.js lays the page out bigger, or scales it) and by a
   touch screen's own pinch (the visual viewport). */
export const magnified = e => { const w = e.offsetWidth, vv = window.visualViewport; return (w ? Math.max(1, e.getBoundingClientRect().width / w) : 1) * Math.max(1, (vv && vv.scale) || 1); };

/* A drawing nobody will see again gives back its memory at once (Safari on iOS counts every canvas against one budget). */
export function freeCanvases(root) { for (const c of root.querySelectorAll('canvas')) { c.width = 0; c.height = 0; } }
