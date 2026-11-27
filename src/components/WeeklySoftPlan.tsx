import { useRef, useState } from 'react';
import { CalendarDays, CalendarClock, ListTree, Plus, X, StickyNote, ListTodo, Repeat2, ListChecks, Pencil } from 'lucide-react';
import type { WeekPlanEntry } from '../services/softPlanning';
import { ReadingLinkCard } from './ReadingLink';

type Choice = { id: string; name: string; kind: string };
export function WeeklySoftPlan({ title, entries, choices, loading = false, onAdd, onRemove, onDay, onSchedule, onOpen, onEdit }: {
  title: string; entries: WeekPlanEntry[]; choices: Choice[]; loading?: boolean;
  onAdd: (id: string) => Promise<void>; onRemove: (entry: WeekPlanEntry) => Promise<void>;
  onDay: (entry: WeekPlanEntry) => void; onSchedule: (entry: WeekPlanEntry) => void; onOpen: (id: string) => void;
  onEdit?: (entry: WeekPlanEntry) => void;
}) {
  const [selected, setSelected] = useState<Choice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save. Please retry.'); }
    finally { saving.current = false; setBusy(false); }
  };
  const options = selected && !choices.some(choice => choice.id === selected.id) ? [selected, ...choices] : choices;
  const subtitle = entries.some(entry => entry.progress) ? 'Week intentions' : 'No day chosen';
  return <section className="weekly-soft-plan" aria-label={`${title} - ${subtitle}`} aria-busy={busy || loading}>
    <header><div><h2>{title}</h2><span>{subtitle}</span></div><span className="weekly-soft-count">{entries.length}</span></header>
    {loading ? <p className="quiet-empty" role="status">Loading plans...</p> : entries.length === 0 ? <p className="quiet-empty">No loose plans yet.</p> :
      <ul>{entries.map(entry => <li key={`${entry.node.id}:${entry.plan.id}`} draggable={entry.node.tag === 'link'} onDragStart={event => { if (entry.node.tag !== 'link') return; event.dataTransfer.setData('application/outline-node-id', entry.node.id); event.dataTransfer.setData('text/plain', `outline-link:${entry.node.id}`); event.dataTransfer.effectAllowed = 'move'; }}>
        <span className={`weekly-soft-kind weekly-soft-kind--${entry.node.tag}`} title={entry.node.linked?.routineId ? 'Routine' : entry.node.tag} aria-label={entry.node.linked?.routineId ? 'Routine' : entry.node.tag}>{entry.node.linked?.routineId ? <ListChecks size={18} /> : entry.node.tag === 'habit' ? <Repeat2 size={18} /> : entry.node.tag === 'task' ? <ListTodo size={18} /> : <StickyNote size={18} />}</span>
        <div className="weekly-soft-copy"><button type="button" disabled={busy} onClick={() => onOpen(entry.node.id)}>{entry.node.text}</button><small>{entry.path.slice(0, -1).join(' / ') || 'Outline'}</small>{entry.progress && <small className="weekly-session-progress">{entry.progress.placed} of {entry.progress.target} placed, {entry.progress.completed} completed</small>}</div>
        {entry.node.tag === 'link' && entry.node.readingLink && <ReadingLinkCard link={entry.node.readingLink} title={entry.node.text} />}
        <div className="weekly-soft-actions">
          {entry.progress && onEdit && <button type="button" disabled={busy} onClick={() => onEdit(entry)} title="Edit weekly sessions" aria-label={`Edit weekly sessions for ${entry.node.text}`}><Pencil size={18} /></button>}
          <button type="button" disabled={busy} onClick={() => onDay(entry)} title="Choose day" aria-label={`Choose day for ${entry.node.text}`}><CalendarDays size={18} /></button>
          <button type="button" disabled={busy} onClick={() => onSchedule(entry)} title="Schedule" aria-label={`Schedule ${entry.node.text}`}><CalendarClock size={18} /></button>
          <button type="button" disabled={busy} onClick={() => onOpen(entry.node.id)} title="Open in Outline" aria-label={`Open ${entry.node.text} in Outline`}><ListTree size={18} /></button>
          <button type="button" disabled={busy} onClick={() => void run(() => onRemove(entry))} title="Remove from week" aria-label={`Remove ${entry.node.text} from week`}><X size={18} /></button>
        </div>
      </li>)}</ul>}
    <form onSubmit={event => { event.preventDefault(); if (selected) void run(async () => { await onAdd(selected.id); setSelected(null); }); }}>
      <label><span>From Outline</span><select aria-label="Add Outline item to week" value={selected?.id ?? ''} disabled={busy || loading || options.length === 0} onChange={event => setSelected(options.find(choice => choice.id === event.target.value) ?? null)}>
        <option value="">{options.length ? 'Choose an item' : 'No unplanned items'}</option>
        {options.map(choice => <option key={choice.id} value={choice.id}>{choice.name} ({choice.kind})</option>)}
      </select></label>
      <button type="submit" disabled={busy || loading || !selected} aria-label="Add to week" title="Add to week"><Plus size={20} /></button>
    </form>
    {error && <p className="weekly-soft-error" role="alert">{error}</p>}
  </section>;
}
