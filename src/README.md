# Source

`public/index.html` is **generated**. Do not edit it — the next build overwrites
it. Edit `template.html` here and rebuild.

The page ships as a single file with its photographs, logo and paper texture
inlined as base64, so a customer's phone makes one request and the menu is
readable the moment it arrives. That is why the built file is ~900 KB and why
it is not editable by hand.

## Rebuilding the page

```bash
cd src
python build_html.py
```

That substitutes the `__PLACEHOLDER__` tokens in `template.html` with the
base64 assets and writes the result to **both** `src/matchauchi_draft.html`
(for a quick local look) and `../public/index.html` (what Netlify serves).

Commit the regenerated `public/index.html` along with your `template.html`
change — there is no build step on Netlify, it serves `public/` as it finds it.

## What is here

| File | |
|---|---|
| `template.html` | the whole app — markup, CSS and JavaScript |
| `build_html.py` | inlines the assets and writes the published page |
| `photos_b64.json` | the 41 menu photographs, keyed by item id |
| `emblem_b64.txt`, `wordmark_b64.txt`, `logo_b64.txt` | the brand marks |
| `paper_b64.txt` | the kraft paper texture, tiled as the background |
| `qr_b64.txt` | the PromptPay QR built into the page as a fallback |

A branch that uploads its own PromptPay QR in Shop settings overrides
`qr_b64.txt`; it is only used when a branch has not.

## Asset pipelines

These produced the files above and are kept so the work can be redone. They
are **not** part of a normal build — run one only when its input changes.

| Script | |
|---|---|
| `build_photos.py` | lifts the photographs out of the printed menu PDF, applies their alpha soft-masks, trims and composites them onto the paper |
| `build_brand.py` | splits the supplied logo into the emblem and the wordmark |
| `build_qr.py` | encodes the PromptPay QR |
| `build_qr_poster.py` | the print-ready counter poster |
| `build_icons.py` | the home-screen icons in `public/icons/` |

`build_photos.py` needs the original menu PDF, which is **not** in this
repository. `photos_b64.json` is therefore the only copy of that work — treat
it as a source file, not a build artefact.

`build_photos.py`, `build_brand.py`, `build_qr_poster.py` and `build_icons.py`
need Pillow; `build_photos.py` also needs PyMuPDF, and the QR scripts need
`qrcode`.

## The QR shown in the app

The QR a shop holds up for a customer is **not** built here — it is encoded in
the browser, inside `template.html`, from the address the page is loaded at.
One codebase serves every branch, so a picture built at deploy time would show
Bangkok's address on Pattaya's counter.

Its two lookup tables are the standard ones for error-correction level M. If
you change that code, check it against a known-good encoder before shipping:
a symbol that is subtly wrong still *looks* like a QR code, and the only
symptom is that nothing can scan it.

## Deploying

Pushing to `main` triggers a Netlify production deploy, which costs credits
(see the note in the top-level `README.md`). Batch changes into one push.

To commit something that does not need deploying — a change in `src/` alone,
or documentation — put `[skip netlify]` in the commit message and Netlify will
leave it alone.
