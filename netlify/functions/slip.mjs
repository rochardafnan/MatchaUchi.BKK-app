/**
 * Serves an uploaded payment slip.
 *
 * LINE fetches image messages from a public HTTPS address, so this has to be
 * reachable without a login. The id is a random UUID, so a slip is effectively
 * unguessable, and nothing here lists them.
 */
import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  const id = context.params?.id || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });

  const store = getStore('matchauchi');
  const found = await store
    .getWithMetadata(`slips/${id}`, { type: 'arrayBuffer' })
    .catch(() => null);

  if (!found?.data) return new Response('Not found', { status: 404 });

  return new Response(found.data, {
    headers: {
      'content-type': found.metadata?.type || 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};

export const config = { path: '/api/slip/:id' };
