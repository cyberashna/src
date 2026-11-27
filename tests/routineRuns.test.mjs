import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/services/routineRuns.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { emptyRoutineRunState, startRoutineRun, activeRoutineRun, toggleRoutineRunItem, finishRoutineRun, loadRoutineRuns, saveRoutineRuns, routineRunKey, routineRunHistory, routineLastUsed, routineLastUsedAt, resumeRoutineRun, routineRunTimerId } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const routine = () => ({ id: 'morning', name: 'Morning', category: 'morning', notes: 'A gentle start', items: [
  { id: 'water', label: 'Water', sourceOutlineId: 'outline-water' }, { id: 'stretch', label: 'Stretch' },
], completedByDate: { '2026-10-31': ['water'] } });
const storage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

test('widget is opt-in and starting snapshots an unchecked run without changing the saved routine', () => {
  const template = routine();
  const before = structuredClone(template);
  const empty = emptyRoutineRunState();
  const state = startRoutineRun(empty, template);
  assert.equal(empty.visible, false);
  assert.deepEqual(empty.runs, []);
  assert.equal(state.runs.length, 1);
  assert.deepEqual(state.runs[0].items.map(item => item.completed), [false, false]);
  assert.equal(state.runs[0].items[0].sourceOutlineId, 'outline-water');
  assert.deepEqual(template, before);
  template.items[0].label = 'Changed'; template.items.push({ id: 'new', label: 'New' }); template.notes = 'Edited';
  assert.equal(state.runs[0].items[0].label, 'Water');
  assert.equal(state.runs[0].items.length, 2);
  assert.equal(state.runs[0].notes, 'A gentle start');
});

test('resume is idempotent and progress survives reload and a different day', () => {
  const store = storage();
  let state = startRoutineRun(emptyRoutineRunState(), routine(), false, '2026-10-31T23:58:00Z');
  const id = state.runs[0].id;
  state = toggleRoutineRunItem(state, id, 'water');
  saveRoutineRuns('one', state, store);
  state = startRoutineRun(loadRoutineRuns('one', store), routine(), false, '2026-11-02T10:00:00Z');
  assert.equal(state.runs.length, 1);
  assert.equal(activeRoutineRun(state, 'morning').id, id);
  assert.equal(state.runs[0].items[0].completed, true);
});

test('fresh run preserves old progress and starts unchecked; other routines are untouched', () => {
  let state = startRoutineRun(emptyRoutineRunState(), routine());
  state = startRoutineRun(state, { ...routine(), id: 'evening' });
  const first = state.runs[0].id;
  state = toggleRoutineRunItem(state, first, 'water');
  const next = startRoutineRun(state, routine(), true);
  assert.equal(next.runs.length, 3);
  assert.equal(next.runs[0].outcome, 'replaced');
  assert.equal(next.runs[0].items[0].completed, true);
  assert.equal(next.runs[1], state.runs[1]);
  assert.equal(next.runs[2].items[0].completed, false);
  assert.notEqual(next.runs[2].id, first);
});

test('finish accepts partial progress and the next run does not inherit checks', () => {
  let state = startRoutineRun(emptyRoutineRunState(), routine());
  const id = state.runs[0].id;
  state = toggleRoutineRunItem(state, id, 'water');
  state = finishRoutineRun(state, id);
  assert.equal(activeRoutineRun(state, 'morning'), undefined);
  assert.equal(state.runs[0].outcome, 'finished');
  assert.deepEqual(state.runs[0].items.map(item => item.completed), [true, false]);
  assert.deepEqual(toggleRoutineRunItem(state, id, 'water'), state);
  assert.deepEqual(finishRoutineRun(state, id), state);
  state = startRoutineRun(state, routine());
  assert.equal(state.runs.length, 2);
  assert.deepEqual(state.runs[1].items.map(item => item.completed), [false, false]);
});

test('hide/unpin and account switching do not lose or leak run progress', () => {
  const store = storage();
  let state = startRoutineRun({ ...emptyRoutineRunState(), visible: true, pinnedRoutineIds: ['morning'] }, routine());
  state = toggleRoutineRunItem(state, state.runs[0].id, 'water');
  saveRoutineRuns('one', { ...state, visible: false, pinnedRoutineIds: [] }, store);
  assert.deepEqual(loadRoutineRuns('two', store), emptyRoutineRunState());
  const saved = loadRoutineRuns('one', store);
  assert.equal(saved.visible, false);
  assert.deepEqual(saved.pinnedRoutineIds, []);
  assert.equal(saved.runs[0].items[0].completed, true);
});

test('storage failures and malformed history are surfaced instead of silently replacing data', () => {
  const store = storage();
  for (const bad of ['{broken', '{}', '{"version":1,"visible":true,"pinnedRoutineIds":[],"runs":[null]}']) {
    store.setItem(routineRunKey('one'), bad);
    assert.throws(() => loadRoutineRuns('one', store));
    assert.equal(store.getItem(routineRunKey('one')), bad);
  }
  assert.throws(() => saveRoutineRuns('one', emptyRoutineRunState(), { ...store, setItem() { throw new Error('Quota exceeded'); } }), /Quota/);
});

test('empty templates cannot start and starting/finishing has no calendar persistence dependency', () => {
  assert.throws(() => startRoutineRun(emptyRoutineRunState(), { ...routine(), items: [] }), /Add checklist/);
  assert.doesNotMatch(source, /supabase|createBlock|planDate|completedByDate\s*=/);
});

test('essentials runs snapshot only starred steps and never change a full or previous run', () => {
  const template = routine();
  template.items[0].essential = true;
  const full = startRoutineRun(emptyRoutineRunState(), template);
  const short = startRoutineRun(full, template, true, new Date().toISOString(), 'essentials');
  assert.equal(short.runs[0].mode, 'full');
  assert.equal(short.runs[0].items.length, 2);
  assert.equal(short.runs[1].mode, 'essentials');
  assert.deepEqual(short.runs[1].items.map(item => item.id), ['water']);
  assert.equal(short.runs[1].items[0].completed, false);
  template.items[0].essential = false;
  assert.equal(short.runs[1].items[0].essential, true);
  assert.throws(() => startRoutineRun(emptyRoutineRunState(), template, false, new Date().toISOString(), 'essentials'), /essential step/);
  assert.equal(startRoutineRun(short, template, false, new Date().toISOString(), 'full'), short);
});

test('recent history is newest-first, per routine, read-only and preserves partial finishes', () => {
  let state = startRoutineRun(emptyRoutineRunState(), routine(), false, '2026-10-31T10:00:00Z');
  state = toggleRoutineRunItem(state, state.runs[0].id, 'water', '2026-10-31T10:01:00Z');
  state = finishRoutineRun(state, state.runs[0].id, '2026-10-31T10:02:00Z');
  state = startRoutineRun(state, routine(), false, '2026-11-01T10:00:00Z');
  state = startRoutineRun(state, { ...routine(), id: 'evening' });
  const before = structuredClone(state);
  const history = routineRunHistory(state, 'morning');
  assert.equal(history.length, 2);
  assert.equal(history[0].startedAt, '2026-11-01T10:00:00Z');
  assert.equal(history[1].items.filter(item => item.completed).length, 1);
  assert.deepEqual(state, before);
});

test('last used tracks resume, check and finish, but viewing history does not change it', () => {
  let state = startRoutineRun(emptyRoutineRunState(), routine(), false, '2026-10-31T10:00:00Z');
  const id = state.runs[0].id;
  state = resumeRoutineRun(state, id, '2026-11-01T11:00:00Z');
  assert.equal(routineLastUsedAt(routineRunHistory(state, 'morning')), '2026-11-01T11:00:00Z');
  state = toggleRoutineRunItem(state, id, 'water', '2026-11-01T11:01:00Z');
  assert.equal(routineLastUsedAt(state.runs), '2026-11-01T11:01:00Z');
  state = finishRoutineRun(state, id, '2026-11-01T11:02:00Z');
  assert.equal(routineLastUsedAt(state.runs), '2026-11-01T11:02:00Z');
  assert.deepEqual(resumeRoutineRun(state, id), state);
});

test('last used uses local calendar days through daylight saving changes, not elapsed hours', () => {
  const previousTZ = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const now = new Date('2026-11-01T23:30:00-05:00');
    assert.equal(routineLastUsed(undefined, now), 'Not used yet');
    assert.equal(routineLastUsed('2026-11-01T00:30:00-04:00', now), 'Last used today');
    assert.equal(routineLastUsed('2026-10-31T23:59:00-04:00', now), 'Last used yesterday');
    assert.match(routineLastUsed('2025-10-01T10:00:00-04:00', now), /2025/);
  } finally { if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ; }
});

test('pre-essentials runs still load and retain their original full checklist', () => {
  const store = storage();
  const state = startRoutineRun(emptyRoutineRunState(), routine());
  delete state.runs[0].mode;
  delete state.runs[0].lastUsedAt;
  saveRoutineRuns('old', state, store);
  const loaded = loadRoutineRuns('old', store);
  assert.equal(loaded.runs[0].items.length, 2);
  assert.equal(routineLastUsedAt(loaded.runs), loaded.runs[0].startedAt);
});

test('routine alarms persist separately from grid timers and cancellation keeps other alarms', async () => {
  const code = ts.transpileModule(readFileSync(new URL('../src/services/tileTimers.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  const { startTileTimer, readTileTimers, cancelTileTimer } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  const store = storage();
  const cancelled = [];
  const alarm = { schedule: async () => {}, cancel: async id => { cancelled.push(id); } };
  await startTileTimer(store, alarm, 'one', 'grid-box', 'Grid', 10, 100);
  await startTileTimer(store, alarm, 'one', routineRunTimerId('run-one'), 'Morning routine', 5, 101);
  await startTileTimer(store, alarm, 'one', routineRunTimerId('run-two'), 'Evening routine', 5, 102);
  assert.equal(readTileTimers(store, 'one').length, 3);
  await cancelTileTimer(store, alarm, 'one', routineRunTimerId('run-one'));
  assert.deepEqual(cancelled, [101]);
  assert.deepEqual(readTileTimers(store, 'one').map(timer => timer.blockId), ['grid-box', routineRunTimerId('run-two')]);
});
