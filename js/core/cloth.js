// Cloth-trade units. A product is stocked and costed in its base unit (metre for cloth, piece for packed goods).
// Optional sale units sit on top of it: a thaan (bolt / roll with a fixed number of metres) and a box or pack.
// Stock and cost are always kept in base units. A sale or purchase line also remembers the unit it was sold in,
// its conversion factor and its rate per that unit, so the document reads naturally ("2 thaan @ 24,000").
import { num, round2, round3, fmtQty } from './utils.js';
import { t } from '../i18n/i18n.js';

// Sale units a product can be sold in: [{ key, label, factor }]. factor = base units per one sale unit.
export function unitOptions(p) {
  const opts = [{ key: 'base', label: p.unit || 'pcs', factor: 1 }];
  const tl = num(p.thaanLength);
  if (tl > 0) opts.push({ key: 'thaan', label: 'thaan', factor: tl });
  const ps = num(p.packSize);
  if (ps > 0) opts.push({ key: 'pack', label: p.packName || 'box', factor: ps });
  return opts;
}

export function unitOption(p, key) {
  const opts = unitOptions(p);
  return opts.find((o) => o.key === key) || opts[0];
}

// Unit a product is added in when it is scanned or tapped: the shop's chosen default, else a thaan if it has one.
export function defaultUnitKey(p) {
  const opts = unitOptions(p);
  if (p.defaultUnit && opts.some((o) => o.key === p.defaultUnit)) return p.defaultUnit;
  return num(p.thaanLength) > 0 ? 'thaan' : 'base';
}

// Rate per sale unit. Retail uses the thaan / box rate when the shop set one, otherwise the per-metre rate × factor.
// cost: purchase cost per sale unit.
export function unitRate(p, key, { wholesale = false, cost = false } = {}) {
  const o = unitOption(p, key);
  if (cost) return round2((p.purchasePrice || 0) * o.factor);
  if (!wholesale) {
    if (key === 'thaan' && num(p.thaanRate) > 0) return round2(p.thaanRate);
    if (key === 'pack' && num(p.boxRate) > 0) return round2(p.boxRate);
  }
  const perBase = wholesale && num(p.wholesalePrice) > 0 ? p.wholesalePrice : (p.salePrice || 0);
  return round2(perBase * o.factor);
}

// Stock as "4 thaan + 15 m" when the product is sold by thaan or box; otherwise a plain quantity.
export function fmtStock(p, qty = p.stock || 0) {
  const q = round3(qty);
  const unit = t(p.unit || '');
  const tl = num(p.thaanLength); const ps = num(p.packSize);
  const big = tl > 0 ? { n: tl, label: 'thaan' } : ps > 0 ? { n: ps, label: p.packName || 'box' } : null;
  if (big && q >= big.n) {
    const whole = Math.floor(q / big.n + 1e-9);
    const rem = round3(q - whole * big.n);
    return `${fmtQty(whole)} ${t(big.label)}${rem > 0 ? ` + ${fmtQty(rem)} ${unit}` : ''}`;
  }
  return `${fmtQty(q)} ${unit}`;
}

// Quantity and unit of a stored sale/purchase line: "2 thaan", "3.5 m". Older lines have no sell unit.
export function fmtSold(i) {
  return `${fmtQty(i.sellQty ?? i.qty)} ${t(i.sellUnit || i.unit || '')}`.trim();
}

// Stable colour for a fabric colour name, so the same colour always gets the same swatch.
export function swatchHue(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 33 + ch.codePointAt(0)) >>> 0;
  return h % 360;
}
