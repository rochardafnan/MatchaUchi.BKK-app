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
const OVERRIDES = new Set(['auto', 'open', 'busy', 'closed']);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const LISTS = ['items', 'milks', 'pickups', 'pays'];

export const defaults = () => ({
  items: [],
  milks: [],
  pickups: [],
  pays: [],
  hours: Object.fromEntries(
    DAYS.map((d) => [d, { open: '08:00', close: '20:00', shut: false }])
  ),
  override: 'auto',
});

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
