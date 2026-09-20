# El Mundialet

<img src="public/logo-banner.svg" alt="El Mundialet" width="620">

A tiny Next.js app for a birthday costume party. A guest types their name and
email and the app hands them **one country** — its flag, its colours and a clip
of its national anthem. What they actually wear is entirely up to them; the app
does not suggest costumes. Each country is handed out **once**: the moment it is
claimed it leaves the pool, so forty guests end up with forty different
countries and nobody has to coordinate anything.

- Guest view: `/`
- Ops dashboard: `/admin` (Catalan, gated by `ADMIN_KEY`)
- Countries: `src/data/countries.ts` (44 entries)

---

## The guest flow

1. **Name + email.** The email is normalised (trimmed + lowercased) and is the
   identity — there are no accounts, passwords or sessions. The name is purely
   for the host: it is what shows up in the admin dashboard.

   Submitting runs `POST /api/precheck`, which applies **every** rule a claim
   would — dead mail domain, a browser that already registered, a network over
   its cap — and assigns nothing. Refusals therefore surface on the details
   screen, next to the field that caused them, instead of after the guest has
   answered the RSVP and watched the reel start.
2. **"Hi seràs?"** Nothing is claimed until the guest says they are coming — a
   country handed to a "no" is a country nobody at the party gets to wear. The
   answer is **stored**, so a guest who declines and comes back later is not
   asked again: they land straight on their own goodbye, with the option to
   change their mind. A `maybe` or `no` lives in `guests[]`; a `yes` is written
   by `claim` in the same transaction as the country, so the two can never
   disagree.
3. **A country is assigned** at random from the countries not yet taken, stored
   against the email, and removed from the pool.
4. **One reroll.** If they hate what they got, they can reroll exactly once. The
   first country goes straight back into the pool for someone else; the second
   one is final. Only ever **one** country is persisted per guest.
5. **Coming back** from any device with the same email returns the same country.
6. **The party is capped at the number of countries.** Once all 44 are held,
   a new guest is told the party is full (`409 party_full`) and gets nothing —
   the app never hands out a repeat. The refusal comes from `precheck`, on the
   details screen and before any RSVP, and again from `claim`, which decides
   inside the same locked read-modify-write that assigns, so two people racing
   for the last country cannot both get it. A guest who already holds a country
   is never refused, and once nothing is free the reroll button disappears
   (`409 no_countries_left` if one is pressed anyway; the reroll is not spent).
   A guest deleted from `/admin` frees their country and reopens the party.

   `duplicate: true` survives only as a read-side flag for assignments written
   before the cap existed; nothing sets it now.

### Endpoints

| Route                 | Method | Body / query        | Notes                                                              |
| --------------------- | ------ | ------------------- | ------------------------------------------------------------------ |
| `/api/claim`          | POST   | `{ email, name }`   | Assigns (or returns) a country. `400 invalid_email`, `400 invalid_email_domain`, `400 invalid_name`, `409 party_full`, `403 device_limit` / `ip_limit`, `500 storage_unavailable`. |
| `/api/reroll`         | POST   | `{ email }`         | Spends the one reroll. `200` with the same shape as claim, `409 reroll_used`, `409 no_countries_left`, `404 not_found`, `400 invalid_email`. |
| `/api/precheck`       | POST   | `{ email, name }`   | Every check `claim` makes, assigning nothing. Answers a `GuestState`. `400 invalid_email` / `invalid_email_domain` / `invalid_name`, `409 party_full`, `403 device_limit` / `ip_limit`. |
| `/api/rsvp`           | POST   | `{ email, name, answer }` | Stores a `maybe` or a `no`. A `yes` goes through `claim`. `400 invalid_answer`. |
| `/api/lookup?email=…` | GET    | —                   | What we know about an email. Answers a `GuestState`; never refuses, never writes. |
| `/api/login`          | POST   | `{ email, name }`   | After the draw: checks the pair and returns the guest's country, plus the contest state (`voting: { myVotes }`, the ballot by category) while `IS_CONCURS` is on. Sets no cookie. `401 no_match` (the same answer for a wrong email and a wrong name), `403 no_country`, `403 repartiment_open` while the draw is still on. |
| `/api/vote`           | POST   | `{ email, name, category, country }` | Records, replaces or (with `country: null`) clears the guest's vote in one category. `200 { myVotes }`, the whole ballot. `401 no_match`, `403 own_country`, `403 concurs_closed`, `400 invalid_category` / `invalid_country`, `409 country_repeated` (with the `category` it was already used in). |
| `/api/admin?key=…`    | GET    | —                   | Full dump for the dashboard, gated by `ADMIN_KEY`. `401 unauthorized`. |
| `/api/admin`          | DELETE | `{ email }` or `{ all: true }` | Removes one assignment, or every one. Key goes in the `x-admin-key` header. `401 unauthorized`, `400 invalid_email`, `404 not_found`. |

### The email is an identity, not a verified address

The app never sends mail, so it cannot prove a guest owns the address they
typed — proving that needs a code or a magic link delivered to the inbox and
handed back. The email is a **lookup key**: it is what lets somebody return on
another device and get the same country.

Two checks make that key harder to abuse, both in `src/lib/email.ts`:

- **The domain must accept mail.** `/api/claim` resolves the domain's MX
  records and answers `400 invalid_email_domain` when there are none, which
  rejects invented domains and parked typo-squats. There is deliberately **no
  A-record fallback**: `gmial.com` publishes an A record but no MX, so honouring
  the legacy "an A record implies mail" rule would wave through exactly the
  typos worth catching. It says nothing about whether the mailbox itself
  exists. DNS trouble (SERVFAIL, a timeout) **fails open** — a resolver hiccup
  must never leave a guest without a country. See `EMAIL_DNS_CHECK` below.
- **Provider aliases are collapsed.** The stored identity is the canonical
  address, so `alex@gmail.com`, `a.l.e.x@gmail.com` and
  `alex+festa@googlemail.com` are one guest holding one country rather than
  three. Gmail's dot-blindness is applied to Gmail only — a dot is significant
  at every other provider — and `+tag` stripping only to the providers known to
  support it.

Stored records are re-canonicalised on every read, so the rule reaches
assignments written before it existed. Where two old records collapse onto one
address the **earliest** claim wins, matching the rule that a guest is never
reassigned; the later country returns to the pool and the store logs it.

Neither check stops somebody with two real inboxes. That is what the signals
below are for.

### Detecting duplicate registrations

Guests register **from home, weeks before the party**, so the host may want to
spot one person quietly taking two countries under two email addresses. Two
signals are recorded, and the `/admin` dashboard groups them into a **possibles
duplicats** panel: device collisions first (strong), IP collisions second
(circumstantial).

**Device cookie — the strong signal.** On first claim the app sets `fd_device`,
a random per-browser id, `httpOnly`, one year. Two emails sharing one device id
means the same browser profile registered twice, and unlike an IP it survives a
change of network — home WiFi to mobile data to a café makes no difference.

- Catches: the obvious dodge of registering again from the same browser.
- Misses: a private window, cleared site data, a different browser, a second
  device. All produce a fresh id.
- False positives: a couple sharing one laptop is genuinely two guests.

**IP — circumstantial.** Every assignment also records the client IP from the
`x-forwarded-for` header (Vercel sets it; the left-most entry is used), shown in
the admin table with a `compartida ×N` badge.

- Because guests register from their own homes, a repeated IP is worth a look.
- But housemates and couples legitimately share one, and anyone on mobile data
  sits behind carrier-grade NAT together with total strangers.
- `x-forwarded-for` is a client-supplied header, so it is also **spoofable**.

**Neither ever blocks anything.** Both are hints for a human to eyeball; the app
never refuses a guest on their basis. The only hard cap that exists at all is
the opt-in `MAX_PER_IP` below, which is unset by default — and there is
deliberately **no `MAX_PER_DEVICE`**, because a hard device block would silently
lock out a couple sharing a laptop.

---

## Local development

Requires **Node 22 or newer**.

```bash
npm install
npm run dev          # http://localhost:3000
```

Other scripts:

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run build        # production build
npm run anthems      # (re)build the anthem clips — see below
npm run flags        # (re)fetch the flag SVGs — see below
```

Copy the example environment file and fill in a key:

```bash
cp .env.example .env.local
```

---

## Storage model

There is **no database**. The whole party is a single JSON document
(`{ version, assignments[], guests[], votes[] }` — `guests` holds every RSVP, including
the people who said no and therefore never got an assignment, and `votes` holds one
row per guest per category, keyed by `voter` + `category`) and `src/lib/store.ts` picks one of two drivers
automatically, based on whether `BLOB_READ_WRITE_TOKEN` is set:

| Driver | When                          | Where the data lives                              |
| ------ | ----------------------------- | ------------------------------------------------- |
| `file` | `BLOB_READ_WRITE_TOKEN` unset | `data/assignments.json` on local disk              |
| `blob` | `BLOB_READ_WRITE_TOKEN` set   | Vercel Blob (`festa-disfresses/assignments.json`)  |

`data/` is git-ignored — guest names, emails and IPs must never be committed.

### ⚠️ Warning: without a Blob store, Vercel loses every assignment

If you deploy to Vercel **without linking a Blob store**, the app falls back to
the `file` driver and writes to the serverless function's local filesystem.
That filesystem is **ephemeral**: it is thrown away on every deployment, every
cold start and every scale event. Guests will silently lose their countries,
and the same country will be handed out to several people.

The `/admin` dashboard shows the live driver in its header and prints a loud
amber banner whenever it is `file`, precisely so you notice this before the
party rather than during it.

**Fix (about a minute):**

1. Vercel dashboard → your project → **Storage**.
2. **Create Database** → **Blob** → give it a name → create.
3. **Connect** the store to this project (all environments).
4. **Redeploy.** `BLOB_READ_WRITE_TOKEN` is injected automatically — you never
   copy or paste it, and it must never be committed.
5. Open `/admin?key=…` and confirm the driver now reads `blob`.

---

## Environment variables

See `.env.example` for the annotated version.

| Variable                | Required              | What it does                                                                                                          |
| ----------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_KEY`             | Yes, for `/admin`     | Gates `GET /api/admin`. Unset ⇒ every admin request gets `401`.                                                        |
| `BLOB_READ_WRITE_TOKEN` | Recommended on Vercel | Injected by Vercel when a Blob store is linked. Selects the durable `blob` driver; absent ⇒ ephemeral `file` driver.    |
| `MAX_PER_IP`            | No — leave unset      | Hard cap on assignments per IP. Unset (default) = **no limit**. See the warning below.                                 |
| `REPARTIMENT_OVER`      | No — default `false`  | `true` closes the draw and turns `/` into the wall of all the countries. See "After the draw" below.                     |
| `IS_CONCURS`            | No — default `false`  | `true` turns `/` into the voting page for the public prize. Wins over `REPARTIMENT_OVER`.                                |
| `EMAIL_DNS_CHECK`       | No — leave unset      | Set to `off` to skip the MX check on claim. For local testing against made-up domains only.                            |

### ⚠️ `MAX_PER_IP` refuses real guests

Setting `MAX_PER_IP=1` makes `/api/claim` answer `429 { "error": "ip_limit" }`
once an IP has used up its quota.

Because guests register from home rather than all at once on the party WiFi,
this no longer locks out the entire guest list the way it once would have — but
it still refuses perfectly legitimate people: **housemates, couples and families
share one home IP**, and anyone claiming over mobile data sits behind
carrier-grade NAT with strangers. Each of them gets a `429` and no country.

Leave it unset. Use the **possibles duplicats** panel and the `compartida ×N` /
`mateix dispositiu ×N` badges in `/admin` to look at collisions yourself and
decide. There is deliberately no `MAX_PER_DEVICE`: a hard device block would
silently lock out a couple sharing a laptop.

---

## After the draw: the wall and the contest

Two flags decide what `/` is. Both are read on the server, per request, and both
need a restart (local) or a redeploy (Vercel) to change. Accepted values are
`true`, `1`, `yes`, `on`, `si` and `sí`, in any case; anything else, a typo
included, is off. The phase is `IS_CONCURS` first, then `REPARTIMENT_OVER`, then
the draw. `COUNT_DOWN` still wins over all of them.

| Flags                      | `/` shows                         | Endpoints                                                                    |
| -------------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| neither                    | the draw                          | `claim`, `precheck`, `rsvp`, `reroll`, `lookup` open; `login`, `vote` closed |
| `REPARTIMENT_OVER=true`    | the wall of countries             | the draw endpoints answer `410 repartiment_over`; `login` open               |
| `IS_CONCURS=true`          | the voting page                   | as above, and `vote` open                                                    |

`src/proxy.ts` does it with a rewrite, so the address stays `/` and the routes
`/repartiment` and `/concurs` redirect back to it. `src/lib/phase.ts` holds the
phase and the endpoint table that the proxy and the route handlers share.
`/api/admin` is never refused.

**Both pages are behind the login.** A visitor who has not logged in sees the
masthead and the login form and nothing else: no film, no wall, no viewer, no
list of countries. That is the page's doing, not the server's: the country data
and the flag files are still public assets, so it keeps out the curious, not
somebody who reads the bundle. A guest who signed up on this browser is logged
in quietly on load and goes straight on.

**The wall** shows every country's flag, with a few memes stuck among them
(Sparta, the Conguitos, Morocco and Kazakhstan; the list is `WALL_MEMES` in
`src/components/RepartimentApp.tsx`), and the guest's own country up front.
*Explora* opens the same viewer as the admin preview, one country at a time with
its song and meme, and shows nobody's name and no assignments. There is no
sign-up: a guest who is not on the list gets `no_match`, and one on the list
without a country (a *no* or a *maybe*) gets `no_country`, so neither gets in.

**The contest** is behind the same login, and votes in the four prizes on the
rules page (`src/data/categories.ts`, which the rules page reads too). A guest
has one vote per prize and can change or take it back. They cannot vote for
their own country, and cannot give the same country two prizes: to move it they
take the first vote back. Any country in the list can be voted for, not only
the ones somebody is wearing, so the page does not reveal which are taken.
There are two ways to choose, with a *Cerca* / *Explora* switch between them:
search the list and vote from it, or walk through the countries one by one in
the viewer and vote from there. The count is on `/admin`, one ranking per
prize, where a country nobody wears is marked *ningú el porta*. Votes stored
before there were prizes count as the public's.

**Login has no session.** The name and email are checked on every call, and the
browser remembers them in `localStorage` (`festa-disfresses:guest`) and sends
them again. The name is matched loosely: every word typed has to be a whole word
of the stored name, ignoring case and accents, so `marta` matches `Marta Puig`
but `Mart` does not. A wrong email and a wrong name give the same answer, so the
endpoint cannot be used to ask whether an address is on the list.

**Deleting a guest** in `/admin` also deletes their vote.

**The film.** In either phase, a guest who has just logged in gets
`public/intro/celebrate-our-differences.mp4` full screen (`IntroGate`), then it
lifts onto the page, which has been rendering behind it. On the wall, a guest
who has just typed their details lands on their own country once the film is
over. It shows every time until it has been watched to the end
or skipped once (`localStorage`, key `festa-disfresses:intro-seen`), and then
the page opens directly after the login. A *Torna a veure el vídeo* button on the page plays it
again, and `/?intro` forces it. It has a *Salta* button and stops on Esc.
Browsers refuse sound before the first tap, so it starts with sound where that
is allowed and muted, with an *Activa el so* button, where it is not; with
reduced motion set it waits behind a play button instead. A file that fails to
load does not count as watched. Swap the file to change the film; keep it 4:3
and small, since it is fetched before the page is shown.

## The admin page

`/admin` is a dense client-side ops view, in Catalan:

- stats: assigned / total, remaining countries, rerolls spent, **emails caught
  in a same-device collision**, duplicates, and the live storage driver;
- a **possibles duplicats** panel (only when there is something to show) listing
  each colliding group of emails — same-browser groups first and in red, same-IP
  groups after and in amber; click any email to filter the table to it;
- a table of every assignment — **guest name** (the host's main tracking field),
  country with its SVG flag, email, device id, IP, and relative + absolute
  timestamps;
- badges: `re-tirada` when a guest spent their reroll (with the previous country
  shown as `abans: …`), `duplicat` on an assignment made before the party was capped, a red
  `mateix dispositiu ×N` on same-browser collisions, and a secondary amber
  `compartida ×N` on shared IPs — both listing the other emails in their
  tooltip;
- a **phase** pill, and once the contest is on a **Vots** count and one ranking
  per prize;
- a grid of the countries still available;
- one filter box across guest names, emails, country names/codes, IPs and
  device ids;
- sorting by date or by guest name;
- a **Copia com a CSV** button that copies the (filtered) rows — nom, email,
  país, codi, ip, ip_compartida, rerolled, país_anterior, duplicat, data,
  dispositiu, mateix_dispositiu, mateixa_ip, bandera — to the clipboard, built
  in-page with no extra dependency. The collision columns are semicolon-joined
  email lists, and the emoji flag appears here and only here; the table itself
  renders the SVGs;
- **deleting**: an `Esborra` button on every row, and `Esborra-ho tot` in the
  header. Both go through a confirm dialog that names what is about to go; the
  whole-party wipe additionally requires typing `ESBORRA`, because there is one
  JSON document and no backups. Deleting a guest hands their country straight
  back to the pool;
- auto-refresh every 30 seconds, plus a manual refresh. It pauses while a
  confirm dialog is open, so the count you are agreeing to cannot change
  between reading it and pressing the button.

Set the key first:

```bash
# local
echo 'ADMIN_KEY=some-long-random-string' >> .env.local

# Vercel
vercel env add ADMIN_KEY production   # or via the dashboard, then redeploy
```

Then open `http://localhost:3000/admin` and type the key, or bookmark
`http://localhost:3000/admin?key=some-long-random-string`.

The key is compared in constant time server-side and is **remembered in
`localStorage`** so the host does not retype it on every visit. That is a
deliberate trade: anything able to run script on this origin can read it back,
which React-state-only storage prevented. `Surt` clears it, a key that stops
working is discarded on the spot, and rotating `ADMIN_KEY` invalidates whatever
is stored. Note
that passing it via `?key=` puts it in the URL (and therefore in browser history
and server access logs), so prefer typing it in on shared machines. If
`ADMIN_KEY` is not set, the endpoint refuses everything: the admin view is
closed by default, never open by default.

---

## Anthems

Each country has a short anthem clip at `public/anthems/<CODE>.mp3`. They are
**committed to the repo**, so a normal checkout or deploy needs nothing extra.

```bash
npm run anthems            # fetch only what is missing
npm run anthems -- --force # rebuild everything
```

The script (`scripts/fetch-anthems.mjs`) reads `anthem.source` from
`src/data/countries.ts`, downloads the recording from **Wikimedia Commons**,
cuts the first 45 seconds, fades it out and normalises the loudness with the
bundled `ffmpeg-static`. It requires Node ≥ 22 (it imports the TypeScript
country list natively) and is polite about Wikimedia's rate limits, so a full
rebuild takes a few minutes.

Per-file attribution — title, author, licence and source URL — is regenerated
into [`public/anthems/CREDITS.md`](public/anthems/CREDITS.md). Keep that file in
the repo: it is the licence compliance for the clips.

### Two countries ship without audio, on purpose

`anthem.source` is **optional**. Two countries have no clip:

- **Corea del Nord (`KP`)** — *Aegukka*
- **Mongòlia (`MN`)** — *Mongol Ulsyn töriin duulal*

Both anthems are still under copyright and no freely-licensed recording exists
on Wikimedia Commons, so there is nothing we can legally ship. They intentionally
carry a `title` with no `source`; `npm run anthems` skips them and the player
degrades gracefully to showing just the anthem title. Do not "fix" this by
dropping in a random YouTube rip.

---

## Editing the country list

Everything about a country lives in `src/data/countries.ts`:

```ts
{
  code: "BR",                        // stable identity — see the warning below
  name: "Brasil",
  flag: "🇧🇷",                        // plain-text contexts only (CSV), never the DOM
  flagImage: "/flags/BR.svg",        // always set: the 4:3 SVG actually rendered
  colors: ["#009B3A", "#FFDF00"],    // two flag colours for the reveal gradient
  anthem: { title: "…", source: "…" },  // `source` = Wikimedia Commons file name, optional
}
```

### Flags are SVGs, never emoji

Every country renders from a local 4:3 SVG at `public/flags/<CODE>.svg`, pointed
at by `flagImage` — which is **always set**, for all 44 countries. Render it
unconditionally:

```tsx
<img src={country.flagImage} alt={country.name} />
```

Emoji flags are deliberately **not** rendered in the UI. They are drawn by the
platform font, so the same flag looks different on iOS, Android and Windows, and
several we need have no emoji at all — Catalonia most obviously. One SVG set
makes all forty look like siblings everywhere. The `flag` emoji field is kept in
the data purely for plain-text contexts, such as the admin CSV export.

The flags come from [flag-icons](https://github.com/lipis/flag-icons) (**MIT**)
and are committed to the repo. Refetch them with:

```bash
npm run flags              # only what is missing
npm run flags -- --force   # refetch everything
```

`scripts/fetch-flags.mjs` writes the SVGs and regenerates
[`public/flags/CREDITS.md`](public/flags/CREDITS.md) with the licence and
version. Keep that file in the repo.

### ⚠️ `code` is the stored identity — never change it after the party starts

Assignments store the **country code**, not the name. Renaming a country's
display name is safe. Changing, reordering or deleting a `code` is not: any
guest holding that code loses their country. The app copes by silently
reassigning them a new one, which is a fairly rude surprise on the day.

- Adding a country: safe at any time — it simply joins the pool.
- Removing a country: safe only while nobody holds it.
- Renaming a `code`: treat as forbidden once the first email has been claimed.

After adding or changing an `anthem.source`, run `npm run anthems` and commit the
new mp3 together with the updated `CREDITS.md`.

---

## The logo

**El Mundialet** — a trophy with a bouquet of flags bursting out of the bowl,
over the wordmark. The type is the page's own poster face with the
magenta-then-ink hard shadow from `.poster-title`; in `MUNDIALET` the `-ET` is
set in gold, because the diminutive is the joke.

| File                        | Use                                                          |
| --------------------------- | ------------------------------------------------------------ |
| `public/logo.svg`           | Stacked poster lockup, transparent background.                |
| `public/logo-horizontal.svg`| Cup beside the type. Use this in a header — see below.        |
| `public/logo-mark.svg`      | 512 square tile, cup only. WhatsApp and GitHub avatars.       |
| `public/logo-banner.svg`    | 1200×630 poster. This README, link previews.                  |
| `src/app/icon.svg`          | Favicon. Next serves it at `/icon.svg`.                       |
| `public/logo-cup.svg`       | Trophy alone, transparent. Used on the gate above the title.  |
| `public/logo-mark-512.png`  | 512×512 raster of the mark — GitHub repo/org avatar.          |
| `public/logo-social-1280x640.png` | 1280×640 raster — GitHub Settings → Social preview.     |

The five flags are **CO · JP · CT · SE · JM**, inlined from `public/flags`
(flag-icons, MIT). The Senyera is the centre and tallest. The other four were
picked for a different graphic device each — bands, disc, cross, saltire — so
they stay distinguishable at pennant size, and three of the five carry gold,
which is what ties them to the cup. Each gets the same hairline paper ring
`.flag-face` uses, so pale flags keep an edge against the aubergine.

Four things are deliberate:

- **The letterforms are outlines, not text.** A favicon and a chat avatar load
  no `@font-face`, so a `<text>` element would fall back to Arial in exactly
  the places the logo matters most. The paths are [Bungee](https://djr.com/bungee/)
  (SIL OFL 1.1) converted to outlines; the attribution is a comment in each file.
- **The flags are inlined, not `<img>`.** Same reason: an avatar or a favicon
  cannot fetch a second asset, so each file has to stand alone. Flag ids are
  namespaced per country (`CT_…`), which is also why two of these SVGs can be
  pasted inline into one HTML page without clipping each other.
- **The mark fits inside a centred circle.** WhatsApp and GitHub crop avatars
  round, so the whole trophy stays within the inscribed circle of the square.
- **Use the horizontal lockup in a header.** In the stacked one the cup takes
  most of the height, so at a 44px header the wordmark lands around 7px.
  `logo-horizontal.svg` sets the cup beside the type instead and stays legible.
  `icon.svg` is likewise a reduction, not a shrink: three flags instead of five,
  fatter poles, no drop shadow — the three things that turn to dirt at 16px.

---

## Deploying to Vercel

1. Push the repo to GitHub and import it at
   [vercel.com/new](https://vercel.com/new). The framework is auto-detected —
   no build settings to fill in.
2. **Storage → Blob → create a store → connect it to the project.** Do not skip
   this; see the warning above.
3. Add `ADMIN_KEY` under **Settings → Environment Variables** (production, and
   preview if you want the dashboard there too). Leave `MAX_PER_IP` unset.
4. Deploy. `vercel.json` pins the region to `cdg1` (Paris — closest to
   Catalonia) and serves `/anthems/*` with a one-year immutable cache.
5. Verify: claim a country from `/`, then open `/admin` and check that the
   driver reads `blob` and your assignment is listed.

Deploys are handled by Vercel's Git integration. GitHub Actions
(`.github/workflows/ci.yml`) only runs typecheck, lint and build on every push
and pull request, so a broken build is caught before it ships.
