import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Globe, Image as ImageIcon } from 'lucide-react';
import { loadReadingPreview, normalizeReadingLink, publicWebUrl, readingSite, type ReadingLink } from '../services/readingLinks';

export function ReadingLinkCard({ link, title }: { link: ReadingLink; title: string }) {
  const safe = normalizeReadingLink(link);
  const [failedImage, setFailedImage] = useState('');
  if (!safe) return null;
  return <a className="reading-link-card" href={safe.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`Read ${title} on ${readingSite(safe.url)}`} onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} draggable={false}>
    <span className="reading-link-thumbnail">{safe.imageUrl && failedImage !== safe.imageUrl ? <img src={safe.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedImage(safe.imageUrl!)} /> : <Globe size={24} aria-hidden="true" />}</span>
    <span className="reading-link-caption"><strong>{title}</strong><small>{readingSite(safe.url)}</small><span>Read <ExternalLink size={14} /></span></span>
  </a>;
}

export function ReadingLinkFields({ value, title, disabled, onChange, onTitle }: { value: ReadingLink; title: string; disabled?: boolean; onChange: (value: ReadingLink) => void; onTitle: (title: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  const latest = useRef({ value, title, disabled }); latest.current = { value, title, disabled };
  useEffect(() => () => pending.current?.abort(), []);
  return <div className="reading-link-fields">
    <label>URL<input type="url" required value={value.url} disabled={disabled} placeholder="https://..." onChange={event => { pending.current?.abort(); onChange({ url: event.target.value }); setError(''); }} /></label>
    <button type="button" disabled={disabled || busy || !publicWebUrl(value.url)} onClick={async () => {
      pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
      const original = { ...latest.current }; setBusy(true); setError('');
      try {
        const preview = await loadReadingPreview(value.url, controller.signal);
        if (controller.signal.aborted || latest.current.value.url !== original.value.url || latest.current.disabled) return;
        onChange({ url: preview.link.url, imageUrl: latest.current.value.imageUrl !== original.value.imageUrl ? latest.current.value.imageUrl : preview.link.imageUrl });
        if (latest.current.title === original.title) onTitle(preview.title);
      } catch { if (!controller.signal.aborted) setError('Preview unavailable. You can keep the title and add a thumbnail yourself.'); }
      finally { if (pending.current === controller) { setBusy(false); pending.current = null; } }
    }}><ImageIcon size={17} />{busy ? 'Loading preview...' : 'Load preview'}</button>
    {error && <p role="status">{error}</p>}
    <details><summary>Thumbnail</summary><label>Image URL<input type="url" disabled={disabled} value={value.imageUrl ?? ''} placeholder="https://..." onChange={event => onChange({ ...value, imageUrl: event.target.value })} /></label></details>
    <ReadingLinkCard link={value} title={title || readingSite(value.url)} />
  </div>;
}

export function ReadingLinkEditor({ title: initialTitle, link, onSave }: { title: string; link?: ReadingLink; onSave: (title: string, link: ReadingLink) => Promise<void> }) {
  const [title, setTitle] = useState(initialTitle);
  const [value, setValue] = useState<ReadingLink>(link ?? { url: publicWebUrl(initialTitle) ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  return <fieldset className="reading-link-editor" disabled={busy}>
    <legend>Link details</legend>
    <label>Title<input value={title} onChange={event => setTitle(event.target.value)} /></label>
    <ReadingLinkFields value={value} title={title} disabled={busy} onChange={setValue} onTitle={setTitle} />
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy || !title.trim() || !publicWebUrl(value.url)} onClick={async () => {
      if (saving.current) return;
      saving.current = true; setBusy(true); setError('');
      try { await onSave(title.trim(), value); }
      catch (error) { setError(error instanceof Error ? error.message : 'Could not save link. Please retry.'); }
      finally { saving.current = false; setBusy(false); }
    }}>{busy ? 'Saving...' : 'Save link'}</button>
  </fieldset>;
}
