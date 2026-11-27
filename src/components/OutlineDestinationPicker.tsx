import { useEffect, useRef, useState } from 'react';
import { Check, Folder, Inbox, Pin, Search, X } from 'lucide-react';
import type { OutlineNode } from '../services/planningOutliner';
import { outlineMoveDestinations } from '../services/outlineModel';

type Preferences = { pinned: string[]; recent: string[] };
const empty: Preferences = { pinned: [], recent: [] };
function readPreferences(key: string): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    const ids = (input: unknown) => Array.isArray(input) ? input.filter((id): id is string => typeof id === 'string').slice(0, 20) : [];
    return { pinned: ids(value.pinned), recent: ids(value.recent) };
  } catch { return empty; }
}

export function outlineDestinationLabel(nodes: OutlineNode[], id: string | null): string {
  if (!id) return 'Ungrouped';
  const entry = outlineMoveDestinations(nodes, new Set()).find(item => item.id === id);
  return entry ? [entry.path === 'Outline' ? '' : entry.path, entry.name].filter(Boolean).join(' / ') : 'Destination unavailable';
}

export function OutlineDestinationPicker({ nodes, userId, excludedIds = [], currentId, title = 'Put under...', onChoose, onClose }: {
  nodes: OutlineNode[]; userId: string; excludedIds?: string[]; currentId: string | null;
  title?: string; onChoose: (id: string | null) => void; onClose: () => void;
}) {
  const key = `outline-destinations:${userId}`;
  const [preferences, setPreferences] = useState(() => readPreferences(key));
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setPreferences(readPreferences(key));
    searchRef.current?.focus({ preventScroll: true });
  }, [key]);
  const destinations = outlineMoveDestinations(nodes, new Set(excludedIds));
  const search = query.trim().toLocaleLowerCase();
  const available = new Set(destinations.map(item => item.id));
  const remember = (next: Preferences) => {
    setPreferences(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Capture remains available without device preferences. */ }
  };
  const choose = (id: string | null) => {
    if (id) remember({ ...preferences, recent: [id, ...preferences.recent.filter(value => value !== id)].slice(0, 5) });
    onChoose(id);
  };
  const used = new Set<string>();
  const sections = (search
    ? [{ label: 'Matches', ids: destinations.filter(item => `${item.path} ${item.name}`.toLocaleLowerCase().includes(search)).map(item => item.id) }]
    : [{ label: 'Pinned', ids: preferences.pinned }, { label: 'Recent', ids: preferences.recent }, { label: 'All destinations', ids: destinations.map(item => item.id) }])
    .map(section => ({ ...section, ids: section.ids.filter(id => {
      if (!available.has(id) || used.has(id)) return false;
      used.add(id); return true;
    }) }));
  return <section className="outline-destination-picker" aria-label={title} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
  }}>
    <header><strong>{title}</strong><button type="button" onClick={onClose} aria-label="Close destination picker" title="Close destination picker"><X size={18} /></button></header>
    <label className="outline-destination-search"><Search size={18} aria-hidden="true" /><input ref={searchRef} type="search" aria-label="Search all destinations" placeholder="Search every group or item" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className="outline-destination-options">
      {(!search || 'ungrouped'.includes(search)) && <button type="button" className="outline-destination-choice" aria-pressed={currentId === null} onClick={() => choose(null)}><Inbox size={18} /><span><strong>Ungrouped</strong><small>No parent</small></span>{currentId === null && <Check size={18} />}</button>}
      {sections.map(section => section.ids.length > 0 && <section key={section.label} aria-label={section.label}><h4>{section.label}</h4>{section.ids.map(id => {
        const item = destinations.find(entry => entry.id === id)!;
        const pinned = preferences.pinned.includes(id);
        return <div className="outline-destination-row" key={id}>
          <button type="button" className="outline-destination-choice" aria-pressed={currentId === id} onClick={() => choose(id)}><Folder size={18} /><span><strong>{item.name}</strong><small>{item.path}{currentId === id ? ' · Current location' : ''}</small></span>{currentId === id && <Check size={18} />}</button>
          <button type="button" className="outline-destination-pin" aria-pressed={pinned} aria-label={`${pinned ? 'Unpin' : 'Pin'} ${item.name}`} title={`${pinned ? 'Unpin' : 'Pin'} destination`} onClick={() => remember({ ...preferences, pinned: pinned ? preferences.pinned.filter(value => value !== id) : [...preferences.pinned, id] })}><Pin size={18} /></button>
        </div>;
      })}</section>)}
      {search && !used.size && !'ungrouped'.includes(search) && <p role="status">No matching destinations.</p>}
    </div>
  </section>;
}
