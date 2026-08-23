/**
 * The feedback relay.
 *
 * Settings' Send feedback form in the Nomkin app posts here; this turns the post into an email to
 * `hello@nomkin.app` and answers with one bit the app can act on. It exists for exactly one
 * reason: the mail provider's API key cannot ship inside a phone, because a key inside a phone is
 * a key everybody has. So it lives on this function as an environment variable and the app has no
 * copy of it.
 *
 * This is the only executable thing on an otherwise entirely static site. See `README.md`,
 * "The feedback relay", for the environment variable and the four DNS records it needs, and the
 * app repo's `DECISIONS.md`, "Send feedback, the second time", for why it exists at all.
 *
 * ## Edge runtime, and no dependencies
 *
 * This repo has no `package.json` and must not grow one: adding one flips Vercel from "static
 * site" to "Node project" and starts running installs on every deploy of what is otherwise a
 * handful of HTML files. The Edge runtime is ESM regardless, and has `fetch`, `Request`,
 * `Response` and `atob` built in. Resend has a Node SDK; it is not needed, because the whole
 * integration is one POST with a JSON body.
 *
 * The one thing Edge costs is `Buffer`, so an attachment's real size is worked out from the length
 * of its base64 rather than by decoding it. `shrinkImage.ts` in the app does the same sum on the
 * same string, which is what makes the two ceilings agree.
 *
 * ## What actually limits this, and what does not
 *
 * Said plainly, because the privacy policy is not allowed to imply more than is here:
 *
 *   - **Resend's own free tier is the real cap and it fails closed.** A hundred a day. Past it
 *     Resend refuses, this answers 502, and the app offers the user's own email app instead.
 *     Unlike a limiter of ours, it cannot be wrong.
 *   - **The body ceiling** refuses anything over 3 MB with a 413, and Vercel's own platform limit
 *     refuses anything over about 4.5 MB before this code runs at all. The ceiling is checked
 *     against the body's real length rather than its declared one; the handler says why.
 *   - **The per-address limiter below is a speed bump and nothing more.** It lives in the memory of
 *     one warm instance, so a cold start forgets it and two instances do not share it. It is here
 *     because it is nearly free, not because it is a control.
 *   - **The honeypot catches only the laziest replay.** There is no HTML form to scrape, so this is
 *     close to worthless; it costs one line and stays.
 *   - **There is deliberately no shared secret** in the app. A secret shipped inside a phone is the
 *     exact thing this whole design exists to avoid, and pretending otherwise would be worse than
 *     having none.
 *
 * If it is ever found and hammered, the lever is Vercel's Attack Challenge Mode.
 */

export const config = { runtime: 'edge' };

/** Where reports land. Overridable so the destination can move without a deploy. */
const TO = process.env.FEEDBACK_TO || 'hello@nomkin.app';

/**
 * On the sending subdomain, not the apex.
 *
 * `nomkin.app` receives its mail at Proton and carries Proton's SPF and DKIM records.
 * `mail.nomkin.app` is verified separately with Resend, so neither set of records touches the
 * other and the apex is never edited to fix a problem it does not have. `README.md` has the four
 * records.
 */
const FROM = 'Nomkin feedback <feedback@mail.nomkin.app>';

const MAX_BODY_BYTES = 3_000_000;
const MAX_IMAGE_BYTES = 2_000_000;
const MAX_MESSAGE_LENGTH = 4_000;
/* The allowed types, and the extension each one is attached under. One object rather than a list
   plus a lookup, so a fourth type cannot be allowed without being given a filename. */
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const ALLOWED_IMAGE_TYPES = Object.keys(EXTENSIONS);

/* Mirrors `osLabel` in the app's `src/core/feedback.ts`. Duplicated rather than shared because
   this file is a separate deployment in a separate repository with no access to that source, and
   three words are a cheaper duplication than a build step between two repos. */
const OS_LABELS = { ios: 'iPhone', android: 'Android', web: 'the web build' };

const CORS = {
  /* `*` on purpose. The app's origin is `capacitor://localhost` on iOS and `https://localhost` on
     Android, neither of which is a trust signal: anyone can send any Origin header. An allowlist
     would buy nothing here and would break the app silently the day Capacitor changed its scheme.
     What protects this endpoint is the validation below and the caps above. */
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function reply(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

/* --- The speed bump ------------------------------------------------------- */

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 3;
const seen = new Map();

function tooOften(key) {
  const now = Date.now();
  const recent = (seen.get(key) || []).filter((at) => now - at < RATE_WINDOW_MS);

  if (recent.length >= RATE_LIMIT) {
    seen.set(key, recent);
    return true;
  }

  recent.push(now);
  seen.set(key, recent);

  /* Pruned here rather than on a timer, because an Edge instance has no timers between requests
     and an unbounded Map is the only way this leaks. */
  if (seen.size > 5_000) {
    for (const [k, times] of seen) {
      if (times.every((at) => now - at >= RATE_WINDOW_MS)) seen.delete(k);
    }
  }

  return false;
}

/**
 * `cf-connecting-ip` first: nomkin.app is proxied through Cloudflare in front of Vercel, so
 * `x-forwarded-for` at this edge is Cloudflare's chain and keying on it naively would put every
 * user in the same bucket.
 */
function callerKey(request) {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();

  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

/* --- Validation ----------------------------------------------------------- */

const NO_CRLF = /^[^\r\n]*$/;
const EMAILISH = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PLAIN = /^[\w.\-]+$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function base64Bytes(data) {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}

/** `{ ok: true, report }`, or `{ ok: false, status, reason }`. */
function validate(payload) {
  const bad = (status, reason) => ({ ok: false, status, reason });

  if (typeof payload !== 'object' || payload === null) return bad(400, 'shape');

  const { kind, message, replyTo, app, os, image, hp } = payload;

  /* A honeypot: nothing legitimate ever fills this in, because nothing legitimate knows it exists.
     Answered with a cheerful 200 rather than a refusal, so a sender learns nothing from being
     caught. */
  if (typeof hp === 'string' && hp.length > 0) return bad(200, 'thanks');

  if (kind !== 'idea' && kind !== 'bug') return bad(400, 'shape');

  if (typeof message !== 'string') return bad(400, 'shape');
  const trimmed = message.trim().slice(0, MAX_MESSAGE_LENGTH);
  if (trimmed.length === 0) return bad(400, 'shape');

  if (typeof replyTo !== 'string') return bad(400, 'shape');
  const address = replyTo.trim();
  /* The CR/LF guard is the header-injection check. This lands in a `Reply-To`, and although Resend
     takes it as JSON rather than as a raw header, a field that reaches a mail header gets checked
     whatever carries it there. */
  if (address.length > 254 || !EMAILISH.test(address) || !NO_CRLF.test(address)) {
    return bad(400, 'shape');
  }

  /* Same reasoning: both of these reach the subject line. */
  if (typeof app !== 'string' || app.length > 32 || !PLAIN.test(app)) return bad(400, 'shape');
  if (typeof os !== 'string' || os.length > 32 || !PLAIN.test(os)) return bad(400, 'shape');

  let attachment = null;
  if (image !== null && image !== undefined) {
    if (typeof image !== 'object') return bad(400, 'shape');
    if (!ALLOWED_IMAGE_TYPES.includes(image.mime)) return bad(400, 'shape');
    if (typeof image.data !== 'string' || !BASE64.test(image.data)) return bad(400, 'shape');
    if (base64Bytes(image.data) > MAX_IMAGE_BYTES) return bad(413, 'tooBig');

    attachment = image;
  }

  return { ok: true, report: { kind, message: trimmed, replyTo: address, app, os, attachment } };
}

/* --- The email ------------------------------------------------------------ */

function subjectFor(report) {
  const word = report.kind === 'bug' ? 'bug' : 'idea';
  const os = OS_LABELS[report.os] || report.os;
  return `Nomkin ${word} (${report.app}, ${os})`;
}

async function sendEmail(report, key) {
  const os = OS_LABELS[report.os] || report.os;

  const body = {
    from: FROM,
    to: [TO],
    /* The whole reason the form asks for an address: hitting reply in the inbox reaches the person
       who wrote in, not this function. */
    reply_to: report.replyTo,
    subject: subjectFor(report),
    /* Text only, never HTML. Nothing typed by a stranger is interpolated into markup, so there is
       no escaping question to get wrong. */
    text: `${report.message}\n\n---\nFrom: ${report.replyTo}\nNomkin ${report.app} on ${os}\n`,
  };

  if (report.attachment !== null) {
    /* An attachment rather than an inline image, so an enormous screenshot does not have to render
       before the words beside it can be read.

       The extension follows the actual type. Resend derives `content_type` from the filename when
       it is not given, so a PNG called `.jpg` would arrive mislabelled and some clients would
       refuse to preview it. The app always sends JPEG, because `shrinkImage` re-encodes everything
       to it, but this endpoint accepts three types and should not assume the app is the only thing
       that ever posts to it. */
    body.attachments = [
      { filename: `screenshot.${EXTENSIONS[report.attachment.mime]}`, content: report.attachment.data },
    ];
  }

  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/* --- The handler ---------------------------------------------------------- */

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return reply(405, { ok: false, reason: 'method' });

  const key = process.env.RESEND_API_KEY;
  /* 503 rather than 500: a deploy made before the key was set is not broken code, and the app
     reads any non-2xx as "not sent" and offers the composer. */
  if (!key) return reply(503, { ok: false, reason: 'relay' });

  /*
   * The body is read once, and its real size is checked rather than its declared one.
   *
   * This began as a `content-length` check that returned 413 *before* reading anything, on the
   * reasoning that refusing a large upload should not cost what accepting one costs. Deployed, that
   * turned every oversized request into a 500: returning from an Edge function while the client is
   * still uploading abandons the request stream mid-flight, and the runtime reports
   * `FUNCTION_INVOCATION_FAILED`. Measured at exactly this constant — 2,999,000 bytes answered 400
   * and 3,010,000 answered 500 — which is how a platform quirk was told apart from a size limit.
   *
   * The saving was mostly imaginary anyway. The bytes reach Vercel's edge whether or not this
   * function reads them, so what a pre-read check avoids is parsing them, not receiving them. What
   * genuinely stops an enormous upload is the platform's own limit, which answers a clean 413
   * (`FUNCTION_PAYLOAD_TOO_LARGE`) at about 4.5 MB without this code running at all.
   *
   * Checking the real length also closes a smaller hole: a `content-length` header is a claim, and
   * `raw.length` is a fact.
   */
  let raw;
  try {
    raw = await request.text();
  } catch {
    return reply(400, { ok: false, reason: 'shape' });
  }

  if (raw.length > MAX_BODY_BYTES) return reply(413, { ok: false, reason: 'tooBig' });

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return reply(400, { ok: false, reason: 'shape' });
  }

  const checked = validate(payload);
  if (!checked.ok) {
    /* The honeypot's 200 goes out here, indistinguishable from a real send. */
    if (checked.status === 200) return reply(200, { ok: true });
    return reply(checked.status, { ok: false, reason: checked.reason });
  }

  if (tooOften(callerKey(request))) return reply(429, { ok: false, reason: 'tooOften' });

  try {
    const response = await sendEmail(checked.report, key);
    if (!response.ok) return reply(502, { ok: false, reason: 'relay' });
  } catch {
    return reply(502, { ok: false, reason: 'relay' });
  }

  return reply(200, { ok: true });
}
