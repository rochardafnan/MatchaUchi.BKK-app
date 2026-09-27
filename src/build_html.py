import json, os
tpl = open('template.html', encoding='utf-8').read()
subs = {
    '__PHOTOS_JSON__': json.dumps(json.load(open('photos_b64.json'))),
    '__EMBLEM_B64__':  open('emblem_b64.txt').read().strip(),
    '__WORDMARK_B64__':open('wordmark_b64.txt').read().strip(),
    '__QR_B64__':      open('qr_b64.txt').read().strip(),
    '__PAPER_B64__':   open('paper_b64.txt').read().strip(),
}
for token, value in subs.items():
    tpl = tpl.replace(token, value)
    assert token not in tpl, token
assert '__LOGO_B64__' not in tpl, 'stale logo token still referenced'
assert 'prefers-color-scheme' not in tpl
open('matchauchi_draft.html', 'w', encoding='utf-8').write(tpl)

# The published page is the same file. Writing it here too keeps the built
# output and what Netlify actually serves from drifting apart.
published = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'index.html')
open(published, 'w', encoding='utf-8').write(tpl)

print('built', round(os.path.getsize('matchauchi_draft.html')/1024), 'KB',
      '-> matchauchi_draft.html and public/index.html')
