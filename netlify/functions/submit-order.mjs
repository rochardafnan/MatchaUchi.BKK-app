/**
 * Receives an order from the menu and pushes it to the shop's LINE.
 *
 * The reply distinguishes "we stored it" from "it reached your phone". The menu
 * only shows a clean confirmation when `delivered` is true; otherwise it tells
 * the customer to ring the shop, because an order sitting in storage that
 * nobody saw is worse than an obvious failure.
 */
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import { clean, defaults } from './settings.mjs';

const MAX_SLIP_BYTES = 6 * 1024 * 1024;
const MAX_LINES = 40;
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/* Functions run in UTC; the shop trades on Bangkok time. Shifting the clock and
   reading the UTC fields gives Bangkok wall time without a timezone library. */
const bangkokNow = () => new Date(Date.now() + 7 * 60 * 60 * 1000);
const toMinutes = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

function shopIsOpen(settings, now = bangkokNow()) {
  if (settings.override === 'closed') return false;
  if (settings.override === 'open' || settings.override === 'busy') return true;

  const today = settings.hours[DAYS[(now.getUTCDay() + 6) % 7]];
  if (!today || today.shut) return false;

  let open = toMinutes(today.open);
  let close = toMinutes(today.close);
  if (close <= open) close += 1440; // trades past midnight
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  return mins >= open && mins < close;
}

const text = (v, max) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

function readOrder(body) {
  const lines = Array.isArray(body?.lines) ? body.lines.slice(0, MAX_LINES) : [];
  const parsed = lines
    .map((l) => ({
      qty: Number.isFinite(l?.qty) ? Math.max(1, Math.min(99, Math.trunc(l.qty))) : 1,
      name: text(l?.name, 80),
      options: text(l?.options, 240),
      amount: Number.isFinite(l?.amount) ? Math.max(0, Math.round(l.amount)) : 0,
    }))
    .filter((l) => l.name);

  return {
    name: text(body?.customer?.name, 80),
    phone: text(body?.customer?.phone, 32),
    pickup: text(body?.pickup, 120),
    pay: text(body?.pay, 120),
    note: text(body?.note, 500),
    lines: parsed,
    total: parsed.reduce((sum, l) => sum + l.amount, 0),
  };
}

const baht = (n) => '฿' + n.toLocaleString('en-US');

function compose(order, number, when) {
  const stamp = when.toISOString().slice(0, 16).replace('T', ' ');
  const items = order.lines
    .map((l) => `${l.qty} × ${l.name}\n   ${l.options}\n   ${baht(l.amount)}`)
    .join('\n');

  return [
    `🍵 ออเดอร์ใหม่ / New order  #${number}`,
    '—————————————',
    items,
    '—————————————',
    `รวม / Total   ${baht(order.total)}`,
    '',
    `ชื่อ / Name    ${order.name}`,
    `โทร / Phone   ${order.phone}`,
    `รับที่ / Pickup  ${order.pickup}`,
    `ชำระ / Payment ${order.pay}`,
    order.note ? `หมายเหตุ / Note  ${order.note}` : null,
    `เวลา / Time    ${stamp} (BKK)`,
  ]
    .filter(Boolean)
    .join('\n');
}

async function storeSlip(store, slip, origin) {
  const match = /^data:(image\/(png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(
    slip?.dataUrl || ''
  );
  if (!match) return null;

  const bytes = Buffer.from(match[3], 'base64');
  if (!bytes.length || bytes.length > MAX_SLIP_BYTES) return null;

  const type = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const id = crypto.randomUUID();
  await store.set(`slips/${id}`, bytes, { metadata: { type } });

  return {
    url: `${origin}/api/slip/${id}`,
    // LINE image messages accept JPEG and PNG only.
    showable: type === 'image/jpeg' || type === 'image/png',
  };
}

async function pushToLine(token, recipients, messages) {
  const res = await fetch('https://api.line.me/v2/bot/message/multicast', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to: recipients.slice(0, 500), messages }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, reason: `LINE ${res.status}: ${(await res.text()).slice(0, 300)}` };
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return json({ error: 'LINE_CHANNEL_ACCESS_TOKEN is not set' }, 500);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body was not valid JSON' }, 400);
  }

  const order = readOrder(body);
  if (!order.name || !order.phone) return json({ error: 'Name and phone are required' }, 400);
  if (!order.lines.length) return json({ error: 'The order has no items' }, 400);

  const store = getStore('matchauchi');
  const saved = await store.get('settings', { type: 'json' }).catch(() => null);
  const settings = saved ? clean(saved) : defaults();

  // Re-checked here so a stale phone cannot order into a closed shop.
  if (!shopIsOpen(settings)) {
    return json({ error: 'closed', message: 'ขณะนี้ร้านปิดรับออเดอร์ / The shop is closed' }, 409);
  }

  const when = bangkokNow();
  const counter = (await store.get('counter', { type: 'json' }).catch(() => null)) || { n: 0 };
  const number = String(counter.n + 1).padStart(4, '0');
  await store.setJSON('counter', { n: counter.n + 1 });

  const origin = new URL(req.url).origin;
  const slip = await storeSlip(store, body?.slip, origin).catch(() => null);

  const messages = [{ type: 'text', text: compose(order, number, when) }];
  if (slip?.showable) {
    messages.push({ type: 'image', originalContentUrl: slip.url, previewImageUrl: slip.url });
  } else if (slip) {
    messages.push({ type: 'text', text: `สลิป / Slip: ${slip.url}` });
  }

  const recipients = (await store.get('recipients', { type: 'json' }).catch(() => null)) || [];
  let delivered = false;
  let reason = recipients.length
    ? null
    : 'No LINE recipients registered yet — add the Official Account as a friend.';

  if (recipients.length) {
    const sent = await pushToLine(token, recipients, messages).catch((e) => ({
      ok: false,
      reason: String(e).slice(0, 300),
    }));
    delivered = sent.ok;
    reason = sent.ok ? null : sent.reason;
  }

  await store.setJSON(`orders/${when.toISOString().slice(0, 10)}/${number}`, {
    number,
    at: when.toISOString(),
    order,
    slip: slip?.url || null,
    delivered,
    reason,
  });

  return json({ ok: true, orderNo: number, delivered, reason });
};

export const config = { path: '/api/submit-order' };
