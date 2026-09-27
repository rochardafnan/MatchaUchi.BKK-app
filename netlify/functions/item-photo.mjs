/**
 * Photos for menu items the shop added itself.
 *
 * GET  is public -- a customer's phone loads these the same way it loads the
 *      built-in photos, which are baked into the page.
 * PUT  is owner-only, and takes a data URL from the item editor.
 *
 * Each photo is its own blob rather than a field in the settings document, so
 * settings stay small and quick to read on every page load. Each Netlify site
 * has its own store, so one branch's photos never reach another's.
 */
import { getStore } from '@netlify/blobs';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);

/* Ids are minted by the page as m_<base36 time>. Anchoring the pattern here
   as well keeps a crafted id from reaching the blob store as a path. */
const ITEM_ID = /^m_[a-z0-9]{1,24}$/;
const keyFor = (id) => 'item-photo:' + id;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export default async (req) => {
  const store = getStore('matchauchi');
  const id = new URL(req.url).searchParams.get('id') || '';

  if (req.method === 'GET') {
    if (!ITEM_ID.test(id)) return new Response('Bad id', { status: 400 });

    const found = await store
      .getWithMetadata(keyFor(id), { type: 'arrayBuffer' })
      .catch(() => null);
    if (!found?.data) return new Response('No photo', { status: 404 });

    return new Response(found.data, {
      headers: {
        'content-type': found.metadata?.type || 'image/webp',
        // The page asks for a new version after every upload, so a photo that
        // has not changed can be cached hard.
        'cache-control': 'public, max-age=31536000, immutable',
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

    const target = String(body?.id || '');
    if (!ITEM_ID.test(target)) return json({ error: 'Bad item id' }, 400);

    if (body?.clear) {
      await store.delete(keyFor(target)).catch(() => {});
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
    if (bytes.length > MAX_BYTES) return json({ error: 'That image is over 2MB' }, 400);

    await store.set(keyFor(target), bytes, { metadata: { type } });
    return json({ ok: true, bytes: bytes.length });
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/item-photo' };
