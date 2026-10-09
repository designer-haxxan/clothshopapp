// English / Urdu. The dictionary keys are the English strings, so screens keep their readable source text.
// t(text) translates code-built strings; translateTree() translates the static text and attributes already in the DOM.
// Switching language reloads the page: every screen is then drawn in the chosen language from the start.
import { UR, PATTERNS } from './ur.js';
import { storageKey } from '../config.js';

const KEY = storageKey('pref.lang');
const BS_LTR = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css';
const BS_RTL = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.rtl.min.css';
export const BOOTSTRAP_CSS = { en: BS_LTR, ur: BS_RTL };

function readLang() {
  try { return JSON.parse(localStorage.getItem(KEY) || '"en"') === 'ur' ? 'ur' : 'en'; } catch { return 'en'; }
}
let lang = readLang();

export const getLang = () => lang;
export const isUrdu = () => lang === 'ur';

// Translate a string. Unknown strings are returned unchanged, so missing entries never break the UI.
export function t(text, vars = null) {
  const src = String(text ?? '');
  let s = lang === 'ur' ? (UR[src] ?? translatePattern(src) ?? src) : src;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

function translatePattern(src) {
  for (const [re, fn] of PATTERNS) {
    const m = src.match(re);
    if (m) return fn(m);
  }
  return null;
}

// Direction, language and the matching Bootstrap stylesheet (LTR or RTL).
export function applyLang() {
  const html = document.documentElement;
  html.lang = lang === 'ur' ? 'ur' : 'en';
  html.dir = lang === 'ur' ? 'rtl' : 'ltr';
  html.classList.toggle('lang-ur', lang === 'ur');
  const bs = document.getElementById('bs-css');
  if (bs && bs.getAttribute('href') !== BOOTSTRAP_CSS[lang]) bs.setAttribute('href', BOOTSTRAP_CSS[lang]);
  // The toggle shows the language it switches to.
  document.querySelectorAll('[data-lang-toggle]').forEach((b) => { b.textContent = lang === 'ur' ? 'English' : 'اردو'; });
  document.title = lang === 'ur' ? 'تھان پی او ایس' : 'ThaanPOS';
}

export function setLang(next) {
  try { localStorage.setItem(KEY, JSON.stringify(next === 'ur' ? 'ur' : 'en')); } catch { /* storage unavailable: keep current */ }
  location.reload();
}

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'NOSCRIPT']);

function translateText(node) {
  const s = node.nodeValue;
  const key = s.trim();
  if (!key) return;
  const out = UR[key] ?? translatePattern(key);
  if (out && out !== key) node.nodeValue = s.replace(key, out);
}

function translateAttrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const out = UR[v.trim()] ?? translatePattern(v.trim());
    if (out && out !== v.trim()) el.setAttribute(a, out);
  }
}

// Translate every text node and listed attribute under root (no-op in English).
export function translateTree(root) {
  if (lang !== 'ur' || !root) return;
  if (root.nodeType === Node.TEXT_NODE) return translateText(root);
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) {
    if (SKIP.has(root.tagName)) return;
    translateAttrs(root);
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE ? (SKIP.has(n.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP) : NodeFilter.FILTER_ACCEPT),
  });
  let n;
  while ((n = walker.nextNode())) {
    if (n.nodeType === Node.TEXT_NODE) translateText(n);
    else translateAttrs(n);
  }
}

// Keeps newly rendered screens and dialogs translated. Only runs in Urdu.
export function watchTranslations() {
  if (lang !== 'ur' || !window.MutationObserver) return;
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') translateText(m.target);
      else for (const node of m.addedNodes) translateTree(node);
    }
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  return mo;
}
