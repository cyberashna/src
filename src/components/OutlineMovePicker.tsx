import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Folder, FolderInput, Outdent, Search } from 'lucide-react';
import type { OutlineNode } from '../services/planningOutliner';
import { outlineMoveDestinations } from '../services/outlineModel';
import { PlannerModal } from './PlannerShell';

type Props = {
  nodes: OutlineNode[];
  ids: string[];
  summary: string;
  currentParentId?: string | null;
  onMove: (parentId: string | null) => void;
  onMoveOut?: () => void;
  onClose: () => void;
};

export function OutlineMovePicker({ nodes, ids, summary, currentParentId, onMove, onMoveOut, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(currentParentId ?? null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, []);
  const destinations = useMemo(() => outlineMoveDestinations(nodes, new Set(ids)), [nodes, ids]);
  const search = query.trim().toLocaleLowerCase();
  const matches = destinations.filter(item => `${item.name} ${item.path}`.toLocaleLowerCase().includes(search));
  const chosen = destinations.find(item => item.id === selected);
  const valid = selected === null || !!chosen;
  const unchanged = currentParentId !== undefined && currentParentId === selected;
  return <PlannerModal title="Move item" onClose={onClose}>
    <div className="outline-move-picker">
      <p className="outliner-item-name">{summary}</p>
      {onMoveOut && <button type="button" className="outline-move-out" onClick={onMoveOut}><Outdent size={18} />Move out one level</button>}
      <label className="outline-move-search"><Search size={18} aria-hidden="true" /><input ref={searchRef} type="search" aria-label="Search destinations" placeholder="Find a theme, group or item" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="outline-move-options" role="group" aria-label="Move destination">
        <button type="button" className="outline-move-option" aria-pressed={selected === null} onClick={() => setSelected(null)}>
          <Folder size={18} aria-hidden="true" /><span><strong>Outline</strong><small>Top level{currentParentId === null ? ' \u00b7 Current location' : ''}</small></span>{selected === null && <Check size={18} aria-hidden="true" />}
        </button>
        {([{ container: true, label: 'Themes & groups' }, { container: false, label: 'Other items' }]).map(section => {
          const options = matches.filter(item => item.container === section.container);
          return options.length > 0 && <section key={section.label} aria-label={section.label}>
            <h3>{section.label}</h3>
            {options.map(item => <button key={item.id} type="button" className="outline-move-option" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>
              {item.container ? <Folder size={18} aria-hidden="true" /> : <FolderInput size={18} aria-hidden="true" />}
              <span><strong>{item.name}</strong><small>{item.path}{' \u00b7 '}{item.kind}{currentParentId === item.id ? ' \u00b7 Current location' : ''}</small></span>
              {selected === item.id && <Check size={18} aria-hidden="true" />}
            </button>)}
          </section>;
        })}
        {!matches.length && <p className="outline-move-empty" role="status">{search ? 'No matching destinations.' : 'No other items yet.'}</p>}
      </div>
      <p className="outline-move-preview" role="status">{!valid ? 'Choose another destination.' : unchanged ? 'Already in this location.' : chosen ? <>Move inside <strong>{chosen.path} / {chosen.name}</strong></> : 'Move to the top level of Outline.'}</p>
      <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" disabled={!valid || unchanged} onClick={() => onMove(selected)}><FolderInput size={18} />Move here</button></footer>
    </div>
  </PlannerModal>;
}
