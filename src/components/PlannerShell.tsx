import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, ListTree, Sun, MoreHorizontal, Plus, X, CalendarClock, ChevronRight, ArrowLeft, StickyNote, CheckSquare, Repeat2 } from 'lucide-react';
import type { RoutineTab } from '../services/routineNotes';
import type { OutlineFrequency } from '../services/planningOutliner';
import { planningDate } from '../services/planningDate';
import { Link2 } from 'lucide-react';
import { ReadingLinkFields } from './ReadingLink';
import { publicWebUrl, readingSite, type ReadingLink } from '../services/readingLinks';

export type MainView = 'today' | 'planner' | 'themes';
export type PlanView = 'day' | 'week' | 'stack';
export type PlanMode = 'week' | 'day' | 'time';
export type PlanChoice = { id: string; name: string; kind: string; section: 'Outline' | 'Waiting'; weeklyTarget?: number };
export type NewPlannerItem = { kind: 'task' | 'note' | 'habit' | 'routine' | 'theme' | 'link'; readingLink?: ReadingLink; name: string; notes: string; themeId: string; parentId?: string | null; target: number; frequency: OutlineFrequency; waiting: boolean };

export function PlannerNavigation({ view, onView, onAdd, more, onMore }: { view: MainView; onView: (view: MainView) => void; onAdd: () => void; more: ReactNode; onMore: () => void }) {
  return <header className="planner-navigation">
    <span className="planner-brand">Habit Care Planner</span>
    <nav aria-label="Main navigation">
      {([{ id: 'themes', label: 'Outline', Icon: ListTree }, { id: 'today', label: 'Today', Icon: Sun }, { id: 'planner', label: 'Plan', Icon: CalendarDays }] as const).map(({ id, label, Icon }) =>
        <button key={id} type="button" aria-current={view === id ? 'page' : undefined} onClick={() => onView(id)}><Icon size={18} /><span>{label}</span></button>)}
      <button type="button" onClick={onMore} aria-expanded={!!more}><MoreHorizontal size={18} /><span>More</span></button>
    </nav>
    <button className="planner-add" type="button" onClick={onAdd}><Plus size={18} /> Capture</button>
    {more && <div className="planner-more">{more}</div>}
  </header>;
}

export function PlannerModal({ title, onClose, children, busy = false }: { title: string; onClose: () => void; children: ReactNode; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="planner-dialog" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} aria-label={title} onClick={event => { if (!busy && event.target === event.currentTarget) onClose(); }}>
    <div className="planner-dialog-content"><header><h2>{title}</h2><button type="button" className="icon-button" disabled={busy} onClick={onClose} title="Close" aria-label="Close"><X size={20} /></button></header>{children}</div>
  </dialog>;
}

export function PlanItemDialog({ choices, initialId, initialDate, initialTime, initialMode, initialTarget, rescheduling = false, allowLoose = !rescheduling, slots, onSave, onClose }: { choices: PlanChoice[]; initialId?: string; initialDate: string; initialTime?: number; initialMode?: PlanMode; initialTarget?: number; rescheduling?: boolean; allowLoose?: boolean; slots: string[]; onSave: (id: string, date: string, timeIndex: number | null, mode: PlanMode, targetCount?: number) => Promise<void>; onClose: () => void }) {
  const [id, setId] = useState(initialId ?? '');
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime === undefined ? '' : String(initialTime));
  const [count, setCount] = useState(String(initialTarget ?? choices.find(item => item.id === initialId)?.weeklyTarget ?? 1));
  const [requestedMode, setMode] = useState<PlanMode>(initialMode ?? (rescheduling || initialTime !== undefined ? 'time' : 'week'));
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(!initialId);
  const [saved, setSaved] = useState('');
  const saving = useRef(false);
  // Waiting may gain an Outline identity during a partial save. Keep its original
  // selection available so Retry still submits the same source block.
  const retainedChoice = useRef<PlanChoice | undefined>(choices.find(item => item.id === initialId));
  const currentChoice = choices.find(item => item.id === id);
  if (currentChoice) retainedChoice.current = currentChoice;
  const selected = currentChoice ?? (retainedChoice.current?.id === id ? retainedChoice.current : undefined);
  const availableChoices = selected && !currentChoice ? [selected, ...choices] : choices;
  const repeating = selected?.kind === 'habit' || selected?.kind === 'routine';
  const canPlanWeek = allowLoose;
  const chooseItem = (nextId: string) => { setId(nextId); setCount(String(choices.find(item => item.id === nextId)?.weeklyTarget ?? 1)); };
  const mode = !allowLoose ? 'time' : requestedMode === 'week' && !canPlanWeek ? 'day' : requestedMode;
  let weekStart = '';
  let weekRange = '';
  try {
    weekStart = planningDate(date).weekStartDate;
    const start = new Date(`${weekStart}T12:00:00`);
    const end = new Date(start); end.setDate(end.getDate() + 6);
    const format = (value: Date) => value.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    weekRange = `${format(start)} - ${format(end)}`;
  } catch { /* Leave an incomplete date editable; native validation prevents submission. */ }
  const visibleChoices = availableChoices.filter(item => item.id === id || item.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <PlannerModal title={rescheduling ? 'Reschedule' : 'Plan'} busy={busy} onClose={onClose}>
    <form className="plan-item-form" data-picking={picking} onSubmit={async event => {
      event.preventDefault();
      if (saving.current) return;
      const values = new FormData(event.currentTarget);
      const selectedTime = String(values.get('time') ?? '');
      const another = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'another';
      saving.current = true; setBusy(true); setError(''); setSaved('');
      try {
        await onSave(String(values.get('item')), String(values.get('day')), mode === 'time' && selectedTime !== '' ? Number(selectedTime) : null, mode, repeating && mode === 'week' && !rescheduling ? Number(values.get('count')) : undefined);
        if (another) { setSaved(`${selected?.name ?? 'Item'} saved`); setId(''); setQuery(''); setPicking(true); }
        else onClose();
      } catch (error) { setError(error instanceof Error ? error.message : 'Could not save. Please try again.'); }
      finally { saving.current = false; setBusy(false); }
    }}>
      {saved && <p className="planner-save-status" role="status">{saved}</p>}
      <div className="plan-choice-search">{!initialId && <label>Find an item<input type="search" value={query} disabled={busy} onChange={event => setQuery(event.target.value)} placeholder="Search Outline and Waiting" /></label>}</div>
      <label className="plan-desktop-choice">Item<select name="item" required disabled={busy} value={id} onChange={event => chooseItem(event.target.value)}><option value="">Choose an item</option>{(['Outline', 'Waiting'] as const).map(section => {
        const items = visibleChoices.filter(item => item.section === section);
        return items.length > 0 && <optgroup key={section} label={section}>{items.map(item => <option key={item.id} value={item.id}>{item.name} ({item.kind})</option>)}</optgroup>;
      })}</select></label>
      <div className="plan-mobile-picker">{(['Waiting', 'Outline'] as const).map(section => {
        const items = visibleChoices.filter(item => item.section === section);
        return items.length > 0 && <section key={section} aria-label={section}><h3>{section} <span>{items.length}</span></h3>{items.map(item => <button type="button" key={item.id} disabled={busy} className="plan-choice-row" onClick={() => { chooseItem(item.id); setPicking(false); setError(''); }}><span><strong>{item.name}</strong><small>{item.kind}</small></span><ChevronRight size={18} /></button>)}</section>;
      })}{visibleChoices.length === 0 && <p className="quiet-empty">{query ? 'No matching items.' : 'No items to plan yet.'}</p>}</div>
      <div className="plan-mobile-selection">{!rescheduling && <button type="button" disabled={busy} onClick={() => setPicking(true)}><ArrowLeft size={18} /> Change item</button>}<strong>{selected?.name}</strong></div>
      <div className="plan-mode-control" role="group" aria-label="Planning precision">
        {(['week', 'day', 'time'] as const).map(value => <button type="button" key={value} aria-pressed={mode === value}
          disabled={busy || (value !== 'time' && !allowLoose) || (value === 'week' && !canPlanWeek)}
          title={value === 'week' && !canPlanWeek ? 'Choose a day or time for this item' : undefined}
          onClick={() => { setMode(value); setError(''); }}>{value === 'week' ? 'Week' : value === 'day' ? 'Day' : 'Time'}</button>)}
      </div>
      <label className="plan-date-field">{mode === 'week' ? 'Week of' : 'Day'}<input name="day" type="date" required disabled={busy} value={mode === 'week' ? weekStart || date : date} onInput={event => setDate(event.currentTarget.value)} onChange={event => setDate(event.target.value)} />
        {mode === 'week' && weekRange && <span className="plan-week-range">{weekRange}</span>}
      </label>
      {mode === 'time' && <label className="plan-date-field">Time<select name="time" required disabled={busy} value={time} onChange={event => setTime(event.target.value)}><option value="" disabled>Choose a time</option>{slots.map((slot, index) => <option key={slot} value={index}>{slot}</option>)}</select></label>}
      {repeating && mode === 'week' && !rescheduling && <label className="plan-date-field">Sessions this week<input name="count" type="number" min="1" step="1" required disabled={busy} value={count} onChange={event => setCount(event.target.value)} /></label>}
      {error && <p role="alert">{error}</p>}
      <footer className="plan-save-actions"><button type="button" onClick={onClose} disabled={busy}>Cancel</button>{!initialId && <button type="submit" value="another" className="plan-another" disabled={busy || !id}>Save & add another</button>}<button type="submit" disabled={busy || !id}>{busy ? 'Saving...' : mode === 'week' ? 'Plan for week' : mode === 'day' ? 'Plan for day' : 'Schedule'}</button></footer>
    </form>
  </PlannerModal>;
}

export function AddPlannerDialog({ themes, open = true, initialKind = 'task', initialThemeId = '', onSave, onView, onClose }: { themes: { id: string; name: string }[]; open?: boolean; initialKind?: 'task' | 'note' | 'habit'; initialThemeId?: string; onSave: (item: NewPlannerItem) => Promise<string>; onView: (id: string) => void; onClose: () => void }) {
  const [item, setItem] = useState<NewPlannerItem>({ kind: initialKind, name: '', notes: '', themeId: initialThemeId, target: 3, frequency: 'weekly', waiting: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<{ id: string; name: string; destination: string } | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  useEffect(() => {
    if (open) setItem(current => current.name ? current : { ...current, kind: initialKind, themeId: initialThemeId });
    const frame = requestAnimationFrame(() => { if (open) nameInput.current?.focus({ preventScroll: true }); });
    return () => cancelAnimationFrame(frame);
  }, [open, initialThemeId, initialKind]);
  if (!open) return null;
  return <PlannerModal title="Capture" busy={busy} onClose={onClose}>
    <form className="capture-form" onSubmit={async event => {
      event.preventDefault();
      if (saving.current || !item.name.trim()) return;
      saving.current = true; setBusy(true); setError('');
      try {
        const id = await onSave({ ...item, name: item.name.trim() });
        setSaved({ id, name: item.name.trim(), destination: themes.find(theme => theme.id === item.themeId)?.name ?? 'Outline' });
        setItem(current => ({ ...current, name: '', notes: '', readingLink: undefined }));
      } catch (error) { setError(error instanceof Error ? error.message : 'Could not save. Your capture is still here.'); }
      finally { saving.current = false; setBusy(false); requestAnimationFrame(() => nameInput.current?.focus()); }
    }}>
      <fieldset disabled={busy}>
        <div className="capture-kinds" role="group" aria-label="Capture type">
          {([{ kind: 'task', label: 'Task', Icon: CheckSquare }, { kind: 'note', label: 'Note', Icon: StickyNote }, { kind: 'habit', label: 'Habit', Icon: Repeat2 }, { kind: 'link', label: 'Link', Icon: Link2 }] as const).map(({ kind, label, Icon }) =>
            <button key={kind} type="button" aria-pressed={item.kind === kind} onClick={() => setItem({ ...item, kind })}><Icon size={18} />{label}</button>)}
        </div>
        <label>{item.kind === 'theme' ? 'Theme name' : item.kind === 'routine' ? 'Routine name' : item.kind === 'link' ? 'Title' : 'Capture'}<input ref={nameInput} required autoFocus autoComplete="off" value={item.name} onPaste={event => {
          const url = publicWebUrl(event.clipboardData.getData('text/plain'));
          if (url && ['task', 'note', 'link'].includes(item.kind)) { event.preventDefault(); setItem(current => ({ ...current, kind: 'link', name: readingSite(url), readingLink: { url } })); setSaved(null); }
        }} onChange={event => { setItem({ ...item, name: event.target.value }); setSaved(null); }} placeholder={item.kind === 'task' ? 'What needs doing?' : item.kind === 'note' ? 'What is on your mind?' : item.kind === 'habit' ? 'What would you like to keep doing?' : 'Name'} /></label>
        {item.kind === 'link' && <ReadingLinkFields value={item.readingLink ?? { url: '' }} title={item.name} disabled={busy} onChange={readingLink => setItem(current => ({ ...current, readingLink }))} onTitle={name => setItem(current => ({ ...current, name }))} />}
        {item.kind !== 'theme' && <label>In Outline<select value={item.themeId} onChange={event => setItem({ ...item, themeId: event.target.value })}><option value="">No theme yet</option>{themes.map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label>}
        {item.kind === 'habit' && <div className="planner-form-pair"><label>Goal<input type="number" min={1} required value={item.target} onChange={event => setItem({ ...item, target: Number(event.target.value) })} /></label><label>Frequency<select value={item.frequency} onChange={event => setItem({ ...item, frequency: event.target.value as OutlineFrequency })}>{['daily', 'weekly', 'monthly', 'none'].map(value => <option key={value}>{value}</option>)}</select></label></div>}
        {item.kind === 'routine' ? <label>Checklist<textarea rows={4} value={item.notes} onChange={event => setItem({ ...item, notes: event.target.value })} placeholder="One item per line" /></label> : <details className="capture-details"><summary>Details</summary><label>Notes<textarea rows={3} value={item.notes} onChange={event => setItem({ ...item, notes: event.target.value })} /></label></details>}
        <details className="capture-details"><summary>New theme or routine</summary><div className="capture-kinds"><button type="button" aria-pressed={item.kind === 'theme'} onClick={() => setItem({ ...item, kind: 'theme', themeId: '' })}>Theme</button><button type="button" aria-pressed={item.kind === 'routine'} onClick={() => setItem({ ...item, kind: 'routine' })}>Routine</button></div></details>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {saved && <div className="capture-saved"><p role="status">Saved {saved.name} to {saved.destination}.</p><button type="button" disabled={busy} onClick={() => onView(saved.id)}>View in Outline</button></div>}
      <footer><button type="button" disabled={busy} onClick={onClose}>Done</button><button type="submit" disabled={busy || !item.name.trim()}><Plus size={18} />{busy ? 'Saving...' : 'Capture & next'}</button></footer>
    </form>
  </PlannerModal>;
}

export function AddToRoutineDialog({ name, routines, onSave, onClose }: { name: string; routines: RoutineTab[]; onSave: (routineId: string) => Promise<void>; onClose: () => void }) {
  const [routineId, setRoutineId] = useState(routines[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  return <PlannerModal title="Add to routine" busy={busy} onClose={onClose}><form onSubmit={async event => {
    event.preventDefault(); if (saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try { await onSave(routineId); onClose(); } catch (error) { setError(error instanceof Error ? error.message : 'Could not add to routine.'); }
    finally { saving.current = false; setBusy(false); }
  }}><strong>{name}</strong><label>Routine<select required disabled={busy} value={routineId} onChange={event => setRoutineId(event.target.value)}>{routines.map(routine => <option key={routine.id} value={routine.id}>{routine.name}</option>)}</select></label>
    {!routines.length && <p>No routines yet.</p>}{error && <p role="alert">{error}</p>}
    <footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" disabled={busy || !routineId}>{busy ? 'Saving...' : 'Add to routine'}</button></footer>
  </form></PlannerModal>;
}
export function TodayHome({ date, blocks, anytime, waiting, routineWidget, onDone, onAnytimeDone, onPlan, onReschedule, onNote, onOpenPlan }: { date: string; blocks: { id: string; name: string; time: string; completed: boolean }[]; anytime: { id: string; name: string; canComplete: boolean }[]; waiting: { id: string; name: string }[]; routineWidget?: ReactNode; onDone: (id: string) => void; onAnytimeDone: (id: string) => void; onPlan: (id: string) => void; onReschedule: (id: string) => void; onNote: (id: string) => void; onOpenPlan: () => void }) {
  const next = blocks.find(block => !block.completed);
  return <main className="today-home">
    <header><div><h1>Today</h1><p>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p></div><button onClick={onOpenPlan} type="button"><CalendarDays size={16} /> Plan</button></header>
    <section className="today-now"><span>Up next</span><h2>{next?.name ?? 'A little room in your day'}</h2>{next && <div><span>{next.time}</span><button type="button" onClick={() => onDone(next.id)}>Done</button></div>}</section>
    {routineWidget}
    {anytime.length > 0 && <section className="today-section today-anytime"><h2>Any time <small>{anytime.length}</small></h2>{anytime.map(item => <div className="today-list-row today-action-row" key={item.id}>{item.canComplete && <input type="checkbox" checked={false} onChange={() => onAnytimeDone(item.id)} aria-label={`Complete ${item.name}`} />}<span>{item.name}</span><div className="today-row-actions"><button type="button" onClick={() => onNote(item.id)} title={`Notes for ${item.name}`} aria-label={`Notes for ${item.name}`}><StickyNote size={18} /></button><button type="button" onClick={() => onPlan(item.id)} title={`Plan ${item.name}`} aria-label={`Plan ${item.name}`}><CalendarClock size={18} /></button></div></div>)}</section>}
    <section className="today-section"><h2>Schedule <small>{blocks.filter(b => b.completed).length}/{blocks.length}</small></h2>{blocks.length === 0 ? <p className="quiet-empty">Nothing scheduled.</p> : blocks.map(block => <div className="today-list-row today-action-row" key={block.id}><input type="checkbox" checked={block.completed} onChange={() => onDone(block.id)} aria-label={`Complete ${block.name}`} /><span className={block.completed ? 'is-complete' : ''}>{block.name}<time>{block.time}</time></span><div className="today-row-actions"><button type="button" onClick={() => onNote(`block:${block.id}`)} title={`Notes for ${block.name}`} aria-label={`Notes for ${block.name}`}><StickyNote size={18} /></button><button type="button" onClick={() => onReschedule(block.id)} title={`Reschedule ${block.name}`} aria-label={`Reschedule ${block.name}`}><CalendarClock size={18} /></button></div></div>)}</section>
    <details className="today-section today-disclosure"><summary>Waiting <small>{waiting.length}</small></summary>{waiting.length === 0 && <p className="quiet-empty">Nothing waiting.</p>}{waiting.slice(0, 5).map(item => <div className="today-list-row" key={item.id}><span>{item.name}</span><button type="button" onClick={() => onPlan(item.id)} title={`Plan ${item.name}`} aria-label={`Plan ${item.name}`}><CalendarClock size={18} /></button></div>)}{waiting.length > 5 && <button type="button" onClick={onOpenPlan}>View all</button>}</details>
  </main>;
}

export function PlannerNoteDialog({ name, onLoad, onSave, onClose, occurrence, outlineCopy }: {
  name: string; onLoad: () => Promise<string>; onSave: (content: string) => Promise<void>; onClose: () => void;
  occurrence?: boolean;
  outlineCopy?: { destinations: { id: string; label: string }[]; initialParentId: string;
    onSave: (draft: { id: string; title: string; content: string; parentId: string }) => Promise<void> };
}) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  const [copying, setCopying] = useState(false);
  const [title, setTitle] = useState(`${name}: note`);
  const [parentId, setParentId] = useState(outlineCopy?.initialParentId ?? '');
  const saving = useRef(false);
  const copyDraft = useRef<{ id: string; title: string; content: string; parentId: string } | null>(null);
  const load = useRef(onLoad);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    load.current().then(value => { if (!cancelled) { setContent(value); setLoaded(true); } }).catch(() => { if (!cancelled) setError('Could not load this note. Please retry.'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [retry]);
  return <PlannerModal title={occurrence ? 'Note for this occurrence' : 'Notes'} busy={busy} onClose={onClose}><form className="occurrence-note-form" onSubmit={async event => {
    event.preventDefault(); if (saving.current || !loaded) return;
    if (copying && (!outlineCopy || !title.trim() || !content.trim())) return;
    saving.current = true;
    setBusy(true); setError('');
    try {
      if (copying && outlineCopy) {
        const draft = copyDraft.current ?? { id: `occurrence-note:${crypto.randomUUID()}`, title: title.trim(), content, parentId };
        copyDraft.current = draft;
        await onSave(draft.content);
        await outlineCopy.onSave(draft);
      } else await onSave(content);
      onClose();
    }
    catch { setError('Could not save. Your text is still here; please retry.'); }
    finally { saving.current = false; setBusy(false); }
  }}><strong className="planner-note-title">{name}</strong>{loading ? <p role="status">Loading note...</p> : loaded && <label>Note<textarea rows={7} value={content} disabled={busy || !!copyDraft.current} onChange={event => setContent(event.target.value)} /></label>}
    {copying && outlineCopy && <fieldset disabled={busy || !!copyDraft.current}>
      <legend>Save a separate note to Outline</legend>
      <label>Outline title<input required value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label>Place in<select value={parentId} onChange={event => setParentId(event.target.value)}><option value="">Outline (top level)</option>{outlineCopy.destinations.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    </fieldset>}
    {error && <p role="alert">{error}</p>}{!loading && !loaded && <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button>}
    {!copying && outlineCopy && <button className="occurrence-outline-action" type="button" disabled={busy || !loaded || !content.trim()} onClick={() => setCopying(true)}><ListTree size={18} />Save to Outline</button>}
    <footer>{copying && !copyDraft.current && <button type="button" disabled={busy} onClick={() => setCopying(false)}>Back</button>}<button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" disabled={busy || !loaded || (copying && (!content.trim() || !title.trim()))}>{busy ? 'Saving...' : copying ? copyDraft.current ? 'Retry save to Outline' : 'Save to Outline' : occurrence ? 'Save occurrence note' : 'Save note'}</button></footer>
  </form></PlannerModal>;
}

export function PlannerConnectionStatus() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return online ? null : <p className="planner-connection-status" role="status">Offline. Changes may not save.</p>;
}
