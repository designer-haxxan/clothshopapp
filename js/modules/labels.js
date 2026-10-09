// Barcode labels (Code 128) for shelf stickers and thaan tags. Printed through the browser print dialog,
// so any label printer that the phone or PC can see works. The barcode library is cached for offline use.
import * as UI from '../core/ui.js';
import { esc, fmtNum, num, AppError } from '../core/utils.js';
import { getSettings } from '../core/settings.js';
import { defaultUnitKey, unitOption, unitRate } from '../core/cloth.js';
import { t } from '../i18n/i18n.js';
import { printHTML } from '../printer/printer.js';

const JSBARCODE = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
export const LABEL_SIZES = {
  '50x25': { w: 50, h: 25, name: '50 × 25 mm' },
  '40x30': { w: 40, h: 30, name: '40 × 30 mm' },
  '58x40': { w: 58, h: 40, name: '58 × 40 mm' },
};
const MAX_COPIES = 50;

let libLoading = null;
function loadBarcodeLib() {
  if (window.JsBarcode) return Promise.resolve();
  if (!libLoading) {
    libLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = JSBARCODE;
      s.onload = () => resolve();
      s.onerror = () => { libLoading = null; s.remove(); reject(new AppError(t('Barcode library not available. Connect to the internet once.'))); };
      document.head.appendChild(s);
    });
  }
  return libLoading;
}

export async function printLabels(products) {
  const withCode = products.filter((p) => p.barcode);
  if (!withCode.length) return UI.toast(t('Add a barcode to this product first.'), 'warning');
  const choice = await UI.formModal({
    title: t('Print labels'), submitLabel: t('Print'),
    body: `<div class="row g-2">
      <div class="col-7"><label class="form-label">${esc(t('Label size'))}</label><select name="size" class="form-select">${Object.entries(LABEL_SIZES).map(([k, s]) => `<option value="${k}">${esc(s.name)}</option>`).join('')}</select></div>
      <div class="col-5"><label class="form-label">${esc(t('Copies'))}</label><input name="copies" class="form-control" inputmode="numeric" value="1"></div>
      <div class="col-12 small text-body-secondary">${esc(t(`${withCode.length} product(s)`))}${withCode.length < products.length ? ` · ${esc(t('Add a barcode to this product first.'))}` : ''}</div></div>`,
    onSubmit: (v) => ({ size: LABEL_SIZES[v.size] ? v.size : '50x25', copies: Math.min(MAX_COPIES, Math.max(1, Math.floor(num(v.copies, 1)))) }),
  });
  if (!choice) return;
  try { await loadBarcodeLib(); } catch (e) { return UI.toastError(e); }

  const size = LABEL_SIZES[choice.size];
  const cur = getSettings().currency;
  const cells = [];
  for (const p of withCode) {
    const key = defaultUnitKey(p);
    const price = unitRate(p, key);
    for (let c = 0; c < choice.copies; c++) {
      cells.push(`<div class="bc-label" style="width:${size.w}mm;height:${size.h}mm">
        <div class="bc-n">${esc(p.name)}</div>
        <div class="bc-s">${esc([p.design, p.color].filter(Boolean).join(' · '))}</div>
        <svg class="bc-bar" data-code="${esc(p.barcode)}"></svg>
        <div class="bc-p">${esc(cur)} ${fmtNum(price)} / ${esc(t(unitOption(p, key).label))}</div></div>`);
    }
  }
  // printHTML puts the markup in #print-area synchronously, so the barcodes can be drawn before the print dialog opens.
  printHTML(`<div class="bc-sheet">${cells.join('')}</div>`, { width: size.w + 4 });
  document.querySelectorAll('#print-area svg.bc-bar').forEach((svg) => {
    try {
      window.JsBarcode(svg, svg.dataset.code, { format: 'CODE128', width: 1.5, height: 36, displayValue: true, fontSize: 11, margin: 0, textMargin: 0 });
    } catch {
      // Characters Code 128 cannot encode: print the text instead of a broken barcode.
      svg.outerHTML = `<div class="bc-code">${esc(svg.dataset.code)}</div>`;
    }
  });
}
