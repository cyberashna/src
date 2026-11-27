import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const compile = (path, dependencies = {}) => {
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(id => dependencies[id] ?? require(id), module, module.exports);
  return module.exports;
};
const model = compile('../src/services/outlineModel.ts');
const dates = compile('../src/services/planningDate.ts');
const planning = compile('../src/services/softPlanning.ts', { './outlineModel': model, './planningDate': dates });
const grid = compile('../src/services/gridOutline.ts');
const plan = { id: 'plan', scope: 'week', date: '2026-10-26', targetCount: null, scheduledBlockIds: [] };
const time = { kind: 'time', date: '2026-10-29', timeIndex: 3 };
const setup = () => {
  const state = { nodes: [{ id: 'home', text: 'Home', linked: { themeId: 'theme' }, plans: [], children: [
    { id: 'task', text: 'Book dentist', tag: 'task', taskDone: false, planDate: null, plans: [structuredClone(plan)], children: [], draftNote: 'Ask about Friday' },
  ] }], blocks: [], notes: {}, tasks: [], writes: [], failure: null, afterWrite: null };
  const fail = place => { if (state.failure === place) { state.failure = null; throw new Error('Offline'); } };
  const database = { blocks: {
    async getByIds(userId, ids) { assert.equal(userId, 'user'); return structuredClone(state.blocks.filter(block => ids.includes(block.id))); },
    async ensureWithId(userId, id, block) {
      fail('block');
      if (!state.blocks.some(item => item.id === id)) { state.blocks.push({ ...block, id, user_id: userId }); state.writes.push('create'); }
      state.afterWrite?.();
    },
    async update(id, timing) { fail('block'); Object.assign(state.blocks.find(block => block.id === id), timing); state.writes.push('update'); },
  }, blockNotes: {
    async getByBlock(id) { return state.notes[id]; },
    async upsert(_userId, id, content) { fail('note'); state.notes[id] = { content }; },
  }, blockTasks: {
    async ensureWithIds(userId, blockId, items) {
      fail('checklist');
      for (const item of items) if (!state.tasks.some(task => task.id === item.id)) state.tasks.push({ ...item, user_id: userId, block_id: blockId, completed: false });
    },
    async getByBlock(id) { return structuredClone(state.tasks.filter(task => task.block_id === id)); },
  } };
  const { persistSoftPlan } = compile('../src/services/softPlanPersistence.ts', {
    './database': { database }, './outlineModel': model, './gridOutline': grid, './softPlanning': planning,
  });
  const save = (destination, newBlockId = 'reserved', extra = {}, routine) => persistSoftPlan('user', { nodeId: 'task', planId: 'plan', destination, newBlockId, ...extra }, 24, {
    current: () => state.nodes,
    save: async nodes => { state.nodes = nodes; fail('outline'); },
    routine,
  });
  return { state, save, task: () => state.nodes[0].children[0] };
};

test('week and day planning retain canonical content without creating calendar blocks', async () => {
  const { state, save, task } = setup();
  await save({ kind: 'week', date: '2026-10-26' });
  await save({ kind: 'day', date: '2026-10-29' });
  assert.equal(task().plans[0].scope, 'day');
  assert.equal(task().planDate, null);
  assert.equal(task().draftNote, 'Ask about Friday');
  assert.equal(state.blocks.length, 0);
  assert.equal(planning.getSoftPlansForWeek(state.nodes, plan.date)[0].placement, 'day');
});

test('reading links reuse one calendar card when moved and preserve the original resource', async () => {
  const { state, save, task } = setup();
  const readingLink = { url: 'https://example.org/read', imageUrl: 'https://example.org/cover.jpg' };
  Object.assign(task(), { tag: 'link', text: 'Read this', readingLink });
  await save(time);
  assert.equal(state.blocks[0].label, 'Link: Read this');
  assert.equal(state.blocks[0].hashtag, 'link');
  await save({ ...time, timeIndex: 5 });
  assert.equal(state.blocks.length, 1);
  assert.equal(state.blocks[0].time_index, 5);
  assert.deepEqual(task().readingLink, readingLink);
  assert.equal(task().id, 'task');
  await save({ kind: 'week', date: time.date });
  assert.equal(planning.getSoftPlansForWeek(state.nodes, plan.date)[0].node.tag, 'link');
  task().taskDone = true;
  assert.deepEqual(planning.getSoftPlansForWeek(state.nodes, plan.date), []);
  await assert.rejects(save(time), /completed/);
});

const routine = { id: 'morning', name: 'Morning', notes: 'Take it gently', items: [
  { id: 'water', label: 'Water', completedByDate: { '2026-10-29': true } },
  { id: 'stretch', label: 'Stretch' },
] };
const routineSetup = () => {
  const result = setup();
  Object.assign(result.task(), { tag: 'note', linked: { routineId: 'morning' }, plans: [] });
  return result;
};

test('routine sessions copy independent unchecked checklists and preserve subsequent edits', async () => {
  const { state, save, task } = routineSetup();
  const before = structuredClone(routine);
  await save(time, 'session-one', { planId: 'one' }, routine);
  await save(time, 'session-two', { planId: 'two' }, routine);
  assert.equal(state.blocks.length, 2);
  assert.equal(state.tasks.length, 4);
  assert.ok(state.tasks.every(item => !item.completed));
  assert.equal(new Set(state.tasks.map(item => item.id)).size, 4);
  assert.equal(state.notes['session-one'].content, routine.notes);
  assert.equal(task().linked.blockId, undefined);
  const edited = state.tasks.find(item => item.block_id === 'session-one');
  edited.label = 'My edited session';
  edited.completed = true;
  state.tasks = state.tasks.filter(item => item.block_id !== 'session-one' || item.id === edited.id);
  await save({ kind: 'week', date: time.date }, 'session-one', { planId: 'one' }, routine);
  await save(time, 'session-one', { planId: 'one' }, routine);
  assert.equal(state.tasks.filter(item => item.block_id === 'session-one').length, 1);
  assert.equal(edited.completed, true);
  assert.equal(edited.label, 'My edited session');
  assert.deepEqual(routine, before);
  assert.ok(task().plans.find(plan => plan.id === 'one').sessionInitialized);
  assert.deepEqual(model.serializeOutline(state.nodes)[0].children[0].plans, task().plans);
});

for (const failure of ['block', 'note', 'checklist', 'outline']) test(`routine retry after ${failure} failure keeps a single session and checklist`, async () => {
  const { state, save, task } = routineSetup();
  state.failure = failure;
  await assert.rejects(save(time, 'session', { planId: 'one' }, routine), /Offline/);
  await save(time, 'session', { planId: 'one' }, routine);
  await save(time, 'session', { planId: 'one' }, routine);
  assert.equal(state.blocks.length, 1);
  assert.equal(state.tasks.length, 2);
  assert.ok(task().plans.find(plan => plan.id === 'one').sessionInitialized);
});

test('a failed routine session can become loose, reload, then finish initializing with its original block', async () => {
  const { state, save, task } = routineSetup();
  state.failure = 'checklist';
  await assert.rejects(save(time, 'session', { planId: 'one' }, routine), /Offline/);
  await save({ kind: 'week', date: time.date }, 'session', { planId: 'one', parentPlanId: 'week:task:2026-10-26' }, routine);
  assert.equal(state.blocks[0].location_type, 'unscheduled');
  assert.equal(task().plans.find(plan => plan.id === 'one').occurrenceBlockId, 'session');
  state.nodes = structuredClone(state.nodes);
  await save(time, undefined, { planId: 'one' }, routine);
  assert.equal(state.blocks.length, 1);
  assert.equal(state.tasks.length, 2);
});

test('unavailable routines fail before any calendar writes', async () => {
  const { state, save } = routineSetup();
  await assert.rejects(save(time, 'session', { planId: 'one' }), /not available/);
  assert.equal(state.blocks.length, 0);
});

test('scheduling creates one linked block with theme and notes; repeating save is idempotent', async () => {
  const { state, save, task } = setup();
  await save(time); await save(time);
  assert.deepEqual(state.writes, ['create']);
  assert.equal(state.blocks[0].theme_id, 'theme');
  assert.equal(state.notes.reserved.content, 'Ask about Friday');
  assert.deepEqual(task().plans[0].scheduledBlockIds, ['reserved']);
  assert.equal(task().linked.blockId, 'reserved');
  assert.equal(planning.getSoftPlansForWeek(state.nodes, plan.date)[0].placement, 'scheduled');
});

for (const failure of ['block', 'note', 'outline']) test(`retry after ${failure} failure uses the reserved block ID`, async () => {
  const { state, save, task } = setup();
  state.failure = failure;
  await assert.rejects(save(time), /Offline/);
  await save(time);
  assert.equal(state.blocks.length, 1);
  assert.equal(state.notes.reserved.content, 'Ask about Friday');
  assert.deepEqual(task().plans[0].scheduledBlockIds, ['reserved']);
});

test('a retry preserves existing block edits and notes, and rebases concurrent Outline edits', async () => {
  const { state, save, task } = setup();
  state.failure = 'note';
  await assert.rejects(save(time));
  state.blocks[0].label = 'Edited calendar title';
  state.notes.reserved = { content: 'Edited calendar notes' };
  task().text = 'Edited Outline title';
  await save(time);
  assert.equal(state.blocks[0].label, 'Edited calendar title');
  assert.equal(state.notes.reserved.content, 'Edited calendar notes');
  assert.equal(task().text, 'Edited Outline title');
});

for (const destination of [{ kind: 'week', date: '2026-10-26' }, { kind: 'day', date: '2026-10-29' }, { kind: 'unplanned' }]) {
  test(`changing a failed Time save to ${destination.kind} releases its reserved calendar block`, async () => {
    const { state, save, task } = setup();
    state.failure = 'note';
    await assert.rejects(save(time), /Offline/);
    assert.equal(state.blocks[0].location_type, 'slot');
    assert.equal(task().linked, undefined);
    await save(destination);
    assert.equal(state.blocks.length, 1);
    assert.equal(state.blocks[0].location_type, 'unscheduled');
    assert.equal(task().linked.blockId, 'reserved');
    await save(time);
    assert.equal(state.blocks.length, 1);
    assert.equal(state.notes.reserved.content, 'Ask about Friday');
  });
}

test('a rename during block creation survives the final Outline save', async () => {
  const { state, save, task } = setup();
  state.afterWrite = () => { task().text = 'Renamed while saving'; };
  await save(time);
  assert.equal(task().text, 'Renamed while saving');
});

test('moving an existing occurrence across weeks updates only timing, then removing keeps content', async () => {
  const { state, save, task } = setup();
  await save(time);
  await save({ ...time, date: '2026-11-03', timeIndex: 5 });
  assert.equal(state.blocks.length, 1);
  assert.equal(state.blocks[0].week_start_date, '2026-11-02');
  assert.equal(planning.getSoftPlansForWeek(state.nodes, plan.date).length, 0);
  await save({ kind: 'unplanned' });
  assert.equal(state.blocks[0].location_type, 'unscheduled');
  assert.equal(state.notes.reserved.content, 'Ask about Friday');
  assert.deepEqual(task().plans, []);
  assert.equal(task().text, 'Book dentist');
});

test('completed history cannot be moved and removing its plan does not alter history', async () => {
  const { state, save } = setup();
  await save(time);
  state.blocks[0].completed = true;
  const before = structuredClone(state.blocks[0]);
  await assert.rejects(save({ kind: 'day', date: time.date }), /Completed/);
  await save({ kind: 'unplanned' });
  assert.deepEqual(state.blocks[0], before);
});

test('database linked-block reads are user scoped and reserved inserts never overwrite a duplicate', async () => {
  const calls = [];
  const supabase = { from(table) {
    calls.push(['from', table]);
    const query = { select: () => query, eq: (...args) => { calls.push(['eq', ...args]); return query; },
      in: (...args) => { calls.push(['in', ...args]); return query; },
      upsert: (...args) => { calls.push(['upsert', ...args]); return query; },
      then: resolve => resolve({ data: [], error: null }) };
    return query;
  } };
  const { database } = compile('../src/services/database.ts', { '../lib/supabase': { supabase } });
  await database.blocks.getByIds('user', []);
  assert.deepEqual(calls, []);
  await database.blocks.getByIds('user', ['one', 'one', 'two']);
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(['eq', 'user_id', 'user'])));
  assert.deepEqual(calls.find(call => call[0] === 'in'), ['in', 'id', ['one', 'two']]);
  await database.blocks.ensureWithId('user', 'reserved', { label: 'Task: Dentist' });
  assert.deepEqual(calls.find(call => call[0] === 'upsert'), ['upsert', { label: 'Task: Dentist', id: 'reserved', user_id: 'user' }, { onConflict: 'id', ignoreDuplicates: true }]);
  calls.length = 0;
  await database.blockTasks.ensureWithIds('user', 'session', [{ id: 'stable', label: 'Water', sort_order: 0 }]);
  assert.deepEqual(calls.find(call => call[0] === 'upsert'), ['upsert', [{ id: 'stable', label: 'Water', sort_order: 0, user_id: 'user', block_id: 'session', completed: false }], { onConflict: 'id', ignoreDuplicates: true }]);
});
