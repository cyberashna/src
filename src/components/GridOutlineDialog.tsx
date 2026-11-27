import { useRef, useState } from 'react';
import { CalendarClock, ListTree, CheckSquare, StickyNote, Repeat2 } from 'lucide-react';
import { PlannerModal } from './PlannerShell';
import type { GridOutlineChoice } from '../services/gridOutline';
import { TileTimerButton } from './TileTimers';

export function GridOutlineDialog({ blockId, name, initialKind, currentType, destinations, existing, onSave, onChangeType, onOpen, onReschedule, onClose }: {
  blockId?: string;
  name: string; initialKind: GridOutlineChoice['kind']; destinations: { id: string; label: string }[];
  currentType: string;
  existing?: { inTrash: boolean }; onSave: (choice: GridOutlineChoice) => Promise<void>;
  onChangeType: (kind: 'task' | 'note') => Promise<void>;
  onOpen: () => void; onReschedule: () => void; onClose: () => void;
}) {
  const [choice, setChoice] = useState<GridOutlineChoice>({ kind: initialKind, parentId: '', target: 3, frequency: 'weekly' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [addToOutline, setAddToOutline] = useState(!existing && initialKind === 'habit');
  const [typeSelected, setTypeSelected] = useState(false);
  const saving = useRef(false);
  const protectedType = ['Habit', 'Routine', 'Workout'].includes(currentType);
  const blocked = !!existing?.inTrash || protectedType;
  return <PlannerModal title="Calendar item" onClose={onClose} busy={busy}>
    <form className="capture-form grid-outline-form" onSubmit={async event => {
      event.preventDefault(); if (saving.current) return;
      saving.current = true; setBusy(true); setError('');
      try {
        if (blocked && !(currentType === 'Habit' && !existing && addToOutline)) return;
        if (!existing && addToOutline) await onSave(choice);
        else if (choice.kind !== 'habit') await onChangeType(choice.kind);
        else throw new Error('Save a new habit to Outline to give it a goal and history.');
        onClose();
      }
      catch (error) { setError(error instanceof Error ? error.message : 'Could not save. Your choices are still here; please retry.'); }
      finally { saving.current = false; setBusy(false); }
    }}>
      <strong className="planner-note-title">{name}</strong>
      <span className="grid-current-type">{currentType}</span>
      <button className="grid-reschedule" type="button" disabled={busy} onClick={onReschedule}><CalendarClock size={18} />Reschedule</button>
      {blockId && <TileTimerButton blockId={blockId} name={name} menu beforeOpen={onClose} />}
      <fieldset disabled={busy || blocked}>
        <legend>Change type</legend>
        <div className="capture-kinds" role="group" aria-label="Card type">{([{ kind: 'task', name: 'Task', Icon: CheckSquare }, { kind: 'note', name: 'Note', Icon: StickyNote }, { kind: 'habit', name: 'Habit', Icon: Repeat2 }] as const).map(({ kind, name, Icon }) => <button type="button" key={kind} disabled={kind === 'habit' && !!existing && initialKind !== 'habit'} aria-pressed={(typeSelected || currentType.toLowerCase() === choice.kind) && choice.kind === kind} onClick={() => { setTypeSelected(true); setError(''); setChoice({ ...choice, kind }); if (kind === 'habit') setAddToOutline(true); }}><Icon size={18} />{name}</button>)}</div>
      </fieldset>
      {protectedType && <p role="status">This {currentType.toLowerCase()} keeps its linked history. Its type is protected.</p>}
      {existing ? <>
        <p>{existing.inTrash ? 'This item is in Outline\'s Trash. Restore it there before adding it again.' : 'This item is already linked to Outline.'}</p>
        {!existing.inTrash && <button type="button" onClick={onOpen}><ListTree size={18} />Open in Outline</button>}
      </> : <fieldset disabled={busy || (protectedType && currentType !== 'Habit')}>
        <label className="grid-outline-toggle"><input type="checkbox" checked={addToOutline} disabled={choice.kind === 'habit'} onChange={event => setAddToOutline(event.target.checked)} />Save to Outline</label>
        {addToOutline && <>
        <label>Place in<select value={choice.parentId} onChange={event => setChoice({ ...choice, parentId: event.target.value })}><option value="">Outline (top level)</option>{destinations.map(parent => <option key={parent.id} value={parent.id}>{parent.label}</option>)}</select></label>
        {choice.kind === 'habit' && <div className="planner-form-pair"><label>Goal<input type="number" min={1} required value={choice.target} onChange={event => setChoice({ ...choice, target: Number(event.target.value) })} /></label><label>Frequency<select value={choice.frequency} onChange={event => setChoice({ ...choice, frequency: event.target.value as GridOutlineChoice['frequency'] })}>{['daily', 'weekly', 'monthly', 'none'].map(frequency => <option key={frequency}>{frequency}</option>)}</select></label></div>}
        </>}
      </fieldset>}
      {error && <p role="alert">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button>{(!blocked || (currentType === 'Habit' && !existing && addToOutline)) && <button type="submit" disabled={busy || (!typeSelected && !addToOutline)}>{busy ? 'Saving...' : addToOutline && !existing ? 'Add to Outline' : 'Save type'}</button>}</footer>
    </form>
  </PlannerModal>;
}
