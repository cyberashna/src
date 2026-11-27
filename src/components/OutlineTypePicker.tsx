import { useEffect, useRef, useState } from 'react';
import { CheckSquare, StickyNote, Repeat2, Folder, Link2, Unlink } from 'lucide-react';
import type { OutlineNode } from '../services/planningOutliner';
import { canUnlinkOutlinePlanning, hasOutlinePlanningLinks, outlinePlanningKey, outlineCardType, outlineTypeRestriction, type OutlineCardType, type OutlinePlanningDetail } from '../services/cardTypes';

export function OutlineTypePicker({ node, onChange, onLoadPlanning, onUnlinkPlanning }: {
  node: OutlineNode; onChange: (kind: OutlineCardType) => Promise<void>;
  onLoadPlanning?: (node: OutlineNode) => Promise<OutlinePlanningDetail[]>;
  onUnlinkPlanning?: (node: OutlineNode, makeGroup: boolean) => Promise<void>;
}) {
  const [kind, setKind] = useState(outlineCardType(node));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const [planning, setPlanning] = useState<{ key: string; details: OutlinePlanningDetail[] } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const planningKey = outlinePlanningKey(node);
  const hasPlanning = hasOutlinePlanningLinks(node);
  const latest = useRef({ node, onLoadPlanning }); latest.current = { node, onLoadPlanning };
  useEffect(() => {
    let cancelled = false;
    setConfirm(false); setLoadError(''); setPlanning(null);
    if (hasPlanning && latest.current.onLoadPlanning) {
      void latest.current.onLoadPlanning(latest.current.node).then(details => {
        if (!cancelled) setPlanning({ key: planningKey, details });
      }, () => { if (!cancelled) setLoadError('Could not check linked items. Retry before unlinking.'); });
    }
    return () => { cancelled = true; };
  }, [planningKey, hasPlanning, retry]);
  const restriction = outlineTypeRestriction(node, kind);
  return <fieldset className="outline-type-picker" disabled={busy}>
    <legend>Change type</legend>
    <div className="capture-kinds" role="group" aria-label="Item type">
      {([{ kind: 'task', label: 'Task', Icon: CheckSquare }, { kind: 'note', label: 'Note', Icon: StickyNote }, { kind: 'habit', label: 'Habit', Icon: Repeat2 }, { kind: 'group', label: 'Group', Icon: Folder }, { kind: 'link', label: 'Link', Icon: Link2 }] as const).map(option => <button type="button" key={option.kind} aria-pressed={kind === option.kind} onClick={() => { setKind(option.kind); setError(''); setConfirm(false); }}><option.Icon size={18} />{option.label}</button>)}
    </div>
    {restriction && <p role="status">{restriction}</p>}
    {hasPlanning && onLoadPlanning && <section className="outline-planning-links" aria-label="Plans and calendar links">
      <h3>Plans &amp; calendar links</h3>
      {loadError ? <><p role="alert">{loadError}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Retry checking links</button></> : planning?.key !== planningKey ? <p role="status">Checking linked items...</p> : <ul>{planning.details.map(item => <li key={item.id}><strong>{item.label}</strong><span>{item.detail}</span></li>)}</ul>}
      {onUnlinkPlanning && canUnlinkOutlinePlanning(node) && <>
        {confirm ? <>
          <p>Clear this item's week/day plans and calendar links? Existing calendar and Waiting items stay where they are. Notes and nested items stay here.</p>
          <div className="outline-planning-confirm"><button type="button" onClick={() => setConfirm(false)}>Cancel</button><button type="button" disabled={planning?.key !== planningKey || !!loadError} onClick={async () => {
            if (saving.current) return;
            saving.current = true; setBusy(true); setError('');
            try { await onUnlinkPlanning(node, kind === 'group'); setConfirm(false); }
            catch (error) { setError(error instanceof Error ? error.message : 'Could not unlink. Please retry.'); }
            finally { saving.current = false; setBusy(false); }
          }}><Unlink size={17} />{busy ? 'Saving...' : kind === 'group' ? 'Unlink and make group' : 'Confirm unlink'}</button></div>
        </> : <button type="button" disabled={planning?.key !== planningKey || !!loadError} onClick={() => { setError(''); setConfirm(true); }}><Unlink size={17} />{kind === 'group' ? 'Unlink and make group...' : 'Unlink plans...'}</button>}
      </>}
    </section>}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={!!restriction || (kind === outlineCardType(node) && !error)} onClick={async () => {
      if (saving.current) return;
      saving.current = true; setBusy(true); setError('');
      try { await onChange(kind); }
      catch (error) { setError(error instanceof Error ? error.message : 'Could not change type. Please retry.'); }
      finally { saving.current = false; setBusy(false); }
    }}>{busy ? 'Saving...' : error && !restriction ? 'Retry type change' : 'Apply type'}</button>
  </fieldset>;
}
