# nomkin.app

The marketing site for [Nomkin](https://nomkin.app) — a landing page, the three legal pages and the
support page that App Store Connect and the Google Play Console link to, in seven languages.

Plain static HTML, hand-written, with no framework and no dependencies. The English pages *are* the
site: open `index.html` in a browser and there it is. The other six languages are generated from
those pages by `build.mjs`, which is the whole of the build step and needs nothing installed.

```
index.html                 the landing page — the app's first screen, plus "coming soon"
privacy/index.html         the privacy policy submitted to Apple and Google
terms/index.html           the terms of use, which double as the Apple EULA
delete-account/index.html  the account/data deletion steps Play asks for by URL
support/index.html         the support URL App Store Connect asks for — one address, and what to say
puzzles/index.html         the invitation to send in a drawing, and the embedded Tally form
puzzles/terms/index.html   the submission terms, versioned separately from /terms/
puzzles/thanks/index.html  where Tally redirects after a submission (noindex)
styles.css                 every page
assets/                    the dog, and the app icon (used as the favicon)
api/feedback.js            the feedback relay — the one executable thing here
vercel.json                security headers and the canonical-host redirect
build.mjs                  writes de/ es/ fr/ pt-br/ ja/ ko/ from the pages above
i18n/                      the translations, and the list of languages and pages
sitemap.xml                generated, with the hreflang set for all seven languages
```

**`api/feedback.js` is the only non-static file on the site**, and it is the reason this repo is no
longer purely a brochure: Settings' Send feedback form in the app posts to it, and it turns the post
into an email. It has its own section below. Everything in the tree above it remains plain HTML with
no build step.

Every heading on the privacy page carries an `id`, so a reviewer or a store form can deep-link
straight at a section — `/privacy/#account`, `/privacy/#usage`, `/privacy/#retention`,
`/privacy/#delete`.

## Deploying to Vercel

1. Push this folder to its own GitHub repository.
2. In Vercel, **Add New → Project** and import it.
3. Framework preset: **Other**. Everything else comes from `vercel.json` — leave the build command
   and output directory **empty in the dashboard**, because a value typed there overrides the file
   and the two will disagree silently.

   `vercel.json` sets `buildCommand` to `npm run build`, which runs `build.mjs` and writes the six
   translated trees, and `outputDirectory` to `"."`, which is the site. **That second line is not
   optional.** Vercel serves the repository root only while no build command is set; the moment one
   is, it starts looking for a directory called `public` and fails the deploy without it. There is
   no `node_modules` to install — the script has no dependencies — and `api/` is still picked up
   from the root, so the feedback relay is unaffected.
4. **Settings → Domains**, add `nomkin.app` and `www.nomkin.app`. Point the registrar's records at
   Vercel as it instructs.
5. **Settings → Environment Variables**, add `RESEND_API_KEY` for the feedback relay. See
   [The feedback relay](#the-feedback-relay) below — without it the relay answers 503 and the app
   falls back to the user's own email app.

**As deployed today, `www.nomkin.app` is the primary and the apex 308-redirects to it.** That is
the opposite of what this file used to say, and it is worth knowing rather than discovering:

- The app posts feedback to `https://www.nomkin.app/api/feedback/`, on the canonical host, because
  a redirected CORS preflight is not followed by any browser.
- The store URLs below are written on the apex and therefore **each begin with a redirect**. Apple
  asks for a privacy policy URL "publicly reachable with no login and no redirect chain", and a
  single 308 to `www` has never been the thing that fails a review — but if it is ever worth
  removing, the fix is either to paste the `www` URLs into both consoles or to make the apex
  primary in Vercel and let `www` redirect the other way. Pick one deliberately; do not leave the
  two halves disagreeing.

The URLs the stores need are then:

- Privacy policy: `https://nomkin.app/privacy/`
- Marketing URL: `https://nomkin.app/`
- Terms of use / EULA: `https://nomkin.app/terms/`
- Account deletion (Play): `https://nomkin.app/delete-account/`
- Support URL: `https://nomkin.app/support/`

The app links out to one more, from Settings and from the puzzle screen:

- Puzzle submissions: `https://nomkin.app/puzzles/`

## Seven languages

English, German, Spanish, French, Brazilian Portuguese, Japanese and Korean. Every page exists in
every language, pre-rendered as a real static file at `/de/privacy/`, `/ja/`, and so on — nothing is
fetched, nothing is swapped in by script, and a German reader never sees a flash of English.

```
npm run build     write de/ es/ fr/ pt-br/ ja/ ko/ and sitemap.xml
npm run dev       the same, then serve the whole thing on :4321
npm run sync      re-write the two generated blocks in the English pages
```

### How a page gets translated

The English page is the source and the only file you edit for structure. It carries markers around
the parts of it that are words:

```html
<!--i18n:doc-->
  <h1>Privacy policy</h1>
  ...
<!--/i18n:doc-->
```

`i18n/<locale>/<page>.html` holds the same blocks in that language, and `build.mjs` swaps one for
the other. `i18n/<locale>/meta.json` holds the `<title>`, the meta description, the Open Graph
strings, and a short list of literal attribute substitutions for the few translatable attributes
that fall outside any block — the Tally iframe's `title`, mostly.

Everything else the build does per language: sets `<html lang>`, points the canonical and `og:url`
at the locale URL, prefixes every internal link (`/privacy/#usage` becomes `/de/privacy/#usage`),
regenerates the language selector with the current language marked, and rewrites `sitemap.xml`.

**To change wording on a page, edit the English page and then the six partials.** The build will not
notice that a paragraph now says something different, but it will notice most of the ways a
translation can go structurally wrong, and `npm run build` fails on any of them:

- a block the English page has and the translation does not, or the reverse;
- an `id` the English page has and the translation lost — which would break `#usage` and the five
  other fragments the documents link to each other by;
- an external or `mailto:` link that went missing in translation;
- a different number of headings, paragraphs, list items or table cells than the English page has,
  which is how a dropped paragraph or an unclosed tag shows up.

### Adding a language

Add it to `LOCALES` in `i18n/locales.mjs`, add its name to `LANGBAR_LABEL` in `build.mjs`, run
`npm run sync` to refresh the selector and the `hreflang` set in the English pages, then write
`i18n/<locale>/`. Until those files exist the language still builds — as English, at its own URLs,
with a warning per page — so the selector never points at a 404.

### Which language a reader gets

A small script in the `<head>` of every page, in this order:

1. a language picked from the selector at the foot of the page, remembered in `localStorage`;
2. `?lang=de` in the URL, which also gets remembered — the way to force a language past a browser
   that says otherwise, and the way to link somebody straight at one;
3. `navigator.languages`, the browser's own list;
4. English, by doing nothing.

Only the English pages guess. `build.mjs` rewrites the script's `data-lang` for the others, and a
reader already on `/ja/` has asked for Japanese, so there is nothing left to guess at. Both
Portugueses land on the Brazilian translation.

### What is not translated

- **The app itself**, which is English. Every page that gives steps to follow inside Nomkin prints
  the button names in English, the way the phone prints them, and says so in a note under the
  heading. If the app is ever localised, those names come out of the `<strong>` runs and the note
  comes off with them.
- **The Tally form** on `/puzzles/`, whose questions live in Tally rather than here. The card says
  so above the frame, and invites people to answer in their own language.
- **The store badges' brand names.** Apple and Google both keep "App Store" and "Google Play" in
  latin on their own localised badges, so only the small line above them is translated. Its
  `textLength` is re-measured per language — the attribute pins the badge's shape on a machine
  without the fonts, and left at the English value it would stretch four Korean characters across
  eighteen English ones.

### The legal pages, translated

The three legal documents are translated in full, and each carries a line under its heading saying
that it is a translation and that the English is the reference version if the two ever disagree,
without touching any right that cannot be waived by agreement. That is the ordinary way to publish
translated terms, and it is worth keeping: a paragraph that drifts in translation should not be able
to become the operative one.

## The puzzle submission form

`/puzzles/` embeds a [Tally](https://tally.so) form, form id `D4RQNN`, as an iframe plus Tally's
own loader script. That script is the only third party on the site. `vercel.json` sets no
Content-Security-Policy, so nothing needed an allowlist entry — **if a CSP is ever added,
`tally.so` has to be on it or the form silently disappears.**

Two things about the form live in Tally rather than here, and both will be invisible from this repo:

- **The completion redirect points at `/puzzles/thanks/`.** Tally's free plan has no custom
  thank-you screen. That page must stay deployed, or a successful submission lands on a 404.
- **The email notification** goes to `hello@nomkin.app`. There is deliberately no `puzzles@`
  address: every page here points submissions, credit changes and withdrawal requests at the one
  inbox the rest of the site already uses.

The terms the form's checkbox names are **versioned**, and the version is written into the checkbox
label itself so that the wording somebody agreed to is stored with their response. When they change:
publish the new version, leave the old one online at a stable URL, and update the label in Tally.

**The site no longer offers a cutting template**, and `/puzzles/` no longer explains how a picture
is divided. Anybody who plays the app has already watched one come apart into five, so the page
says what a drawing has to be and leaves the mechanics to the app itself.

The overlay still exists as an internal tool for vetting a submission against the real seams:
`node scripts/makePuzzleTemplate.mjs` in the **app** repo, which generates it from
`src/features/coins/puzzleShapes.ts` so it cannot drift from the actual cutter. Copy it back here if
it is ever published again, and never redraw it by hand.

## The feedback relay

`api/feedback.js` receives the Send feedback form from inside the app and turns it into an email to
`hello@nomkin.app`. It exists for one reason: an API key shipped inside a phone is a key everybody
has, so the key lives here and the app has no copy of it. The app repo's `DECISIONS.md`, under
"Send feedback, the second time", has the full reasoning and what it cost.

**It is Edge runtime with no dependencies, and it must stay that way.** This repo has no
`package.json`, and adding one flips Vercel from "static site" to "Node project" and starts running
installs on every deploy of what is otherwise a handful of HTML files. Resend has a Node SDK; it is
not needed, because the integration is one `POST` to `api.resend.com` with a JSON body.

### Setting it up in Vercel

**Settings → Environment Variables**, on this project:

| Name             | Value                        | Environments          |
| ---------------- | ---------------------------- | --------------------- |
| `RESEND_API_KEY` | the key from Resend          | Production, Preview    |
| `FEEDBACK_TO`    | optional; overrides the destination | Production, Preview |

`FEEDBACK_TO` defaults **in code** to `hello@nomkin.app`, so a fresh clone works without it. It
exists so the destination can be repointed without a deploy.

Without `RESEND_API_KEY` the function answers **503**, which the app reads as "not sent" and falls
back to the user's own email app. A deploy made before the key is set degrades rather than breaks,
which is deliberate.

### Setting it up in Resend

1. **Add a domain**, and add `mail.nomkin.app` rather than `nomkin.app`. The apex is where mail is
   *received*, at Proton, and it must not be touched. See the DNS table below.
2. Put the records Resend gives you into Cloudflare, and wait for it to report the domain verified.
   Nothing is delivered until it does, and the relay answers 502 in the meantime.
3. **Create an API key** with **Sending access** only. It does not need full access, and a sending
   key is the one to paste into Vercel.
4. The `from` address in `api/feedback.js` is `feedback@mail.nomkin.app`. Nothing receives mail
   there and nothing needs to: replies go to the `reply_to`, which is whatever address the person
   typed into the form. If the sending subdomain is ever renamed, that constant changes with it.

The free tier is 100 emails a day and 3,000 a month. **That cap is the real rate limit on this
endpoint**, and it fails closed: past it Resend refuses, the relay answers 502, and the app offers
the email composer instead.

### The DNS, given Cloudflare in front and Proton behind

**Nothing about the apex changes.** `nomkin.app` receives its mail at Proton and carries Proton's
MX, SPF and DKIM records, and none of them are edited. Resend is verified against a separate
sending subdomain instead, which is its own recommended shape and which is why there is no
conflict: a domain may hold only one SPF record **per name**, and `mail.nomkin.app` is a different
name from `nomkin.app`.

Four records in Cloudflare, all **DNS only** (grey cloud, though MX and TXT cannot be proxied
anyway). Take the exact values from Resend's console rather than typing them:

| Name                                | Type   | Value                                  | Note                                                                                              |
| ----------------------------------- | ------ | -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `mail.nomkin.app`                   | MX(10) | `feedback-smtp.<region>.amazonses.com` | **Bounces and complaints only.** Mail to `hello@nomkin.app` is untouched and still goes to Proton |
| `mail.nomkin.app`                   | TXT    | `v=spf1 include:amazonses.com ~all`    | The subdomain's own SPF                                                                           |
| `resend._domainkey.mail.nomkin.app` | TXT    | the 2048-bit DKIM key Resend generates |                                                                                                   |
| `_dmarc.mail.nomkin.app`            | TXT    | **optional**                           | Only for `rua=` reports on the subdomain separately from the apex                                 |

**DMARC already passes without the fourth row.** A receiver that finds no `_dmarc.mail.nomkin.app`
falls back to the organizational domain's `_dmarc.nomkin.app`, so its `p=quarantine` applies, and
alignment holds because the `From:` domain, the DKIM `d=` and the SPF Return-Path are all
`mail.nomkin.app` — strict alignment rather than merely relaxed. **Do not add
`include:amazonses.com` to the apex SPF.** It is not needed, and editing the record the actual inbox
depends on, to fix a problem it does not have, is how mail breaks.

Afterwards, confirm the apex is undisturbed: `dig MX nomkin.app` must still return both Proton
hosts and `dig TXT nomkin.app` must still return Proton's SPF unchanged.

Deliverability is a smaller worry here than for bulk mail: one message at a time, from a domain we
control, to a mailbox we control. Belt and braces is a Proton filter on the `Nomkin bug` and
`Nomkin idea` subject prefixes, marking them never-spam.

### Two things about the URL that will silently break it

**The canonical host is `www.nomkin.app`, not the apex.** The apex 308-redirects to `www`, so the
app posts to `https://www.nomkin.app/api/feedback/`. That constant is `FEEDBACK_RELAY_URL` in
`src/platform/feedbackRelay.ts` in the app repo.

**And the trailing slash is load-bearing.** `vercel.json` sets `trailingSlash: true`, and
`/api/feedback` really does 308 to `/api/feedback/` — verified with `curl` before the function
existed. A redirected POST would survive, but a redirected **CORS preflight is not followed by any
browser**, so the slash-less form would work in every desktop test and fail on every phone. Hence
both the trailing slash in the app's URL and the `rewrites` entry in `vercel.json` that maps
`/api/feedback/` onto the function.

After deploying, the check that settles it:

```
curl -i -X OPTIONS https://www.nomkin.app/api/feedback/ \
  -H 'Origin: capacitor://localhost' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

It must answer **204 with the `Access-Control-Allow-*` headers and no `location`**. A 308 there is
the failure this section exists to prevent.

### What limits it, honestly

Written out because the privacy policy is not allowed to imply more than is here:

| Mechanism                     | Real?                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| Resend's free tier, 100 a day | **Yes, and it fails closed.** Past it Resend refuses, the relay 502s, the app offers the composer         |
| Body ceiling, 3 MB            | **Yes**, but it is checked on the body's real length after reading it, not on `content-length` before. See below |
| Vercel's own payload limit    | **Yes**, and it is the one that genuinely stops a huge upload: about 4.5 MB, refused before this code runs |
| Per-address limiter           | **No.** Module memory in one warm instance: a cold start forgets it and two instances do not share it    |
| Honeypot field                | **Barely.** There is no HTML form to scrape. It costs one line and stays                                 |
| A shared secret in the app    | **Deliberately absent.** A secret inside a phone is the thing this whole design exists to avoid          |

The per-address limiter reads `cf-connecting-ip` first, because this site is proxied through
Cloudflare in front of Vercel and `x-forwarded-for` at the edge is Cloudflare's own chain.

**The body ceiling was written the other way round first, and the deployed endpoint proved it
wrong.** It used to read `content-length` and return 413 *before* touching the body, on the
reasoning that refusing a large upload should not cost what accepting one costs. In production that
turned every oversized request into a 500: returning from an Edge function while the client is
still uploading abandons the request stream, and the runtime reports `FUNCTION_INVOCATION_FAILED`.
It was measured rather than guessed — 2,999,000 bytes answered 400 and 3,010,000 answered 500,
landing exactly on the constant, which is what told a code bug apart from a platform limit. The
saving was mostly imaginary anyway: the bytes reach the edge whether or not the function reads
them, so a pre-read check avoids parsing them, not receiving them. Reading the body once and
checking its real length also closes a smaller hole, since `content-length` is a claim and
`raw.length` is a fact.

If the endpoint is ever found and hammered, the lever is Vercel's **Attack Challenge Mode**.

### Testing it without deploying

`npx vercel dev` in this folder serves the function on `http://localhost:3000`. Put
`RESEND_API_KEY` in a local `.env` (which `.gitignore` must cover), then in the app's dev console:

```js
localStorage.setItem('nomkin.web.feedback.live', 'on');
localStorage.setItem('nomkin.web.feedback.url', 'http://localhost:3000/api/feedback');
```

That sends a real message, with its attachment, end to end from Windows. Without those two keys the
app's web shim prints what it would have sent and posts nothing, which is what stops a dev server
reloading all afternoon from filling the inbox and spending the daily quota on the word "test".

The relay has **no automated test**. This repo has no test runner and should not grow one; its
validation is short enough to read, and its real check is a curl against `vercel dev`. Recorded here
rather than left to look like an oversight.

## Keeping this in step with the app

The hosted policy and the one inside the app are **two renderings of the same promises** and they
drift silently. The in-app copy is generated by `scripts/buildPrivacy.mjs` from
`src/features/settings/policy.json` in the app repo; this page is the long version, written by
hand. Neither is generated from the other.

So: any change to what the app does with data means editing **both** — `policy.json` there, and
`privacy/index.html` here — and the dates at the top of both. The live page went stale exactly once
this way, still claiming "no account, no server of ours" after the backup account shipped, which is
precisely the contradiction a store reviewer cross-checks against the data-safety form.

`policy.test.ts` in the app repo walks `USAGE_FIELDS` and fails the build if the in-app copy has no
word for a field the daily usage note carries. It now walks `FEEDBACK_FIELDS` the same way, for
what a feedback report carries. Nothing does that for this page, so the field table under
`/privacy/#usage` and the list under `/privacy/#feedback` both have to be checked by hand against
`src/core/usage.ts` and `src/core/feedback.ts` whenever either changes.

The same edit now lands in seven places rather than one. `npm run build` will tell you if a
translated table has gained or lost a row against the English one, which catches a row added here
and forgotten there — but nothing can tell you that a row's *wording* went stale in German. Change
the English page and the six partials in the same commit, or the drift this section is about
happens six times over instead of once.

## Before submitting to Apple

- The privacy policy URL must be **publicly reachable with no login and no redirect chain**. Load
  `https://nomkin.app/privacy/` in a private window and confirm it renders before pasting it into
  App Store Connect → App Information → Privacy Policy URL.
- `hello@nomkin.app` must actually receive mail. Set up forwarding at the registrar (or with
  Cloudflare Email Routing / Fastmail / iCloud+ custom domain) — the policy names it as the contact
  and reviewers do sometimes write to it.
- `https://nomkin.app/terms/` goes in App Store Connect → App Information → **Licence Agreement**,
  as a custom EULA. Its "If you are on an iPhone" section carries Apple's required minimum terms.
  Leaving the field empty means Apple's standard licence applies instead, which says nothing about
  the account, the coins or the fact that Nomkin is not medical advice.
- `https://nomkin.app/support/` goes in App Store Connect → App Information → **Support URL**,
  which is a required field. Apple wants a page that offers a real way to get help, so the address
  on it has to be one that answers — the same `hello@nomkin.app` as above.
- The policy is one half of the job. The other half is the **App Privacy** questionnaire in App
  Store Connect (the nutrition label) and the **privacy manifest** in the app. The backup account
  and the daily usage note changed the honest answer: it is no longer "Data Not Collected" across
  the board. See the table below.
- Google Play needs the same URL in **Play Console → Policy → App content → Privacy policy**, and
  Health Connect additionally requires the policy to be reachable **from inside the app** — which
  is what `scripts/buildPrivacy.mjs` in the app repo handles, via its own offline copy.
- Play also wants `https://nomkin.app/delete-account/` in **Play Console → Policy → App content →
  Data deletion**, and the same page linked from somewhere findable on the site — which is why it
  is in the site footer.

## The store data forms, since the account and the usage note shipped

The rule that decides every row: **only what leaves the device counts as collected**. Everything
Nomkin does locally is not collected. Three things leave, and they are answered differently:

1. **The backup account**, only if the user asks for one.
2. **The anonymous daily usage note**, on by default and switchable off.
3. **An ad request**, only if the user switches on videos for coins.
4. **A feedback report**, only if the user fills the form in and presses send.

Rows 1, 2 and 4 are **Optional**, **Shared: No** (Firebase and Resend are processors, not third
parties). Row 1 is purpose **App functionality**; row 2 is purpose **Analytics**; row 4 is purpose
**App functionality**, specifically customer support.

| Data type                                                                          | Collected | Where from                                                    |
| ---------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------- |
| Personal info → Email address                                                      | Yes       | Firebase Auth for the backup account, **and the feedback form's reply-to** |
| Personal info → User IDs                                                           | Yes       | the Firebase uid, which is the Firestore document key          |
| Health & fitness → Health info                                                     | Yes       | profile, weight logs, food entries in the backup copy          |
| Health & fitness → Fitness info                                                    | Yes       | the day's step total, which travels inside the copy            |
| Financial info → Purchase history                                                  | Yes       | the coin ledger is part of the export, so it uploads too       |
| App activity → App interactions                                                    | Yes       | the daily usage note: opens, screens, logging counts           |
| **Messages → Other in-app messages**                                               | **Yes**   | **what somebody typed into the feedback box**                  |
| **Photos and videos → Photos**                                                     | **Yes**   | **only a screenshot somebody chose to attach to feedback**     |
| Location, contacts, files, calendar, crash logs, diagnostics, advertising ID       | No        | —                                                              |

**Photos and Messages moved off the "No" line, and only the feedback form moved them.** Nomkin has
no photo-library access: the form uses the phone's own picker, which hands over the one file the
user chose. "Collected" is about leaving the device, though, not about how it was obtained, so both
are Yes and both are Optional.

Apple's side of those two rows is **User Content → Photos or Videos** and **User Content → Other
User Content**, plus **Contact Info → Email Address** for the reply-to. All three are purpose **App
Functionality**, **Not Used for Tracking**, and — unlike everything else in this table —
**Linked to You**. That is not pessimism: an email address identifies a person and the message is
attached to it, and Apple's question is association with an identity rather than profile-building.
They are the first Linked rows in either listing.

**The health categories are unaffected and must stay that way.** Nothing from HealthKit or Health
Connect can reach a feedback report: its six fields are enumerated in `src/core/feedback.ts` in the
app repo, and three separate tests fail the build if a seventh appears.

Apple's side of the same answers: **Usage Data → Product Interaction**, purpose **Analytics**,
**Not Linked to You**, **Not Used for Tracking**. "Not linked" is the honest answer and not a
convenient one — there is no identifier in a note at all, which `firestore.usage.rules` in the app
repo enforces field by field.

Three of those are easy to get wrong. **Steps** are collected now, not "not collected" — the old
posture predates the backup. **Purchase history** is collected because the coin ledger is part of
`NomkinExport`, and the policy already admits the store "is told which pack was bought". **App
activity** is collected because of the usage note, even though nothing in it identifies anyone;
"collected" is about leaving the device, not about being identifiable.

Play's "Does your app provide a way to delete data without deleting the account?" is **No**. The
shim only has `deleteAccount(password)`; there is no control that removes the uploaded copy while
keeping the account, and the in-app "delete everything" wipes the phone, which is not data we hold.
That question is optional and carries no penalty — claiming yes with no such control is the risk.

For the usage note, "can users request deletion?" is honestly **no**, for the opposite reason: no
identifier means nothing to look up. The control that exists is the switch, and the policy says so
in those words rather than implying a request would be honoured.

For **feedback**, the same question is honestly **yes** — a message has an address attached, so it
can be found and deleted on request, and `/privacy/#feedback` says so in those words. That is the
opposite of the note's answer, and the two sitting side by side is correct rather than
inconsistent.

Third-party advertising rows (**Identifiers · Usage Data · Diagnostics** against AdMob) are a
separate matter and belong to the rewarded-video feature, not to any of the above.

## Before launch day

The two store badges on the landing page are **recreations, not the official artwork**, and they
are deliberately not links. Apple and Google both permit their badges only when they point at a
live listing. When Nomkin ships:

1. Download the official artwork —
   [Apple](https://developer.apple.com/app-store/marketing/guidelines/) ("Download on the App
   Store") and [Google](https://play.google.com/intl/en_us/badges/) ("Get it on Google Play").
2. Replace the two inline `<svg>` blocks in `index.html` with them. The official artwork is
   published per language, so take the six other locales' badges too and put each in the
   `badge-apple` / `badge-google` block of `i18n/<locale>/index.html`, replacing the recreated
   `<text>` pair. That is also the moment the `textLength` note in those files stops applying.
3. Wrap each in an `<a>` pointing at the real listing.
4. Delete the `.coming-soon` pill — and its translation in all six `i18n/<locale>/index.html`.

## Colour

Every value in `styles.css` is copied from `src/design/tokens.css` in the app repo, which is the
source of truth. Nothing here holds the two together — if a token changes there, change it here by
hand. The token names are kept identical so the mapping is obvious.
