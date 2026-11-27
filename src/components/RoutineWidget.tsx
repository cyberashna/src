import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ListTree, Play, Plus, RotateCcw, Settings2, X, Check, History, Minus, Star } from 'lucide-react';
import type { RoutineTab } from '../services/routineNotes';
import { activeRoutineRun, emptyRoutineRunState, finishRoutineRun, loadRoutineRuns, routineRunKey, saveRoutineRuns, startRoutineRun, toggleRoutineRunItem, resumeRoutineRun, routineRunHistory, routineLastUsed, routineLastUsedAt, routineRunTimerId, type RoutineRunState, type RoutineRunMode } from '../services/routineRuns';
import { TileTimerButton } from './TileTimers';
import { cancelTileTimer } from '../services/tileTimers';
import { tileTimerAlarm } from '../native/tileTimerAlarm';
import './RoutineWidget.css';

const changed = 'routine-runs-changed';
function useRoutineRuns(userId: string) {
  const [state, setState] = useState(emptyRoutineRunState);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const reload = useCallback(() => {
    try { setState(loadRoutineRuns(userId)); setError(''); setReady(true); }
    catch { setReady(false); setError('Could not read saved routine runs. Your saved data has not been changed.'); }
  }, [userId]);
  useEffect(() => {
    reload();
    const update = (event: Event) => {
      if (event instanceof StorageEvent ? event.key === routineRunKey(userId) || event.key === null : (event as CustomEvent).detail === userId) reload();
    };
    window.addEventListener('storage', update); window.addEventListener(changed, update);
    return () => { window.removeEventListener('storage', update); window.removeEventListener(changed, update); };
  }, [userId, reload]);
  const change = (updater: (state: RoutineRunState) => RoutineRunState) => {
    try {
      const next = updater(loadRoutineRuns(userId));
      saveRoutineRuns(userId, next); setState(next); setError(''); setReady(true);
      window.dispatchEvent(new CustomEvent(changed, { detail: userId }));
      return true;
    } catch { setError('Could not save this change. Please try again.'); return false; }
  };
  return { state, change, error, ready, reload };
}

export function RoutineRunner({ userId, routine, onOpenOutline }: { userId: string; routine: RoutineTab; onOpenOutline?: () => void }) {
  const { state, change, error, ready, reload } = useRoutineRuns(userId);
  const [expanded, setExpanded] = useState(false);
  const [confirmFresh, setConfirmFresh] = useState(false);
  const [requestedMode, setMode] = useState<RoutineRunMode>('full');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(5);
  const [busy, setBusy] = useState(false);
  const [timerError, setTimerError] = useState('');
  const ending = useRef(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, []);
  const run = activeRoutineRun(state, routine.id);
  const history = routineRunHistory(state, routine.id);
  const lastUsedAt = routineLastUsedAt(history);
  const essentialCount = routine.items.filter(item => item.essential).length;
  const mode = essentialCount ? requestedMode : 'full';
  const count = run?.items.filter(item => item.completed).length ?? 0;
  const start = () => {
    if (change(current => startRoutineRun(current, routine, false, new Date().toISOString(), mode))) { setExpanded(true); setConfirmFresh(false); }
  };
  const resume = () => { if (run && change(current => resumeRoutineRun(current, run.id))) setExpanded(true); };
  const end = async (fresh = false) => {
    if (!run || ending.current) return;
    ending.current = true; setBusy(true); setTimerError('');
    try {
      // Cancel the alarm before ending its run, so a finished run cannot leave an orphan timer.
      await cancelTileTimer(localStorage, tileTimerAlarm, userId, routineRunTimerId(run.id));
      if (change(current => {
        if (activeRoutineRun(current, routine.id)?.id !== run.id) throw new Error('This run has changed.');
        return fresh ? startRoutineRun(current, routine, true, new Date().toISOString(), mode) : finishRoutineRun(current, run.id);
      })) { setExpanded(fresh); setConfirmFresh(false); }
    } catch { setTimerError('Could not stop the routine timer. Your run is still open; please try again.'); }
    finally { ending.current = false; setBusy(false); }
  };
  const modePicker = <div className="routine-run-modes" role="group" aria-label={`Run length for ${routine.name}`}>
    <button type="button" disabled={busy} aria-pressed={mode === 'full'} onClick={() => setMode('full')}>Full routine <span>{routine.items.length}</span></button>
    <button type="button" disabled={busy || !essentialCount} title={essentialCount ? undefined : 'Mark essential steps when editing this routine'} aria-pressed={mode === 'essentials'} onClick={() => setMode('essentials')}><Star size={14} />Just essentials <span>{essentialCount}</span></button>
  </div>;
  return <article className="routine-widget-row" aria-label={routine.name}>
    <div className="routine-widget-row-heading">
      <div><h3>{routine.name}</h3><span>{run ? `${count}/${run.items.length} checked${run.mode === 'essentials' ? ' - essentials' : ''}` : `${routine.items.length} steps`}</span>
        <time className="routine-last-used" dateTime={lastUsedAt} title={lastUsedAt ? new Date(lastUsedAt).toLocaleString() : undefined}>{ready ? routineLastUsed(lastUsedAt, now) : 'Loading...'}</time>
      </div>
      <div className="routine-widget-row-actions">
        {onOpenOutline && <button type="button" onClick={onOpenOutline} title={`Open ${routine.name} in Outline`} aria-label={`Open ${routine.name} in Outline`}><ListTree size={18} /></button>}
        {run && expanded ? <button type="button" disabled={busy} aria-expanded={true} onClick={() => { setExpanded(false); setConfirmFresh(false); }} title={`Collapse ${routine.name}`} aria-label={`Collapse ${routine.name}`}><ChevronUp size={18} /></button>
          : <button type="button" aria-expanded={run ? false : undefined} disabled={busy || !ready || (!run && !routine.items.length)} onClick={() => run ? resume() : start()} aria-label={`${run ? 'Resume' : 'Start'} ${routine.name}`}><Play size={16} />{run ? 'Resume' : 'Start'}</button>}
      </div>
    </div>
    {!run && <>{modePicker}<p className="routine-widget-preview">{routine.items.length ? (mode === 'essentials' ? routine.items.filter(item => item.essential) : routine.items).slice(0, 2).map(item => item.label).join(' / ') : 'No checklist steps yet.'}</p></>}
    {run && expanded && <div className="routine-run-checklist">
      {run.notes && <p className="routine-run-notes">{run.notes}</p>}
      {run.items.map(item => <label key={item.id} className="routine-run-step"><input type="checkbox" disabled={busy} checked={item.completed} onChange={() => change(current => toggleRoutineRunItem(current, run.id, item.id))} /><span className={item.completed ? 'is-complete' : ''}>{item.label}</span>{item.essential && <Star size={14} role="img" aria-label="Essential" className="routine-essential-mark" />}</label>)}
      <div className="routine-run-footer"><button type="button" disabled={busy} onClick={() => void end()}><Check size={16} />{busy ? 'Saving...' : 'Finish run'}</button><button type="button" disabled={busy || !routine.items.length} onClick={() => setConfirmFresh(true)}><RotateCcw size={16} />Start fresh</button>
        <fieldset className="routine-timer-control" disabled={busy}><TileTimerButton blockId={routineRunTimerId(run.id)} name={`${run.name} routine`} menu /></fieldset>
      </div>
      {confirmFresh && <div className="routine-run-confirm" role="group" aria-label="Start fresh confirmation"><p>End this run and start a new checklist? This run's progress will be kept.</p>{modePicker}<button type="button" disabled={busy} onClick={() => setConfirmFresh(false)}>Keep this run</button><button type="button" disabled={busy} onClick={() => void end(true)}>Start new run</button></div>}
    </div>}
    <button type="button" className="routine-history-toggle" aria-expanded={historyOpen} disabled={!ready} onClick={() => setHistoryOpen(value => !value)}><History size={16} />Recent runs{history.length > 0 && <span>{history.length}</span>}</button>
    {historyOpen && <section className="routine-history" aria-label={`Recent runs for ${routine.name}`}>
      {!history.length && <p className="quiet-empty">No runs yet.</p>}
      {history.slice(0, historyLimit).map(entry => <details key={entry.id} className="routine-history-entry">
        <summary><time dateTime={entry.startedAt}>{new Date(entry.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
          <span>{entry.finishedAt ? entry.outcome === 'replaced' ? 'Started fresh' : 'Finished' : 'In progress'} / {entry.mode === 'essentials' ? 'Just essentials' : 'Full routine'} / {entry.items.filter(item => item.completed).length}/{entry.items.length} checked</span>
        </summary>
        <ul>{entry.items.map(item => <li key={item.id}>{item.completed ? <Check size={16} role="img" aria-label="Checked" /> : <Minus size={16} role="img" aria-label="Left open" />}<span>{item.label}</span>{item.essential && <Star size={14} role="img" aria-label="Essential" />}</li>)}</ul>
      </details>)}
      {historyLimit < history.length && <button type="button" onClick={() => setHistoryLimit(value => value + 5)}>Show earlier runs</button>}
    </section>}
    {timerError && <p role="alert">{timerError}</p>}
    {error && <p role="alert">{error} {!ready && <button type="button" onClick={reload}>Retry</button>}</p>}
  </article>;
}

export function RoutineWidget({ userId, routines, onOpenOutline }: { userId: string; routines: RoutineTab[]; onOpenOutline: (routineId?: string) => void }) {
  const { state, change, error, ready, reload } = useRoutineRuns(userId);
  const [choosing, setChoosing] = useState(false);
  const pinned = routines.filter(routine => state.pinnedRoutineIds.includes(routine.id));
  return <section className="today-section routine-widget" aria-label="Routine widget">
    <header><h2>Routines</h2><div className="routine-widget-row-actions">
      {state.visible ? <><button type="button" onClick={() => setChoosing(value => !value)} aria-expanded={choosing} title="Choose routines" aria-label="Choose routines"><Settings2 size={18} /></button><button type="button" onClick={() => change(current => ({ ...current, visible: false }))} title="Hide routine widget" aria-label="Hide routine widget"><X size={18} /></button></>
        : <button type="button" disabled={!ready} onClick={() => { if (change(current => ({ ...current, visible: true }))) setChoosing(pinned.length === 0); }}><Plus size={16} />Add widget</button>}
    </div></header>
    {state.visible && <>
      {choosing && <div className="routine-widget-picker" role="group" aria-label="Pinned routines">
        {routines.map(routine => <label key={routine.id} className="routine-run-step"><input type="checkbox" checked={state.pinnedRoutineIds.includes(routine.id)} onChange={() => change(current => ({ ...current, pinnedRoutineIds: current.pinnedRoutineIds.includes(routine.id) ? current.pinnedRoutineIds.filter(id => id !== routine.id) : [...current.pinnedRoutineIds, routine.id] }))} /><span>{routine.name}</span></label>)}
        <button type="button" onClick={() => setChoosing(false)}><ChevronDown size={16} />Done</button>
      </div>}
      {pinned.map(routine => <RoutineRunner key={`${userId}:${routine.id}`} userId={userId} routine={routine} onOpenOutline={() => onOpenOutline(routine.id)} />)}
      {pinned.length === 0 && <p className="quiet-empty">{routines.length ? 'No routines pinned.' : 'No routines yet.'}</p>}
      <button type="button" onClick={() => onOpenOutline()}><ListTree size={16} />Outline</button>
    </>}
    {error && <p role="alert">{error} {!ready && <button type="button" onClick={reload}>Retry</button>}</p>}
  </section>;
}
