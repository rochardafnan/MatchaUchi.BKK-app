/**
 * Shop settings shared by every device.
 *
 * GET  is public: a customer's phone reads it on load, so what the shop has
 *      switched off is what the customer actually sees.
 * PUT  is owner-only and guarded by OWNER_KEY.
 *
 * Anything arriving on a PUT is rebuilt field by field rather than trusted, so
 * a malformed or hostile body can never reshape what customers read back.
 */
import { getStore } from '@netlify/blobs';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const OVERRIDES = new Set(['auto', 'open', 'busy', 'closed', 'brk']);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const LISTS = ['items', 'milks', 'toppings', 'pickups', 'pays'];

/* Serving styles a price may be set against. Goodmate is absent on purpose: it
   is always OATSIDE + 10 and is never stored. */
const TIERS = new Set(['clear', 'cow', 'oatside', 'coconut', 'freshcoconut']);
const MAX_PRICE = 9999;
const MAX_EDITED_ITEMS = 300;
const MAX_SPOTS = 12;
const MAX_CATS = 12;
const MAX_MENU = 60;
const MAX_TAGS = 6;

/* Categories and items the shop adds are minted by the page with a c_ / m_
   prefix. Requiring it here is what keeps an added item from taking the id of
   one of the 41 printed items -- this function never sees the printed menu, so
   it cannot check for a clash any other way. */
const CAT_ID = /^c_[a-z0-9]{1,24}$/;
const ITEM_ID = /^m_[a-z0-9]{1,24}$/;

/* Branch identity. One codebase serves every shop, so anything that differs
   between branches lives here rather than in the page, and each Netlify site
   keeps its own copy. The defaults describe Pinklao so that the original site
   keeps working untouched; a new branch overwrites them in Shop settings. */
const branchDefaults = () => ({
  th: 'สาขากรุงเทพฯ · ปิ่นเกล้า',
  en: 'Bangkok · Pinklao',
  tels: ['081-493-8074', '080-585-5008'],
  bank: 'ธนาคารกสิกรไทย / Kasikorn Bank',
  account: '140-3-95978-9',
  holder: 'น.ส. อัฟนาน อะหมัด · Afnan Ahmad',
  // Collection at the shop is always offered, but how it is worded is local.
  selfTh: 'รับบนกำแพงร้าน',
  selfEn: 'Self pick up',
});

/* Pickup points between "at the shop" and "somewhere else", both of which are
   built in and always offered. */
const spotDefaults = () => [
  { id: 'school', th: 'หน้าประตูโรงเรียน', en: 'Anuchon Bankoknoi School Gate' },
  { id: 'masjid', th: 'บริเวณมัสยิด', en: 'Masjid Area' },
];

export const defaults = () => ({
  items: [],
  milks: [],
  toppings: [],
  cats: [],
  menu: [],
  brk: { from: '12:00', to: '13:00' },
  pickups: [],
  pays: [],
  prices: {},
  branch: branchDefaults(),
  spots: spotDefaults(),
  hours: Object.fromEntries(
    DAYS.map((d) => [d, { open: '08:00', close: '20:00', shut: false }])
  ),
  override: 'auto',
});

const text = (v, max, fallback = '') => {
  if (typeof v !== 'string') return fallback;
  const t = v.replace(/\s+/g, ' ').trim().slice(0, max);
  return t || fallback;
};

export function clean(input) {
  const out = defaults();
  if (!input || typeof input !== 'object') return out;

  for (const key of LISTS) {
    if (Array.isArray(input[key])) {
      out[key] = input[key]
        .filter((v) => typeof v === 'string' && v.length <= 64)
        .slice(0, 200);
    }
  }
  if (OVERRIDES.has(input.override)) out.override = input.override;

  // Price overrides: whole baht only, on known serving styles, keyed by item id.
  if (input.prices && typeof input.prices === 'object') {
    for (const [id, tiers] of Object.entries(input.prices).slice(0, MAX_EDITED_ITEMS)) {
      if (typeof id !== 'string' || id.length > 64 || !tiers || typeof tiers !== 'object') continue;
      const kept = {};
      for (const [tier, value] of Object.entries(tiers)) {
        if (!TIERS.has(tier)) continue;
        const n = Math.round(Number(value));
        if (Number.isFinite(n) && n >= 0 && n <= MAX_PRICE) kept[tier] = n;
      }
      if (Object.keys(kept).length) out.prices[id] = kept;
    }
  }

  // Branch identity. Each field falls back to the default if blanked, so a
  // branch can never end up nameless or without a contact number.
  if (input.branch && typeof input.branch === 'object') {
    const b = input.branch;
    const d = branchDefaults();
    out.branch = {
      th: text(b.th, 80, d.th),
      en: text(b.en, 80, d.en),
      tels: Array.isArray(b.tels)
        ? b.tels.map((t) => text(t, 32)).filter(Boolean).slice(0, 4)
        : d.tels,
      bank: text(b.bank, 80, d.bank),
      account: text(b.account, 40, d.account),
      holder: text(b.holder, 80, d.holder),
      selfTh: text(b.selfTh, 80, d.selfTh),
      selfEn: text(b.selfEn, 80, d.selfEn),
    };
    if (!out.branch.tels.length) out.branch.tels = d.tels;
  }

  // Named pickup points. An empty list is allowed: a branch may only do
  // collection at the shop.
  if (Array.isArray(input.spots)) {
    const seen = new Set();
    out.spots = [];
    for (const s of input.spots.slice(0, MAX_SPOTS)) {
      if (!s || typeof s !== 'object') continue;
      const id = text(s.id, 32).replace(/[^a-zA-Z0-9_-]/g, '');
      const th = text(s.th, 80);
      const en = text(s.en, 80);
      // "self" and "other" are built into the app and cannot be redefined here.
      if (!id || id === 'self' || id === 'other' || seen.has(id)) continue;
      if (!th && !en) continue;
      seen.add(id);
      out.spots.push({ id, th: th || en, en: en || th });
    }
  }

  // The shop's own categories. They sit after the printed ones in the menu.
  if (Array.isArray(input.cats)) {
    const seen = new Set();
    out.cats = [];
    for (const c of input.cats.slice(0, MAX_CATS)) {
      if (!c || typeof c !== 'object') continue;
      const id = text(c.id, 32);
      if (!CAT_ID.test(id) || seen.has(id)) continue;
      const en = text(c.en, 60);
      const th = text(c.th, 80);
      if (!en && !th) continue;
      seen.add(id);
      out.cats.push({ id, en: en || th, th: th || en, sub: text(c.sub, 90) });
    }
  }

  // The shop's own menu items. A price list with nothing in it would show an
  // item that cannot be ordered, so those are dropped.
  if (Array.isArray(input.menu)) {
    const seen = new Set();
    out.menu = [];
    for (const m of input.menu.slice(0, MAX_MENU)) {
      if (!m || typeof m !== 'object') continue;
      const id = text(m.id, 32);
      if (!ITEM_ID.test(id) || seen.has(id)) continue;

      const price = {};
      if (m.price && typeof m.price === 'object') {
        for (const [tier, value] of Object.entries(m.price)) {
          if (!TIERS.has(tier)) continue;
          const n = Math.round(Number(value));
          if (Number.isFinite(n) && n >= 0 && n <= MAX_PRICE) price[tier] = n;
        }
      }
      if (!Object.keys(price).length) continue;

      const name = text(m.name, 80);
      if (!name) continue;

      seen.add(id);
      out.menu.push({
        id,
        cat: text(m.cat, 32),
        name,
        th: text(m.th, 300),
        tags: Array.isArray(m.tags)
          ? m.tags.map((t) => text(t, 40)).filter(Boolean).slice(0, MAX_TAGS)
          : [],
        price,
        photo: !!m.photo,
        pv: Number.isFinite(Number(m.pv)) ? Math.max(0, Math.trunc(Number(m.pv))) : 0,
      });
    }
  }

  // The errand window. Kept whatever the override is, so a shop that uses the
  // same lunch break every day does not have to re-enter it.
  if (input.brk && typeof input.brk === 'object') {
    out.brk = {
      from: TIME.test(input.brk.from) ? input.brk.from : '12:00',
      to: TIME.test(input.brk.to) ? input.brk.to : '13:00',
    };
  }

  if (input.hours && typeof input.hours === 'object') {
    for (const day of DAYS) {
      const h = input.hours[day];
      if (!h || typeof h !== 'object') continue;
      out.hours[day] = {
        open: TIME.test(h.open) ? h.open : '08:00',
        close: TIME.test(h.close) ? h.close : '20:00',
        shut: !!h.shut,
      };
    }
  }
  return out;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export default async (req) => {
  const store = getStore('matchauchi');

  if (req.method === 'GET') {
    const saved = await store.get('settings', { type: 'json' }).catch(() => null);
    return json(saved ? clean(saved) : defaults());
  }

  if (req.method === 'PUT') {
    const key = process.env.OWNER_KEY;
    if (!key) return json({ error: 'OWNER_KEY is not set on the site' }, 500);
    if (req.headers.get('x-owner-key') !== key) {
      return json({ error: 'Wrong owner code' }, 401);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Body was not valid JSON' }, 400);
    }

    const settings = clean(body);
    await store.setJSON('settings', settings);
    return json(settings);
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/settings' };
