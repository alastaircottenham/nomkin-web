/*
 * The site, in seven languages.
 *
 * Nomkin's pages are hand-written static HTML and the point of this script is
 * that they stay that way. The English page is the source: it holds the
 * structure, the artwork, the third-party embeds and every decision about
 * layout, and it is the file you edit. What it also holds is a set of markers —
 *
 *     <!--i18n:doc--> ... <!--/i18n:doc-->
 *
 * — around the parts of it that are words. For each of the other six languages
 * this script takes the English page, swaps what is inside those markers for
 * the same block from `i18n/<locale>/<page>.html`, retitles it, points its
 * canonical and its internal links at that language, marks the language
 * selector, and writes the result to `<locale>/<path>/index.html`.
 *
 * So a translated page is a real, complete, pre-rendered HTML file. Nothing is
 * fetched, nothing is swapped in by a script, and there is no moment where a
 * German reader sees English. It is also why they are generated rather than
 * kept by hand: seven languages times eight pages is fifty-six files, and
 * forty-eight of them drift the first time somebody edits the English one.
 *
 * Run it with `npm run build`. It has no dependencies on purpose — a site that
 * needed a lockfile to publish a paragraph would have lost something.
 *
 * `--strict` turns the warnings below into a failure, which is what a deploy
 * wants: a missing block falls back to English, and falling back quietly in
 * public is how a page ends up half-translated.
 */

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOCALES, PAGES, SOURCE, ORIGIN, localePath } from './i18n/locales.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const STRICT = process.argv.includes('--strict');

/*
 * Everything is read as LF, whatever it is on disk.
 *
 * Git is commonly set to hand Windows a working tree with CRLF endings, and
 * this script writes LF. Left alone that mismatch does two quiet things: the
 * check below compares a CRLF page against an LF string and reports every
 * selector as out of date, and a generated page ends up with CRLF around the
 * blocks and LF inside them. Normalising on the way in makes the output the
 * same bytes on every machine, which is what a build should be.
 */
async function read(file) {
  return (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');
}

let warnings = 0;
function warn(message) {
  warnings += 1;
  console.warn(`  ! ${message}`);
}

/* ---------------------------------------------------------------- markers -- */

/*
 * `<!--i18n:key-->` to `<!--/i18n:key-->`, and what is between them. Written as
 * one expression rather than a parser because that is all this needs to be: the
 * markers are ours, they are always balanced, and they never nest. Bringing in
 * an HTML parser to find a comment would be a dependency bought for nothing.
 */
function blockPattern(key) {
  return new RegExp(`(<!--i18n:${key}-->)([\\s\\S]*?)(<!--/i18n:${key}-->)`);
}

/** Every block key present in a file, in the order they appear. */
function blockKeys(html) {
  return [...html.matchAll(/<!--i18n:([a-z0-9-]+)-->/g)].map((m) => m[1]);
}

/** The blocks of a translation partial, as a map of key to inner HTML. */
function parsePartial(html, label) {
  const blocks = new Map();
  for (const key of blockKeys(html)) {
    const found = html.match(blockPattern(key));
    if (!found) {
      warn(`${label}: block "${key}" opens but never closes`);
      continue;
    }
    blocks.set(key, found[2]);
  }
  return blocks;
}

/* ------------------------------------------------------------- furniture -- */

/*
 * The selector's own accessible name, which is the one string on a page that
 * has to be in the reader's language before they have chosen it. Everything
 * else on a `/de/` page is German because the reader asked for German; this
 * label is read out to somebody who has not asked yet.
 */
const LANGBAR_LABEL = {
  en: 'Language',
  de: 'Sprache',
  es: 'Idioma',
  fr: 'Langue',
  'pt-br': 'Idioma',
  ja: '言語',
  ko: '언어',
};

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/*
 * The language selector, which the build owns rather than the page.
 *
 * It is regenerated per page as well as per language, because every entry
 * points at the *same* page in another language rather than at that language's
 * home page. Sending somebody reading the privacy policy back to the landing
 * page for the crime of wanting it in French is not a translation, it is a dead
 * end.
 *
 * The current language is a `<span>` rather than a link to itself, which is
 * both what a screen reader wants and what stops a stray click reloading the
 * page. `data-lang-pick` is what the head script listens for: a click on one of
 * these is a deliberate choice, and a deliberate choice outranks the browser's
 * guess from then on.
 */
function langbar(page, locale) {
  const items = LOCALES.map((other) => {
    const label = escapeHtml(other.name);
    if (other.code === locale.code) {
      return (
        `          <li class="langbar__item langbar__item--current">\n` +
        `            <span lang="${other.hreflang}" aria-current="true">${label}</span>\n` +
        `          </li>`
      );
    }
    return (
      `          <li class="langbar__item">\n` +
      `            <a href="${localePath(page, other)}" lang="${other.hreflang}"` +
      ` hreflang="${other.hreflang}" data-lang-pick="${other.code}">${label}</a>\n` +
      `          </li>`
    );
  }).join('\n');

  return (
    `\n      <nav class="langbar" aria-label="${escapeHtml(LANGBAR_LABEL[locale.code])}">\n` +
    `        <svg class="langbar__globe" viewBox="0 0 24 24" aria-hidden="true" focusable="false">\n` +
    `          <circle cx="12" cy="12" r="9" />\n` +
    `          <path d="M3.2 9h17.6M3.2 15h17.6" />\n` +
    `          <path d="M12 3.2a13.5 13.5 0 0 1 0 17.6 13.5 13.5 0 0 1 0-17.6z" />\n` +
    `        </svg>\n` +
    `        <ul class="langbar__list">\n${items}\n        </ul>\n` +
    `      </nav>\n    `
  );
}

/*
 * The alternate links. Every language of a page names every other language of
 * it, itself included, which is what search engines require: a set that does
 * not point back at itself is ignored. `x-default` is English, as the language
 * the site is written in and the fallback for a reader we have nothing better
 * for.
 */
function alternates(page) {
  const rows = LOCALES.map(
    (locale) =>
      `    <link rel="alternate" hreflang="${locale.hreflang}"` +
      ` href="${ORIGIN}${localePath(page, locale)}" />`
  );
  const english = LOCALES.find((l) => l.code === SOURCE);
  rows.push(
    `    <link rel="alternate" hreflang="x-default" href="${ORIGIN}${localePath(page, english)}" />`
  );
  return `\n${rows.join('\n')}\n    `;
}

/* --------------------------------------------------------------- rewrites -- */

/*
 * Internal links, moved into the language the page is in.
 *
 * Only the site's own pages are touched, and they are matched against the list
 * in `locales.mjs` rather than by any rule about what a path looks like. That
 * is deliberate: `/assets/`, `/api/feedback/` and `/styles.css` are one copy
 * serving every language and must not be prefixed, and a rule general enough to
 * catch `/privacy/` is general enough to break one of those. A fragment rides
 * along, so a link to `/privacy/#usage` lands on the right section of the right
 * translation.
 */
function localiseLinks(html, locale) {
  if (!locale.dir) return html;
  const paths = PAGES.map((p) => p.path).sort((a, b) => b.length - a.length);
  let out = html;
  for (const path of paths) {
    const escaped = path.replace(/\//g, '\\/');
    out = out.replace(
      new RegExp(`href="${escaped}(#[A-Za-z0-9_-]+)?"`, 'g'),
      (_, hash) => `href="/${locale.dir}${path}${hash || ''}"`
    );
  }
  return out;
}

/** Replace something the page is expected to contain, and say so if it does not. */
function replaceOnce(html, pattern, replacement, label, what) {
  if (!pattern.test(html)) {
    warn(`${label}: could not find ${what}`);
    return html;
  }
  return html.replace(pattern, replacement);
}

/* ------------------------------------------------------------------ build -- */

/* Which `attrs` entries matched something, for the check at the end of a locale. */
let attrsUsed = new Set();

async function buildPage(page, locale, meta, partial) {
  const label = `${locale.code} ${page.path}`;
  const source = await read(join(ROOT, page.file));
  const keys = blockKeys(source);
  let html = source;

  /* The words. */
  for (const key of keys) {
    if (key === 'langbar' || key === 'alternates') continue;
    const translated = partial.get(key);
    if (translated === undefined) {
      warn(`${label}: no translation for block "${key}" — left in English`);
      continue;
    }
    html = html.replace(blockPattern(key), (_, open, __, close) => open + translated + close);
  }
  for (const key of partial.keys()) {
    if (!keys.includes(key)) {
      warn(`${label}: translation has a block "${key}", which the English page does not`);
    }
  }

  /* The language the document is in, and the language the head script is in. */
  html = replaceOnce(
    html,
    /<html lang="[^"]*"/,
    `<html lang="${locale.lang}"`,
    label,
    '<html lang>'
  );
  html = html.replace(/data-lang="[a-z-]+"/, `data-lang="${locale.code}"`);

  /* The head. */
  const head = meta.pages[page.translated];
  if (!head) {
    warn(`${label}: meta.json has no entry for "${page.translated}"`);
  } else {
    html = replaceOnce(
      html,
      /<title>[\s\S]*?<\/title>/,
      () => `<title>${head.title}</title>`,
      label,
      '<title>'
    );
    html = replaceOnce(
      html,
      /(<meta\s+name="description"\s+content=")[\s\S]*?(")/,
      (_, a, b) => a + head.description + b,
      label,
      'the meta description'
    );
    if (head['og:title'] !== undefined) {
      html = html.replace(
        /(<meta property="og:title" content=")[^"]*(")/,
        (_, a, b) => a + head['og:title'] + b
      );
    }
    if (head['og:description'] !== undefined) {
      html = html.replace(
        /(<meta\s+property="og:description"\s+content=")[\s\S]*?(")/,
        (_, a, b) => a + head['og:description'] + b
      );
    }
  }

  /* Where this page says it lives. */
  const url = `${ORIGIN}${localePath(page, locale)}`;
  html = replaceOnce(
    html,
    /(<link rel="canonical" href=")[^"]*(")/,
    (_, a, b) => a + url + b,
    label,
    'the canonical link'
  );
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/, (_, a, b) => a + url + b);

  /*
   * Attributes that sit outside any block — an iframe title, mostly. Whether
   * one matches is counted for the locale rather than warned about per page:
   * an entry for the puzzle form is meant to miss on the other six pages, and
   * an entry that misses on all seven is the only kind that is a mistake.
   */
  for (const entry of meta.attrs || []) {
    const [from, to] = entry;
    if (html.includes(from)) attrsUsed.add(from);
    html = html.split(from).join(to);
  }

  html = localiseLinks(html, locale);
  html = html.replace(
    blockPattern('langbar'),
    (_, open, __, close) => open + langbar(page, locale) + close
  );

  /*
   * Two things a translation can quietly lose, and both of them break a link.
   *
   * The documents cross-reference each other by fragment — `#usage` is named
   * from four other pages — so an `id` that a translator dropped or renamed
   * turns those into links that land at the top of the page and say nothing.
   * And an `href` that came out of a translated block is a link somebody
   * retyped, so it is worth checking that the set still matches.
   *
   * Compared against the English page rather than against a list, so the check
   * needs no maintaining: whatever the source has, the translation must have.
   */
  const ids = (text) => new Set([...text.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const id of ids(source)) {
    if (!ids(html).has(id)) warn(`${label}: the anchor #${id} is missing from the translation`);
  }

  const externals = (text) =>
    new Set([...text.matchAll(/href="((?:https?:|mailto:)[^"]+)"/g)].map((m) => m[1]));
  for (const href of externals(source)) {
    if (!externals(html).has(href)) warn(`${label}: the link to ${href} is missing`);
  }

  /*
   * And the shape of the document, which is the cheap way to catch a paragraph
   * or a table row that went missing between the two files. A faithful
   * translation of a page has exactly as many headings, list items and cells as
   * the page it translates — these are structure, not language, and if the
   * counts have drifted then something was dropped, doubled, or left unclosed.
   */
  const shape = (text) =>
    Object.fromEntries(
      ['h1', 'h2', 'h3', 'p', 'ul', 'ol', 'li', 'table', 'tr', 'th', 'td'].map((tag) => [
        tag,
        (text.match(new RegExp(`<${tag}[\s>]`, 'g')) || []).length,
      ])
    );
  const before = shape(source);
  const after = shape(html);
  for (const tag of Object.keys(before)) {
    if (before[tag] !== after[tag]) {
      warn(`${label}: ${after[tag]} <${tag}> where the English page has ${before[tag]}`);
    }
  }

  const out = join(ROOT, locale.dir, page.path === '/' ? '' : page.path, 'index.html');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, html, 'utf8');
}

/*
 * The English pages are not generated — they are the source, and the build
 * never writes to them. But two things on them, the selector and the alternate
 * links, have to agree exactly with what this script generates for everybody
 * else, and they are the kind of thing that goes stale silently. So they are
 * checked rather than written: add a language to `locales.mjs` without running
 * `npm run sync` over the English pages and the build says so.
 */
async function checkSource(page) {
  const label = `en ${page.path}`;
  const html = await read(join(ROOT, page.file));
  const english = LOCALES.find((l) => l.code === SOURCE);

  const bar = html.match(blockPattern('langbar'));
  if (!bar) warn(`${label}: no <!--i18n:langbar--> block`);
  else if (bar[2] !== langbar(page, english)) warn(`${label}: the language selector is out of date`);

  const alts = html.match(blockPattern('alternates'));
  if (!alts) warn(`${label}: no <!--i18n:alternates--> block`);
  else if (alts[2] !== alternates(page)) warn(`${label}: the alternate links are out of date`);
}

/*
 * `npm run sync` — write the two generated blocks back into the English pages,
 * which is what makes the check above something you can act on rather than
 * something you have to hand-fix seven times.
 */
async function syncSource() {
  const english = LOCALES.find((l) => l.code === SOURCE);
  for (const page of PAGES) {
    const file = join(ROOT, page.file);
    const before = await read(file);
    const after = before
      .replace(blockPattern('langbar'), (_, o, __, c) => o + langbar(page, english) + c)
      .replace(blockPattern('alternates'), (_, o, __, c) => o + alternates(page) + c);
    if (after !== before) {
      await writeFile(file, after, 'utf8');
      console.log(`  updated ${page.file}`);
    }
  }
}

/*
 * The sitemap, with every language of every page named as an alternate of every
 * other. Search engines want the whole set repeated inside each `<url>` entry
 * rather than stated once, which is why this is as repetitive as it is.
 */
async function buildSitemap() {
  const english = LOCALES.find((l) => l.code === SOURCE);
  const entries = PAGES.filter((p) => p.sitemap).flatMap((page) => {
    const links = [
      ...LOCALES.map(
        (l) =>
          `    <xhtml:link rel="alternate" hreflang="${l.hreflang}"` +
          ` href="${ORIGIN}${localePath(page, l)}" />`
      ),
      `    <xhtml:link rel="alternate" hreflang="x-default"` +
        ` href="${ORIGIN}${localePath(page, english)}" />`,
    ].join('\n');

    return LOCALES.map(
      (locale) =>
        `  <url>\n` +
        `    <loc>${ORIGIN}${localePath(page, locale)}</loc>\n` +
        `    <lastmod>${page.lastmod}</lastmod>\n` +
        `${links}\n` +
        `  </url>`
    );
  });

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
    `        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    `${entries.join('\n')}\n` +
    `</urlset>\n`;

  await writeFile(join(ROOT, 'sitemap.xml'), xml, 'utf8');
}

async function main() {
  if (process.argv.includes('--sync')) {
    await syncSource();
    return;
  }

  for (const locale of LOCALES) {
    if (locale.dir) await rm(join(ROOT, locale.dir), { recursive: true, force: true });
  }

  for (const page of PAGES) await checkSource(page);

  for (const locale of LOCALES) {
    if (locale.code === SOURCE) continue;
    /*
     * A locale with nothing written for it yet still gets all of its pages, in
     * English, at the URLs the selector and the alternate links already point
     * at. A half-finished translation is a thing to warn about; a 404 behind a
     * link every other page carries is a thing to avoid.
     */
    let meta = { pages: {}, attrs: [] };
    try {
      meta = JSON.parse(await read(join(ROOT, 'i18n', locale.dir, 'meta.json')));
    } catch {
      warn(`${locale.code}: no i18n/${locale.dir}/meta.json — heads left in English`);
    }
    attrsUsed = new Set();
    for (const page of PAGES) {
      const file = join(ROOT, 'i18n', locale.dir, page.translated);
      let partial;
      try {
        partial = parsePartial(await read(file), `${locale.code}/${page.translated}`);
      } catch {
        warn(`${locale.code} ${page.path}: no ${page.translated} — page left in English`);
        partial = new Map();
      }
      await buildPage(page, locale, meta, partial);
    }
    for (const [from] of meta.attrs || []) {
      if (!attrsUsed.has(from)) warn(`${locale.code}: the attrs entry "${from}" matched no page`);
    }
    console.log(`  ${locale.dir}/  ${PAGES.length} pages`);
  }

  await buildSitemap();
  console.log(`  sitemap.xml  ${PAGES.filter((p) => p.sitemap).length * LOCALES.length} urls`);

  if (warnings) {
    console.log(`\n${warnings} warning${warnings === 1 ? '' : 's'}.`);
    if (STRICT) process.exit(1);
  } else {
    console.log('\nClean.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
