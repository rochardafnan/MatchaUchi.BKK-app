# Opening a new MatchaUchi branch — handover pack

**For the new branch owner.** Give this whole file to your AI assistant (Claude
or similar) at the start of a fresh conversation and say:

> "I'm opening a new MatchaUchi branch. This document explains the system.
> Please walk me through it step by step."

Everything needed is below. You do **not** need to read or change any code.

---

## What this is

A menu website customers scan from a QR code. They browse, build an order, and
it arrives on the shop's LINE. The owner sets opening hours, shop status,
prices and what's sold out from inside the same page.

It already runs at the Pinklao branch in Bangkok. **The same code serves every
branch** — each branch is a separate deployment with its own data.

- Code: `https://github.com/rochardafnan/MatchaUchi.BKK-app`
- Existing branch (for reference): `https://matchauchibkk.netlify.app`

## What is yours alone vs. shared

Each branch's deployment has **its own storage**, so these never mix:

| Yours alone | Shared across branches |
|---|---|
| Orders and order numbers | The 41 matcha items and their photos |
| Prices | The ordering flow and design |
| Opening hours, shop status | Milk / syrup / sweetness options |
| Sold-out items and ingredients | The +฿10 Goodmate rule |
| Pickup points | |
| Bank details and PromptPay QR | |
| Which phones receive LINE orders | |

**Important:** the menu itself is shared. If you want an item added or the
design changed, that has to go through whoever maintains the code — it affects
every branch. Do not edit code to change your branch's name, prices or pickup
points; all of that is in the app's own settings (step 6).

---

## Setup

### 1. Get access to the code
Ask the Bangkok owner to add your GitHub account as a collaborator on the repo
above. (Create a free GitHub account first if you don't have one.)

### 2. Create your Netlify site
Sign up free at [netlify.com](https://netlify.com) — signing in **with GitHub**
makes this easier. Then **Add new site → Import an existing project → GitHub →**
pick `MatchaUchi.BKK-app`.

Change nothing on the build settings screen — the correct values are already in
`netlify.toml`. Deploy.

Rename the site under **Site configuration → Change site name**, e.g.
`matchauchipattaya`.

### 3. Create your own LINE Official Account
1. [manager.line.biz](https://manager.line.biz) → create an Official Account
2. **Settings → Messaging API** → enable it (create a Provider if asked)
3. That links it to [developers.line.biz](https://developers.line.biz/console)

Use **your own** OA, not Bangkok's. The free LINE plan allows 200 push messages
a month **per account**; sharing one would halve what each branch gets.

### 4. Put three secrets into Netlify
**Site configuration → Environment variables → Add a variable**, three times.
Leave "Contains secret values" **unticked** (ticking it needs a paid plan).

| Key | Where it comes from |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers → your channel → **Messaging API** tab → Channel access token → Issue |
| `LINE_CHANNEL_SECRET` | same channel → **Basic settings** tab |
| `OWNER_KEY` | invent it — the code you'll type to unlock the owner controls |

Then **Deploys → Trigger deploy → Deploy site**. This step is required —
functions only read these when they start.

*Check:* open `https://YOUR-SITE.netlify.app/api/settings` — you should see
settings data, not an error.

### 5. Connect LINE
In **LINE Developers → your channel → Messaging API**:

1. **Webhook URL** → `https://YOUR-SITE.netlify.app/api/line-webhook`
2. **Use webhook** → ON
3. Press **Verify** → must say **Success**
4. Turn **Auto-reply messages** OFF (in LINE Official Account Manager), or the
   OA answers every order with a canned reply

Then **every person who should receive orders opens LINE, adds the shop's OA as
a friend, and sends it any message.** Nothing arrives until at least one person
does this — it is the most commonly missed step.

### 6. Set up your branch inside the app
Open `https://YOUR-SITE.netlify.app/#manage` on your phone and enter your
`OWNER_KEY`. Two buttons appear (customers never see them).

⚠️ **A new branch starts with Pinklao's details as placeholders**, so this step
is not optional — otherwise your page shows Bangkok's name and bank account.

In **⚙ Shop settings**:
- **ข้อมูลสาขา / Branch details** — branch name (Thai + English), phone
  numbers, how "collect at the shop" should read, bank, account number,
  account name, and **upload your own PromptPay QR**
- **จุดรับสินค้า / Pickup points** — delete Bangkok's entries, add your own.
  "Collect at the shop" and "Other location" are always offered.
- **เวลาทำการ / Opening hours** — your real trading hours
- **สถานะร้าน / Shop status** — normally leave on *Follow opening hours*

In **⬡ Manage stock**: set your prices, and switch off anything you don't sell.

Repeat step 6 on each phone that needs the controls (open `/#manage` once).

### 7. Test, then print the QR
Place a real order yourself. You should see **"ส่งออเดอร์แล้ว / Order sent
#0001"** and it should appear in your LINE.

- *"บันทึกออเดอร์แล้ว / Order recorded"* means it saved but LINE delivery
  failed — usually step 5 wasn't completed, or the token is wrong.

Then get a QR poster made pointing at your **plain address** —
`https://YOUR-SITE.netlify.app`, **never** the `#manage` one.

---

## Things worth knowing

- **200 LINE messages/month** on the free plan. Each order costs one message per
  registered phone, so two phones ≈ 100 orders/month.
- **Owner controls are hidden, not locked away.** Customers don't see the
  buttons, and the server rejects any change without the correct `OWNER_KEY` —
  so keep that code private.
- **Payment slips** customers upload are served from an unguessable link with no
  login. Treat that link as private.
- **The shop closes itself** outside opening hours, checked on the server, so a
  phone left open overnight can't order into a closed shop.
- **Prices:** Goodmate oat milk is always OATSIDE + ฿10, calculated
  automatically — you only set the OATSIDE price.
