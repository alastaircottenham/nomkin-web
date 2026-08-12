# nomkin.app

The marketing site for [Nomkin](https://nomkin.app) — a landing page and the privacy policy that
App Store Connect and the Google Play Console link to.

Plain static HTML. No build step, no framework, no dependencies. Open `index.html` in a browser and
that is the site.

```
index.html          the landing page — the app's first screen, plus "coming soon"
privacy/index.html  the privacy policy submitted to Apple and Google
styles.css          both pages
assets/             the dog, and the app icon (used as the favicon)
vercel.json         security headers and the canonical-host redirect
```

## Deploying to Vercel

1. Push this folder to its own GitHub repository.
2. In Vercel, **Add New → Project** and import it.
3. Framework preset: **Other**. Leave the build command and output directory **empty** — Vercel
   serves the repository root as static files.
4. **Settings → Domains**, add `nomkin.app` and `www.nomkin.app`, and set `nomkin.app` as primary.
   Point the registrar's records at Vercel as it instructs.

The URLs the stores need are then:

- Privacy policy: `https://nomkin.app/privacy/`
- Marketing URL: `https://nomkin.app/`

## Before submitting to Apple

- The privacy policy URL must be **publicly reachable with no login and no redirect chain**. Load
  `https://nomkin.app/privacy/` in a private window and confirm it renders before pasting it into
  App Store Connect → App Information → Privacy Policy URL.
- `hello@nomkin.app` must actually receive mail. Set up forwarding at the registrar (or with
  Cloudflare Email Routing / Fastmail / iCloud+ custom domain) — the policy names it as the contact
  and reviewers do sometimes write to it.
- The policy is one half of the job. The other half is the **App Privacy** questionnaire in App
  Store Connect (the nutrition label) and the **privacy manifest** in the app. Nomkin's honest
  answer to the questionnaire is **"Data Not Collected"** across the board: nothing is transmitted
  off the device except a barcode or a search term, which is not linked to any user or device.
- Google Play needs the same URL in **Play Console → Policy → App content → Privacy policy**, and
  Health Connect additionally requires the policy to be reachable **from inside the app** — which
  is what `scripts/buildPrivacy.mjs` in the app repo handles, via its own offline copy.

## Before launch day

The two store badges on the landing page are **recreations, not the official artwork**, and they
are deliberately not links. Apple and Google both permit their badges only when they point at a
live listing. When Nomkin ships:

1. Download the official artwork —
   [Apple](https://developer.apple.com/app-store/marketing/guidelines/) ("Download on the App
   Store") and [Google](https://play.google.com/intl/en_us/badges/) ("Get it on Google Play").
2. Replace the two inline `<svg>` blocks in `index.html` with them.
3. Wrap each in an `<a>` pointing at the real listing.
4. Delete the `.coming-soon` pill.

## Colour

Every value in `styles.css` is copied from `src/design/tokens.css` in the app repo, which is the
source of truth. Nothing here holds the two together — if a token changes there, change it here by
hand. The token names are kept identical so the mapping is obvious.
