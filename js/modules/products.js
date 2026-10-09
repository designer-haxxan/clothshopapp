// Products & categories for a cloth shop: design, colour, fabric and width; sold by metre, thaan or box/pack; barcodes and labels.
import * as UI from '../core/ui.js';
import { esc, fmtNum, fmtQty, num, debounce, compressImage, AppError } from '../core/utils.js';
import { money, pager } from '../core/views.js';
import { fmtStock, swatchHue, unitOption, unitRate, defaultUnitKey } from '../core/cloth.js';
import { t } from '../i18n/i18n.js';
import * as Auth from '../services/auth.js';
import * as Catalog from '../services/catalog.js';
import * as Posting from '../services/posting.js';
import * as Scanner from '../scanner/scanner.js';
import { printLabels } from './labels.js';

const $ = window.jQuery;
const UNITS = ['m', 'yard', 'pcs', 'pair', 'set', 'kg', 'ltr', 'dozen'];
const COLOURS = ['Red', 'Maroon', 'Pink', 'Orange', 'Yellow', 'Green', 'Olive', 'Teal', 'Blue', 'Navy', 'Sky blue', 'Purple', 'Brown', 'Beige', 'Cream', 'White', 'Black', 'Grey', 'Gold', 'Silver'];
const FABRICS = ['Lawn', 'Cotton', 'Khaddar', 'Karandi', 'Silk', 'Raw silk', 'Chiffon', 'Linen', 'Velvet', 'Jacquard', 'Organza', 'Net', 'Cambric', 'Denim', 'Wash & wear'];
const SEED_CATEGORIES = ['Lawn', 'Cotton', 'Khaddar', 'Karandi', 'Silk', 'Chiffon', 'Linen', 'Velvet', 'Readymade', 'Dupatta', 'Bed sheets', 'Towels', 'Accessories'];

// Internal EAN-13 barcode in the "in-store" 20-29 prefix range.
function generateBarcode() {
  let tries = 0; let code;
  do {
    const digits = '2' + String(Math.floor(Math.random() * 10)) + Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b % 10).join('');
    const sum = [...digits].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
    code = digits + ((10 - (sum % 10)) % 10);
  } while (Catalog.findByCode(code) && ++tries < 20);
  return code;
}

const datalist = (id, items) => `<datalist id="${id}">${items.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;

export async function editProduct(product = null, prefill = {}) {
  const p = { unit: 'm', trackStock: true, active: 1, defaultUnit: 'base', packName: 'box', ...prefill, ...(product || {}) };
  let image = p.image || '';
  const cats = Catalog.allCategories();
  const unitKeyOpts = [['base', t('Base unit')], ['thaan', t('Thaan')], ['pack', t('Box / pack')]];
  return UI.formModal({
    title: product ? t('Edit product') : t('New product'), size: 'lg',
    body: `<div class="row g-2">
      <div class="col-12"><label class="form-label">${esc(t('Product name *'))}</label><input name="name" class="form-control" required maxlength="150" value="${esc(p.name)}"></div>
      <div class="col-6 col-md-4"><label class="form-label">${esc(t('Design no. / code'))}</label><input name="design" class="form-control" maxlength="60" value="${esc(p.design)}" placeholder="e.g. LW-1024"></div>
      <div class="col-6 col-md-4"><label class="form-label">${esc(t('Colour'))}</label><input name="color" class="form-control" list="colour-list" maxlength="60" value="${esc(p.color)}">${datalist('colour-list', COLOURS)}</div>
      <div class="col-6 col-md-4"><label class="form-label">${esc(t('Fabric'))}</label><input name="fabric" class="form-control" list="fabric-list" maxlength="60" value="${esc(p.fabric)}">${datalist('fabric-list', FABRICS)}</div>
      <div class="col-6 col-md-4"><label class="form-label">${esc(t('Width'))}</label><input name="width" class="form-control" maxlength="30" value="${esc(p.width)}" placeholder="e.g. 44 in"></div>
      <div class="col-6 col-md-4"><label class="form-label">${esc(t('Category'))}</label><select name="categoryId" class="form-select"><option value="">—</option>${UI.options(cats, p.categoryId)}</select></div>
      <div class="col-6 col-md-4"><label class="form-label">${esc(t('Barcode'))}</label><div class="input-group">
        <input name="barcode" class="form-control" value="${esc(p.barcode)}" inputmode="numeric">
        <button type="button" class="btn btn-outline-secondary btn-scan-bc" title="${esc(t('Scan barcode'))}" aria-label="${esc(t('Scan barcode'))}"><i class="bi bi-upc-scan"></i></button>
        <button type="button" class="btn btn-outline-secondary btn-gen-bc" title="${esc(t('Generate barcode'))}" aria-label="${esc(t('Generate barcode'))}"><i class="bi bi-magic"></i></button></div></div>

      <div class="col-12 form-section"><i class="bi bi-rulers"></i>${esc(t('Measure & sell'))}</div>
      <div class="col-6 col-md-3"><label class="form-label">${esc(t('Measured in'))}</label><input name="unit" class="form-control" list="unit-list" value="${esc(p.unit)}"><datalist id="unit-list">${UNITS.map((u) => `<option value="${u}">`).join('')}</datalist></div>
      <div class="col-6 col-md-3"><label class="form-label">${esc(t('Thaan length (metres per thaan)'))}</label><input name="thaanLength" class="form-control" inputmode="decimal" value="${p.thaanLength || ''}" placeholder="—"></div>
      <div class="col-6 col-md-3"><label class="form-label">${esc(t('Box / pack size'))}</label><input name="packSize" class="form-control" inputmode="decimal" value="${p.packSize || ''}" placeholder="—"></div>
      <div class="col-6 col-md-3"><label class="form-label">${esc(t('Box name'))}</label><select name="packName" class="form-select">${['box', 'pack'].map((n) => `<option value="${n}" ${p.packName === n ? 'selected' : ''}>${esc(t(n))}</option>`).join('')}</select></div>
      <div class="col-12"><label class="form-label">${esc(t('Default sale unit'))}</label><div class="unit-pick">${unitKeyOpts.map(([k, l]) => `<label class="unit-opt"><input type="radio" name="defaultUnit" value="${k}" ${p.defaultUnit === k ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>
        <div class="form-text">${esc(t('Scanning or tapping this product adds it in this unit.'))}</div></div>

      <div class="col-12 form-section"><i class="bi bi-tags"></i>${esc(t('Prices per metre (or piece)'))}</div>
      <div class="col-6 col-md-4"><label class="form-label">${esc(t('Purchase price'))}</label><input name="purchasePrice" class="form-control" inputmode="decimal" value="${p.purchasePrice ?? ''}"></div>
      <div class="col-6 col-md-4"><label class="form-label">${esc(t('Sale price'))}</label><input name="salePrice" class="form-control" inputmode="decimal" value="${p.salePrice ?? ''}"></div>
      <div class="col-6 col-md-4"><label class="form-label">${esc(t('Wholesale'))}</label><input name="wholesalePrice" class="form-control" inputmode="decimal" value="${p.wholesalePrice ?? ''}"></div>
      <div class="col-6 col-md-4"><label class="form-label">${esc(t('Thaan rate'))}</label><input name="thaanRate" class="form-control" inputmode="decimal" value="${p.thaanRate || ''}" placeholder="auto"></div>
      <div class="col-6 col-md-4"><label class="form-label">${esc(t('Box rate'))}</label><input name="boxRate" class="form-control" inputmode="decimal" value="${p.boxRate || ''}" placeholder="auto"></div>
      <div class="col-12"><div class="price-preview small"></div></div>

      <div class="col-12 form-section"><i class="bi bi-palette"></i>${esc(t('Fabric details'))}</div>
      <div class="col-12"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" name="trackStock" id="pr-track" ${p.trackStock !== false ? 'checked' : ''}><label class="form-check-label" for="pr-track">${esc(t('Track stock (turn off for services)'))}</label></div></div>
      <div class="col-4 stock-f"><label class="form-label">${esc(t('Opening stock'))}</label><input name="openingStock" class="form-control" inputmode="decimal" value="${p.openingStock ?? ''}"></div>
      <div class="col-4 stock-f"><label class="form-label">${esc(t('Minimum stock'))}</label><input name="minStock" class="form-control" inputmode="decimal" value="${p.minStock ?? ''}"></div>
      <div class="col-4 stock-f"><label class="form-label">${esc(t('Current stock'))}</label><input class="form-control" value="${esc(fmtStock(p, p.stock || 0))}" disabled></div>
      <div class="col-12"><label class="form-label">${esc(t('Image'))}</label><div class="d-flex align-items-center gap-2">
        <div class="thumb img-prev">${image ? `<img src="${image}" alt="" class="thumb">` : '<i class="bi bi-image"></i>'}</div>
        <input type="file" accept="image/*" class="form-control img-file"><button type="button" class="btn btn-outline-danger btn-img-rm ${image ? '' : 'd-none'}" aria-label="${esc(t('Remove image'))}"><i class="bi bi-x"></i></button></div></div>
      ${product ? `<div class="col-12"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" name="active" id="pr-active" ${p.active ? 'checked' : ''}><label class="form-check-label" for="pr-active">${esc(t('Active (available for sale)'))}</label></div></div>` : ''}
    </div>`,
    onShown: ($m) => {
      const sync = () => $m.find('.stock-f').toggleClass('d-none', !$m.find('#pr-track').prop('checked'));
      $m.on('change', '#pr-track', sync); sync();
      // Live preview of what one thaan and one box cost, so the owner can check the rates before saving.
      const preview = () => {
        const sale = num($m.find('[name=salePrice]').val()); const tl = num($m.find('[name=thaanLength]').val());
        const ps = num($m.find('[name=packSize]').val()); const tr = num($m.find('[name=thaanRate]').val()); const br = num($m.find('[name=boxRate]').val());
        const unit = $m.find('[name=unit]').val() || 'm';
        const lines = [];
        if (tl > 0) lines.push(`${t('thaan')} (${fmtQty(tl)} ${esc(t(unit))}): <b>${fmtNum(tr || sale * tl)}</b>${tr ? '' : ` <span class="text-body-secondary">(${esc(t('auto'))})</span>`}`);
        if (ps > 0) lines.push(`${esc(t($m.find('[name=packName]').val() || 'box'))} (${fmtQty(ps)} ${esc(t(unit))}): <b>${fmtNum(br || sale * ps)}</b>${br ? '' : ` <span class="text-body-secondary">(${esc(t('auto'))})</span>`}`);
        $m.find('.price-preview').html(lines.join(' · '));
      };
      $m.on('input change', 'input, select', preview); preview();
      $m.find('.btn-gen-bc').on('click', () => $m.find('[name=barcode]').val(generateBarcode()));
      $m.find('.btn-scan-bc').on('click', async () => {
        $m.addClass('d-none'); $('.modal-backdrop').last().addClass('d-none');
        const code = await Scanner.scan();
        $m.removeClass('d-none'); $('.modal-backdrop').first().removeClass('d-none');
        if (code) $m.find('[name=barcode]').val(code);
      });
      $m.find('.img-file').on('change', async function () {
        const f = this.files[0]; if (!f) return;
        try { image = await compressImage(f); $m.find('.img-prev').html(`<img src="${image}" alt="" class="thumb">`); $m.find('.btn-img-rm').removeClass('d-none'); } catch (e) { UI.toastError(e); }
      });
      $m.find('.btn-img-rm').on('click', function () { image = ''; $m.find('.img-prev').html('<i class="bi bi-image"></i>'); $(this).addClass('d-none'); $m.find('.img-file').val(''); });
      $m.find('[name=name]').trigger('focus');
    },
    onSubmit: async (v) => {
      if (v.salePrice === '' && !product) throw new AppError('Enter a sale price.');
      const saved = await Posting.saveProduct({ ...v, id: product?.id, image, active: product ? v.active : true });
      UI.toast(product ? t('Product updated') : t('Product added'));
      return saved;
    },
  });
}

async function manageCategories() {
  const render = () => {
    const cats = Catalog.allCategories();
    if (!cats.length) return UI.emptyState('No categories yet', 'tags', `<button class="btn btn-primary btn-sm mt-3 cat-seed"><i class="bi bi-magic me-1"></i>${esc(t('Add common cloth categories'))}</button>`);
    return cats.map((c) => {
      const n = Catalog.allProducts().filter((p) => p.categoryId === c.id).length;
      return `<div class="list-row"><div class="main"><div class="title">${esc(c.name)}</div><div class="sub">${esc(t(`${n} product(s)`))}</div></div>
        <button class="btn btn-sm btn-light btn-cat-edit" data-id="${esc(c.id)}" aria-label="${esc(t('Rename'))}"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-light btn-cat-del" data-id="${esc(c.id)}" aria-label="${esc(t('Delete'))}"><i class="bi bi-trash"></i></button></div>`;
    }).join('');
  };
  const m = UI.modal({ title: t('Categories'), body: `<form class="input-group mb-3 cat-add"><input class="form-control" placeholder="${esc(t('New category name'))}" required><button class="btn btn-primary">${esc(t('Add'))}</button></form><div class="list-card cat-list">${render()}</div>` });
  const refresh = () => m.$el.find('.cat-list').html(render());
  m.$el.find('.cat-add').on('submit', async (e) => {
    e.preventDefault();
    const $i = $(e.target).find('input');
    try { await Posting.saveCategory({ name: $i.val() }); $i.val(''); refresh(); } catch (err) { UI.toastError(err); }
  });
  m.$el.on('click', '.cat-seed', async () => {
    try { for (const name of SEED_CATEGORIES) await Posting.saveCategory({ name }); refresh(); } catch (err) { UI.toastError(err); }
  });
  m.$el.on('click', '.btn-cat-edit', async function () {
    const c = Catalog.category(this.dataset.id);
    const name = prompt(t('Category name'), c.name);
    if (name === null) return;
    try { await Posting.saveCategory({ id: c.id, name }); refresh(); } catch (err) { UI.toastError(err); }
  });
  m.$el.on('click', '.btn-cat-del', async function () {
    try { await Posting.deleteCategory(this.dataset.id); refresh(); } catch (err) { UI.toastError(err); }
  });
  await m.closed;
}

// Labels for every product in the current list (capped so one print stays manageable).
const LABEL_CAP = 200;

async function renderList(el) {
  const $el = $(el).off();
  const canEdit = Auth.can('product.edit');
  $el.html(UI.pageHeader(t('Products'), canEdit ? `<button class="btn btn-light btn-sm btn-labels" title="${esc(t('Print labels'))}"><i class="bi bi-upc"></i><span class="d-none d-sm-inline"> ${esc(t('Print labels'))}</span></button><button class="btn btn-light btn-sm btn-cats"><i class="bi bi-tags"></i><span class="d-none d-sm-inline"> ${esc(t('Categories'))}</span></button><button class="btn btn-primary btn-sm btn-add"><i class="bi bi-plus-lg"></i> ${esc(t('Add'))}</button>` : '') + `
    <div class="filters">
      <div class="input-group flex-grow-2"><input type="search" class="form-control q" placeholder="${esc(t('Search design, colour, barcode…'))}"><button class="btn btn-outline-secondary btn-scan" aria-label="${esc(t('Scan'))}"><i class="bi bi-upc-scan"></i></button></div>
      <select class="form-select f-cat"><option value="">${esc(t('All categories'))}</option>${UI.options(Catalog.allCategories(), '')}</select>
      <select class="form-select f-status"><option value="active">${esc(t('Active'))}</option><option value="low">${esc(t('Low stock'))}</option><option value="out">${esc(t('Out of stock'))}</option><option value="inactive">${esc(t('Inactive'))}</option><option value="all">${esc(t('All'))}</option></select>
    </div>
    <div class="small text-body-secondary mb-2 summary"></div>
    <div class="list-card list"></div>`);
  let shownList = [];
  const draw = () => {
    const q = $el.find('.q').val();
    const cat = $el.find('.f-cat').val() || null;
    const f = $el.find('.f-status').val();
    const list = Catalog.searchProducts(q, { limit: Infinity, categoryId: cat, includeInactive: true }).filter((p) => {
      if (f === 'all') return true;
      if (f === 'inactive') return !p.active;
      if (!p.active) return false;
      if (f === 'low') return p.trackStock !== false && p.stock <= (p.minStock || 0);
      if (f === 'out') return p.trackStock !== false && p.stock <= 0;
      return true;
    });
    shownList = list;
    $el.find('.summary').text(t(`${list.length} product(s)`));
    pager($el.find('.list'), list, (p) => {
      const low = p.trackStock !== false && p.stock <= (p.minStock || 0);
      const hue = swatchHue(p.color || p.name);
      const dk = defaultUnitKey(p);
      return `<button class="list-row" data-id="${esc(p.id)}">
        ${p.image ? `<img class="thumb" src="${p.image}" alt="" loading="lazy">` : `<div class="swatch-tile" style="--h:${hue}" aria-hidden="true">${esc(UI.initials(p.name))}</div>`}
        <div class="main"><div class="title">${esc(p.name)} ${p.active ? '' : `<span class="badge text-bg-secondary">${esc(t('Inactive'))}</span>`}</div>
          <div class="sub">${esc([p.design, p.color, p.fabric, p.width, p.barcode].filter(Boolean).join(' · ') || '—')}</div>
          ${p.thaanLength > 0 ? `<span class="unit-tag">${esc(t('thaan'))} = ${fmtQty(p.thaanLength)} ${esc(t(p.unit))}</span>` : ''}${p.packSize > 0 ? `<span class="unit-tag unit-tag-alt">${esc(t(p.packName || 'box'))} = ${fmtQty(p.packSize)} ${esc(t(p.unit))}</span>` : ''}</div>
        <div class="end"><div class="fw-semibold money">${money(unitRate(p, dk))} <span class="small text-body-secondary">/ ${esc(t(unitOption(p, dk).label))}</span></div>
          <div class="sub ${low ? 'text-danger fw-semibold' : ''}">${p.trackStock === false ? esc(t('service')) : esc(fmtStock(p))}</div></div></button>`;
    }, 60, UI.emptyState('No products found', 'box-seam', canEdit ? `<button class="btn btn-primary btn-sm mt-3 btn-add">${esc(t('Add product'))}</button>` : ''));
  };
  draw();
  $el.on('input', '.q', debounce(draw, 150));
  $el.on('change', '.f-cat, .f-status', draw);
  $el.on('click', '.btn-add', async () => { if (await editProduct()) draw(); });
  $el.on('click', '.btn-cats', async () => { await manageCategories(); renderList(el); });
  $el.on('click', '.btn-labels', () => {
    if (!shownList.length) return UI.toast(t('No products found'), 'warning');
    printLabels(shownList.slice(0, LABEL_CAP));
  });
  $el.on('click', '.btn-scan', async () => {
    const code = await Scanner.scan(); if (!code) return;
    const p = Catalog.findByCode(code);
    if (p) { $el.find('.q').val(code); draw(); } else if (canEdit && await UI.confirmDialog(`No product with barcode ${code}. Add a new product?`)) { if (await editProduct(null, { barcode: code })) draw(); }
    else UI.toast(t('No products found'), 'warning');
  });
  $el.on('click', '.list-row[data-id]', async function () {
    const p = Catalog.product(this.dataset.id);
    if (!canEdit) { location.hash = `#/stock/${encodeURIComponent(p.id)}`; return; }
    productActions(p, draw);
  });
}

async function productActions(p, redraw) {
  const dk = defaultUnitKey(p);
  const m = UI.modal({ title: p.name, fullscreenMobile: false,
    body: `<div class="product-card-head mb-3">
        ${p.image ? `<img class="thumb thumb-lg" src="${p.image}" alt="">` : `<div class="swatch-tile swatch-lg" style="--h:${swatchHue(p.color || p.name)}">${esc(UI.initials(p.name))}</div>`}
        <div class="min-w-0"><div class="fw-semibold text-truncate">${esc(p.name)}</div><div class="small text-body-secondary text-truncate">${esc([p.design, p.color, p.fabric, p.width].filter(Boolean).join(' · ') || '—')}</div>
        ${p.barcode ? `<div class="small font-monospace">${esc(p.barcode)}</div>` : ''}</div></div>
      <div class="row small mb-3 g-2">
        <div class="col-6">${esc(t('Sale price'))}: <b>${money(p.salePrice)} / ${esc(t(p.unit))}</b></div><div class="col-6">${esc(t('Wholesale'))}: <b>${money(p.wholesalePrice)}</b></div>
        ${p.thaanLength > 0 ? `<div class="col-6">${esc(t('Thaan'))}: <b>${money(unitRate(p, 'thaan'))}</b> <span class="text-body-secondary">(${fmtQty(p.thaanLength)} ${esc(t(p.unit))})</span></div>` : ''}
        ${p.packSize > 0 ? `<div class="col-6">${esc(t(p.packName || 'box'))}: <b>${money(unitRate(p, 'pack'))}</b> <span class="text-body-secondary">(${fmtQty(p.packSize)} ${esc(t(p.unit))})</span></div>` : ''}
        <div class="col-6">${esc(t('Cost'))}: <b>${money(p.purchasePrice)} / ${esc(t(p.unit))}</b></div>
        <div class="col-6">${esc(t('Stock'))}: <b>${p.trackStock === false ? 'n/a' : esc(fmtStock(p))}</b></div>
        <div class="col-6">${esc(t('Margin'))}: <b>${p.salePrice ? fmtNum(((p.salePrice - p.purchasePrice) / p.salePrice) * 100) + '%' : '—'}</b></div>
        <div class="col-6">${esc(t('Minimum stock'))}: <b>${fmtQty(p.minStock || 0)}</b></div></div>
      <div class="d-grid gap-2">
        <button class="btn btn-primary btn-edit"><i class="bi bi-pencil me-1"></i>${esc(t('Edit product'))}</button>
        <button class="btn btn-outline-secondary btn-label"><i class="bi bi-upc me-1"></i>${esc(t('Print label'))}</button>
        <a class="btn btn-outline-secondary" href="#/stock/${encodeURIComponent(p.id)}"><i class="bi bi-clock-history me-1"></i>${esc(t('Stock ledger'))}</a>
        ${Auth.can('stock.adjust') && p.trackStock !== false ? `<a class="btn btn-outline-secondary" href="#/stock/adjust/${encodeURIComponent(p.id)}"><i class="bi bi-sliders me-1"></i>${esc(t('Adjust stock'))}</a>` : ''}
        ${Auth.can('product.delete') ? `<button class="btn btn-outline-danger btn-del"><i class="bi bi-trash me-1"></i>${esc(t('Delete'))}</button>` : ''}
      </div>` });
  m.$el.find('a').on('click', () => m.close());
  m.$el.find('.btn-edit').on('click', async () => { m.close(); await m.closed; if (await editProduct(p)) redraw(); });
  m.$el.find('.btn-label').on('click', () => printLabels([p]));
  m.$el.find('.btn-del').on('click', async () => {
    m.close(); await m.closed;
    if (!await UI.confirmDialog(`Delete "${p.name}"? Products with transactions are deactivated instead.`, { okLabel: 'Delete', okClass: 'btn-danger' })) return;
    try { const r = await Posting.deleteProduct(p.id); UI.toast(r === 'deleted' ? t('Product deleted') : 'Product deactivated (has transactions)'); redraw(); } catch (e) { UI.toastError(e); }
  });
}

export default {
  async render(el) { await renderList(el); },
};
