# MatchaUchi · สาขากรุงเทพฯ ปิ่นเกล้า — ordering menu

Customers scan a QR, browse the menu, build an order, and it arrives on the
shop's LINE. The owners set opening hours, shop status, pickup points, payment
methods and what's sold out from inside the same page.

```
public/index.html            the whole customer app (self-contained)
netlify/functions/
  settings.mjs               GET shared shop settings (public) · PUT (owner)
  line-webhook.mjs           registers owner LINE userIds from follow events
  submit-order.mjs           validates an order, stores it, pushes to LINE
  slip.mjs                   serves an uploaded payment slip to LINE
```

Settings, orders and slips are kept in **Netlify Blobs** — no separate database.

---

## 1. Put the code on Netlify

1. Create a GitHub repo and push this folder.
2. In Netlify: **Add new site → Import an existing project**, pick the repo.
3. Build settings are already in `netlify.toml`; publish directory is `public`
   and there is no build step. Deploy.

You'll get an address like `https://matchauchi.netlify.app`.

## 2. Set the three secrets

**Site configuration → Environment variables.** Never commit these.

| Variable | Where it comes from |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers Console → your channel → Messaging API → issue a long-lived token |
| `LINE_CHANNEL_SECRET` | same channel → Basic settings |
| `OWNER_KEY` | invent it — this is the code you type to unlock the owner controls |

Redeploy after adding them (**Deploys → Trigger deploy**), because functions
only read environment variables at boot.

## 3. Connect LINE

1. LINE Developers Console → your channel → **Messaging API**.
2. **Webhook URL** → `https://YOUR-SITE.netlify.app/api/line-webhook`
3. Turn **Use webhook** on, then press **Verify** — it should say Success.
4. Turn **Auto-reply messages** off, or the OA answers every order with a canned reply.
5. **You and your wife each add the Official Account as a friend** from your own
   LINE accounts. That `follow` event is what registers your phones as the
   recipients. Nothing arrives until at least one of you has done this.

To check it worked, place a test order — the reply tells you whether it was
delivered. If a phone should stop receiving orders, block/remove the OA as a
friend and the `unfollow` event drops it.

## 4. Unlock the owner controls

Open **`https://YOUR-SITE.netlify.app/#manage`** once on each of your phones and
enter `OWNER_KEY` when asked. The two buttons then appear on the normal address.

Customers never see them, and the code is checked by the server on every save —
so knowing the address alone is not enough to change anything.

Inside **Shop settings → Owner mode** there is *Hide the controls on this
device* if you hand your phone to someone.

## 5. Print the QR

Point it at the plain address — `https://YOUR-SITE.netlify.app` — **without**
`#manage`.

---

## How the shop status works

`Follow opening hours` is the normal mode: the banner opens and closes itself on
the weekly schedule (Bangkok time, checked on the server too, so a phone left
open overnight can't order into a closed shop). `Open now` / `Busy` / `Closed
now` override the schedule until set back to automatic.

## Things worth knowing

- **Free LINE plan sends 200 push messages/month.** One order to two phones
  costs 2, so roughly **100 orders/month** before you need a paid plan. Dropping
  to one recipient doubles that.
- **Slips are public but unguessable.** LINE has to fetch the image over plain
  HTTPS, so `/api/slip/<uuid>` needs no login. The id is random and nothing
  lists them, but treat it as a link anyone holding it can open.
- **Order numbers** come from a counter in Blobs. Two orders placed in the same
  instant could in theory collide; at this volume it is not worth locking.
- **Orders are archived** under `orders/YYYY-MM-DD/NNNN` in Blobs, including
  whether delivery succeeded.

## Local development

Requires Node 18+ and the Netlify CLI (neither is installed on the machine this
was written on, so the functions have **not** been run locally — they are
exercised for the first time on deploy):

```bash
npm install
npx netlify dev
```

Set the same three environment variables in a `.env` file for local runs.
