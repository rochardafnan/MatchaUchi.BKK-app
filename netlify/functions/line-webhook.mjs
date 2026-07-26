/**
 * LINE webhook — this is how the shop learns who to send orders to.
 *
 * Point the Messaging API channel's webhook at /api/line-webhook. When you and
 * your wife add the Official Account as a friend, LINE calls this with a
 * `follow` event carrying each userId, and those ids become the recipients for
 * every future order. Removing the friend takes a device back off the list.
 *
 * Every request is checked against the channel secret first: without that,
 * anyone who found the address could register themselves to receive orders.
 */
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

function signatureMatches(secret, raw, provided) {
  if (!provided) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Lengths must match before timingSafeEqual, which throws on a mismatch.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async (req) => {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return new Response('LINE_CHANNEL_SECRET is not set', { status: 500 });

  const raw = await req.text();
  if (!signatureMatches(secret, raw, req.headers.get('x-line-signature'))) {
    return new Response('Bad signature', { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response('ok'); // LINE's verify ping sends an empty body
  }

  const store = getStore('matchauchi');
  const known = (await store.get('recipients', { type: 'json' }).catch(() => null)) || [];
  const ids = new Set(known);
  let changed = false;

  for (const event of payload.events || []) {
    const id = event?.source?.userId;
    if (!id) continue;

    if (event.type === 'unfollow') {
      if (ids.delete(id)) changed = true;
    } else if (event.type === 'follow' || event.type === 'message') {
      // A message counts too, so a re-add or a quick "hi" re-registers a phone.
      if (!ids.has(id)) {
        ids.add(id);
        changed = true;
      }
    }
  }

  if (changed) await store.setJSON('recipients', [...ids]);

  // LINE expects a prompt 200 whatever happened.
  return new Response('ok');
};

export const config = { path: '/api/line-webhook' };
