import type { RoutineItem, RoutineTab } from './routineNotes';

export type RoutineRunMode = 'full' | 'essentials';
export type RoutineRun = {
  id: string;
  routineId: string;
  name: string;
  notes: string;
  items: (RoutineItem & { completed: boolean })[];
  startedAt: string;
  lastUsedAt?: string;
  finishedAt: string | null;
  outcome?: 'finished' | 'replaced';
  mode?: RoutineRunMode;
};
export type RoutineRunState = {
  version: 1;
  visible: boolean;
  pinnedRoutineIds: string[];
  runs: RoutineRun[];
};
export const routineRunKey = (userId: string) => `routine-runs:v1:${userId}`;
export const emptyRoutineRunState = (): RoutineRunState => ({ version: 1, visible: false, pinnedRoutineIds: [], runs: [] });
export const activeRoutineRun = (state: RoutineRunState, routineId: string) => state.runs.find(run => run.routineId === routineId && !run.finishedAt);
export const routineRunTimerId = (runId: string) => `routine-run:${runId}`;
export const routineRunHistory = (state: RoutineRunState, routineId: string) => state.runs
  .filter(run => run.routineId === routineId).slice().reverse().sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
export const routineLastUsedAt = (runs: RoutineRun[]) => runs.flatMap(run => [run.startedAt, ...(run.lastUsedAt ? [run.lastUsedAt] : []), ...(run.finishedAt ? [run.finishedAt] : [])])
  .sort((a, b) => Date.parse(b) - Date.parse(a))[0];

export function routineLastUsed(startedAt: string | undefined, now = new Date()): string {
  if (!startedAt) return 'Not used yet';
  const date = new Date(startedAt);
  if (!Number.isFinite(date.getTime())) return 'Last used date unavailable';
  const day = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  const days = Math.round((day(now) - day(date)) / 86400000);
  if (days === 0) return 'Last used today';
  if (days === 1) return 'Last used yesterday';
  if (days > 1 && days < 7) return `Last used ${date.toLocaleDateString(undefined, { weekday: 'long' })}`;
  return `Last used ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}) })}`;
}

// Runs are snapshots: editing a template or linked Outline item cannot rewrite a run.
export function startRoutineRun(state: RoutineRunState, routine: RoutineTab, fresh = false, now = new Date().toISOString(), mode: RoutineRunMode = 'full'): RoutineRunState {
  const active = activeRoutineRun(state, routine.id);
  if (active && !fresh) return state;
  const items = mode === 'essentials' ? routine.items.filter(item => item.essential) : routine.items;
  if (!items.length) throw new Error(mode === 'essentials' ? 'Mark at least one essential step before starting.' : 'Add checklist steps in Outline before starting.');
  return { ...state, runs: [...state.runs.map(run => run.id === active?.id ? { ...run, finishedAt: now, outcome: 'replaced' as const } : run), {
    id: crypto.randomUUID(), routineId: routine.id, name: routine.name, notes: routine.notes,
    items: items.map(item => ({ ...item, completed: false })), startedAt: now, lastUsedAt: now, finishedAt: null, mode,
  }] };
}
export function resumeRoutineRun(state: RoutineRunState, runId: string, now = new Date().toISOString()): RoutineRunState {
  return { ...state, runs: state.runs.map(run => run.id === runId && !run.finishedAt ? { ...run, lastUsedAt: now } : run) };
}
export function toggleRoutineRunItem(state: RoutineRunState, runId: string, itemId: string, now = new Date().toISOString()): RoutineRunState {
  return { ...state, runs: state.runs.map(run => run.id === runId && !run.finishedAt && run.items.some(item => item.id === itemId) ? { ...run, lastUsedAt: now,
    items: run.items.map(item => item.id === itemId ? { ...item, completed: !item.completed } : item),
  } : run) };
}
export function finishRoutineRun(state: RoutineRunState, runId: string, now = new Date().toISOString()): RoutineRunState {
  return { ...state, runs: state.runs.map(run => run.id === runId && !run.finishedAt ? { ...run, finishedAt: now, lastUsedAt: now, outcome: 'finished' } : run) };
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
export function loadRoutineRuns(userId: string, storage: Storage = window.localStorage): RoutineRunState {
  const saved = storage.getItem(routineRunKey(userId));
  if (!saved) return emptyRoutineRunState();
  const state = JSON.parse(saved);
  // Do not silently replace unreadable history with an empty state.
  if (state?.version !== 1 || typeof state.visible !== 'boolean' || !Array.isArray(state.pinnedRoutineIds) ||
    !state.pinnedRoutineIds.every((id: unknown) => typeof id === 'string') || !Array.isArray(state.runs) ||
    !state.runs.every((run: RoutineRun) => run && typeof run.id === 'string' && typeof run.routineId === 'string' &&
      typeof run.name === 'string' && typeof run.notes === 'string' && typeof run.startedAt === 'string' &&
      Number.isFinite(Date.parse(run.startedAt)) && (run.mode === undefined || run.mode === 'full' || run.mode === 'essentials') &&
      (run.lastUsedAt === undefined || typeof run.lastUsedAt === 'string' && Number.isFinite(Date.parse(run.lastUsedAt))) &&
      (run.finishedAt === null || typeof run.finishedAt === 'string' && Number.isFinite(Date.parse(run.finishedAt))) && Array.isArray(run.items) &&
      run.items.every(item => item && typeof item.id === 'string' && typeof item.label === 'string' && typeof item.completed === 'boolean'))) {
    throw new Error('Saved routine runs could not be read.');
  }
  return state;
}
export function saveRoutineRuns(userId: string, state: RoutineRunState, storage: Storage = window.localStorage) {
  storage.setItem(routineRunKey(userId), JSON.stringify(state));
}
