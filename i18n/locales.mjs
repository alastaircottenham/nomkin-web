/*
 * The languages the site is published in, and the one it is written in.
 *
 * `dir` is the URL prefix and the directory `build.mjs` writes into; English
 * has none, because English lives at the root and every other language hangs
 * off it. `lang` is what goes in `<html lang>`, `hreflang` is what goes in the
 * alternate links — they differ for Brazilian Portuguese, where the region is
 * part of the identity of the translation and not merely a spelling of it.
 *
 * `name` is written in the language it names, never in English: somebody who
 * cannot read the page they have landed on has to be able to find their way
 * out of it, and "German" is no use to a reader who only reads German.
 *
 * The order is the order of the selector. English first because it is the
 * source, then the rest by their own names.
 */
export const SOURCE = 'en';

export const LOCALES = [
  { code: 'en', dir: '', lang: 'en-AU', hreflang: 'en', name: 'English' },
  { code: 'de', dir: 'de', lang: 'de', hreflang: 'de', name: 'Deutsch' },
  { code: 'es', dir: 'es', lang: 'es', hreflang: 'es', name: 'Español' },
  { code: 'fr', dir: 'fr', lang: 'fr', hreflang: 'fr', name: 'Français' },
  { code: 'pt-br', dir: 'pt-br', lang: 'pt-BR', hreflang: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'ja', dir: 'ja', lang: 'ja', hreflang: 'ja', name: '日本語' },
  { code: 'ko', dir: 'ko', lang: 'ko', hreflang: 'ko', name: '한국어' },
];

/*
 * Every page of the site, as the path it is served at and the file it is
 * written in. The paths are also what `build.mjs` rewrites internal links
 * against: a link to any of these gets the locale prefix, and a link to
 * anything else — an asset, the feedback endpoint, another site — does not.
 *
 * `translated` is the name of the partial in `i18n/<locale>/`, `lastmod` is
 * what the sitemap reports for every language of the page, and `sitemap` is
 * false for the one page that asks not to be indexed.
 */
export const PAGES = [
  { path: '/', file: 'index.html', translated: 'index.html', lastmod: '2026-08-29', sitemap: true },
  {
    path: '/privacy/',
    file: 'privacy/index.html',
    translated: 'privacy.html',
    lastmod: '2026-08-26',
    sitemap: true,
  },
  {
    path: '/terms/',
    file: 'terms/index.html',
    translated: 'terms.html',
    lastmod: '2026-08-26',
    sitemap: true,
  },
  {
    path: '/delete-account/',
    file: 'delete-account/index.html',
    translated: 'delete-account.html',
    lastmod: '2026-08-26',
    sitemap: true,
  },
  {
    path: '/support/',
    file: 'support/index.html',
    translated: 'support.html',
    lastmod: '2026-08-29',
    sitemap: true,
  },
  {
    path: '/puzzles/',
    file: 'puzzles/index.html',
    translated: 'puzzles.html',
    lastmod: '2026-08-26',
    sitemap: true,
  },
  {
    path: '/puzzles/terms/',
    file: 'puzzles/terms/index.html',
    translated: 'puzzles-terms.html',
    lastmod: '2026-08-26',
    sitemap: true,
  },
  {
    path: '/puzzles/thanks/',
    file: 'puzzles/thanks/index.html',
    translated: 'puzzles-thanks.html',
    lastmod: '2026-08-26',
    sitemap: false,
  },
];

export const ORIGIN = 'https://nomkin.app';

/** The URL a page is served at in a given locale. `/privacy/` becomes `/de/privacy/`. */
export function localePath(page, locale) {
  return locale.dir ? `/${locale.dir}${page.path}` : page.path;
}
