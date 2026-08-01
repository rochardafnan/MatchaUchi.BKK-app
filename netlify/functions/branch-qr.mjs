/**
 * The branch's own PromptPay QR.
 *
 * GET  is public -- it is printed on the checkout screen for every customer.
 * PUT  is owner-only, and takes a data URL from the Shop settings uploader.
 *
 * Each Netlify site has its own blob store, so Pattaya uploading its QR can
 * never overwrite Pinklao's. When a branch has not uploaded one, GET replies
 * 404 and the page falls back to the QR built into it.
 */
import { getStore } from '@netlify/blobs';

const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export default async (req) => {
  const store = getStore('matchauchi');

  if (req.method === 'GET') {
    const found = await store
      .getWithMetadata('branch-qr', { type: 'arrayBuffer' })
      .catch(() => null);
    if (!found?.data) return new Response('No QR uploaded', { status: 404 });

    return new Response(found.data, {
      headers: {
        'content-type': found.metadata?.type || 'image/png',
        // Revalidate every time: swapping the QR must take effect immediately.
        'cache-control': 'no-cache',
      },
    });
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

    if (body?.clear) {
      await store.delete('branch-qr').catch(() => {});
      return json({ ok: true, cleared: true });
    }

    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(
      body?.dataUrl || ''
    );
    if (!match) return json({ error: 'Expected a PNG, JPEG or WebP image' }, 400);

    const type = match[1].toLowerCase();
    if (!ALLOWED.has(type)) return json({ error: 'Unsupported image type' }, 400);

    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length) return json({ error: 'That image was empty' }, 400);
    if (bytes.length > MAX_BYTES) return json({ error: 'That image is over 3MB' }, 400);

    await store.set('branch-qr', bytes, { metadata: { type } });
    return json({ ok: true, bytes: bytes.length });
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/branch-qr' };
