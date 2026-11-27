import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readingLinks, readingComponents } from './helpers/readingLinkModules.mjs';

const { publicWebUrl, normalizeReadingLink, readingSite, loadReadingPreview } = readingLinks;
test('reading URLs accept public web links but reject unsafe schemes, credentials and private hosts', () => {
  assert.equal(publicWebUrl(' https://www.example.org/article?q=reading '), 'https://www.example.org/article?q=reading');
  for (const value of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/article', 'https://user:pass@example.org', 'http://localhost:5185', 'http://127.0.0.1', 'http://2130706433', 'http://0x7f000001', 'http://10.0.0.1', 'http://172.16.0.1', 'http://192.168.1.1', 'http://169.254.169.254', 'http://printer.local', 'http://[::1]', 'not a URL']) {
    assert.equal(publicWebUrl(value), null, value);
  }
});
test('preview metadata is normalized without retaining arbitrary fields or unsafe image URLs', () => {
  assert.deepEqual(normalizeReadingLink({ url: 'https://example.org', imageUrl: 'javascript:alert(1)', other: 'ignored' }), { url: 'https://example.org/' });
  assert.equal(normalizeReadingLink({ url: 'file:///article' }), undefined);
  assert.equal(normalizeReadingLink(null), undefined);
  assert.equal(readingSite('https://www.example.org/article'), 'example.org');
});
test('link cards expose a safe new-tab action, title, site and thumbnail', () => {
  const html = renderToStaticMarkup(React.createElement(readingComponents.ReadingLinkCard, {
    title: 'A little reading', link: { url: 'https://example.org/read', imageUrl: 'https://example.org/image.jpg' },
  }));
  assert.match(html, /aria-label="Read A little reading on example.org"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /referrerPolicy="no-referrer"/);
  assert.match(html, /src="https:\/\/example.org\/image.jpg"/);
  assert.match(html, /loading="lazy"/);
});
test('links without an image still have a website icon and Read action; invalid links do not render', () => {
  const html = renderToStaticMarkup(React.createElement(readingComponents.ReadingLinkCard, { title: 'Article', link: { url: 'https://example.org' } }));
  assert.match(html, /lucide-globe/);
  assert.match(html, /Read/);
  assert.doesNotMatch(html, /<img/);
  assert.equal(renderToStaticMarkup(React.createElement(readingComponents.ReadingLinkCard, { title: 'Invalid', link: { url: 'javascript:alert(1)' } })), '');
});
test('preview failures surface without sending account cookies or following redirects', async () => {
  const original = globalThis.fetch;
  let options;
  globalThis.fetch = async (_url, opts) => { options = opts; return new Response('no', { status: 403 }); };
  try {
    await assert.rejects(loadReadingPreview('https://example.org/article'), /Preview unavailable/);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.mode, 'cors');
  } finally { globalThis.fetch = original; }
});
