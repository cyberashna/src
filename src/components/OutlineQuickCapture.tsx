import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FolderInput, Plus } from 'lucide-react';
import type { OutlineNode } from '../services/planningOutliner';
import type { NewPlannerItem } from './PlannerShell';
import { OutlineDestinationPicker, outlineDestinationLabel } from './OutlineDestinationPicker';

export function OutlineQuickCapture({ nodes, userId, request, disabled, onSave, onUndo }: {
  nodes: OutlineNode[]; userId: string; request: { parentId: string | null; key: number };
  disabled?: boolean; onSave: (item: NewPlannerItem) => Promise<string>; onUndo: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'task' | 'note' | 'habit'>('task');
  const [parentId, setParentId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<{ id: string; label: string } | null>(null);
  const saving = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const destination = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!request.key || saving.current) return;
    setParentId(request.parentId); setPicking(false);
    input.current?.focus();
  }, [request]);
  return <section className="outline-quick-capture" aria-label="Rapid capture">
    <form onSubmit={async event => {
      event.preventDefault();
      if (saving.current || disabled || !name.trim()) return;
      saving.current = true; setBusy(true); setError('');
      try {
        const id = await onSave({ name: name.trim(), kind, parentId, notes: '', themeId: '', target: 3, frequency: 'weekly', waiting: false });
        setSaved({ id, label: `Added ${name.trim()} to ${outlineDestinationLabel(nodes, parentId)}` });
        setName(''); setPicking(false);
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save. Your capture is still here.'); }
      finally { saving.current = false; setBusy(false); requestAnimationFrame(() => input.current?.focus({ preventScroll: true })); }
    }}>
      <fieldset disabled={busy || disabled}>
        <div className="outline-quick-input"><input ref={input} aria-label="Capture a thought" placeholder="What's on your mind?" required autoComplete="off" value={name} onChange={event => setName(event.target.value)} /><button type="submit" disabled={!name.trim()}><Plus size={18} />{busy ? 'Saving...' : 'Save'}</button></div>
        <div className="outline-quick-options"><div role="group" aria-label="Quick capture type">{(['task', 'note', 'habit'] as const).map(value => <button type="button" key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
          <button ref={destination} type="button" className="outline-capture-destination" aria-expanded={picking} onClick={() => setPicking(!picking)}><FolderInput size={18} /><span>Put under: {outlineDestinationLabel(nodes, parentId)}</span><ChevronDown size={16} /></button>
        </div>
      </fieldset>
    </form>
    {picking && <OutlineDestinationPicker nodes={nodes} userId={userId} currentId={parentId} onChoose={id => { setParentId(id); setPicking(false); input.current?.focus({ preventScroll: true }); }} onClose={() => { setPicking(false); destination.current?.focus({ preventScroll: true }); }} />}
    {error && <p role="alert">{error}</p>}
    {saved && <div className="outline-capture-result"><span role="status">{saved.label}</span><button type="button" disabled={busy} onClick={async () => {
      if (saving.current) return; saving.current = true; setBusy(true); setError('');
      try { await onUndo(saved.id); setSaved(null); } catch { setError('Could not undo. Please retry.'); }
      finally { saving.current = false; setBusy(false); }
    }}>Undo</button></div>}
  </section>;
}
