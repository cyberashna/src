export type ReadingLink = { url: string; imageUrl?: string };

export function publicWebUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal') || host.startsWith('[')) return null;
    const parts = host.split('.').map(Number);
    if (parts.length === 4 && parts.every(Number.isInteger)) {
      const [a, b] = parts;
      if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return null;
    }
    return url.href;
  } catch { return null; }
}

export function normalizeReadingLink(value: unknown): ReadingLink | undefined {
  if (!value || typeof value !== 'object') return;
  const raw = value as ReadingLink;
  const url = typeof raw.url === 'string' ? publicWebUrl(raw.url) : null;
  if (!url) return;
  const imageUrl = typeof raw.imageUrl === 'string' ? publicWebUrl(raw.imageUrl) : null;
  return { url, ...(imageUrl ? { imageUrl } : {}) };
}

export function readingSite(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Link'; }
}

export function parseReadingPreview(html: string, sourceUrl: string): { title: string; link: ReadingLink } {
  const url = publicWebUrl(sourceUrl);
  if (!url) throw new Error('Use a public http or https address.');
  const document = new DOMParser().parseFromString(html, 'text/html');
  const meta = (name: string) => document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content')?.trim();
  const title = (meta('og:title') || meta('twitter:title') || document.title || readingSite(url)).slice(0, 240);
  let imageUrl: string | null = null;
  try { imageUrl = publicWebUrl(new URL(meta('og:image') || meta('twitter:image') || '', url).href); } catch { /* Missing or unusable preview image. */ }
  if (!meta('og:image') && !meta('twitter:image')) imageUrl = null;
  return { title, link: { url, ...(imageUrl ? { imageUrl } : {}) } };
}

export async function loadReadingPreview(value: string, signal?: AbortSignal) {
  const url = publicWebUrl(value);
  if (!url) throw new Error('Use a public http or https address.');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 6000);
  try {
    if (signal?.aborted) throw new Error('Cancelled');
    // No proxy, account cookies, redirects, or referrer are sent to the article site.
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', mode: 'cors' });
    if (!response.ok || !/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type') ?? '')) throw new Error('Preview unavailable');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Preview unavailable');
    const decoder = new TextDecoder();
    let html = '', size = 0;
    try {
      while (size < 256_000) {
        const { value: bytes, done } = await reader.read();
        if (done) break;
        const chunk = bytes.subarray(0, 256_000 - size);
        size += chunk.length; html += decoder.decode(chunk, { stream: true });
        if (/<\/head\s*>/i.test(html)) break;
      }
      html += decoder.decode();
    } finally { await reader.cancel(); }
    return parseReadingPreview(html, url);
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); }
}
