import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const compile = (path, dependencies = {}) => {
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(id => {
    if (!(id in dependencies)) throw new Error(`Unexpected runtime dependency: ${id}`);
    return dependencies[id];
  }, module, module.exports);
  return module.exports;
};
const model = compile('../src/services/outlineModel.ts');
const { prepareSoftPlanChange: prepare, getSoftPlansForWeek: forWeek, recurringPlanProgress: progress } = compile('../src/services/softPlanning.ts', {
  './outlineModel': model, './planningDate': compile('../src/services/planningDate.ts'),
});
const row = (id, extra = {}) => ({
  id, text: id, tag: 'task', taskDone: false, trashedAt: null, collapsed: false,
  frequency: 'weekly', target: 3, planDate: null, plans: [], linked: null,
  draftNote: 'Keep these notes', reminderAt: '2026-10-30T12:00:00Z', children: [], ...extra,
});
const block = (extra = {}) => ({ id: 'block', completed: false, location_type: 'slot', week_start_date: '2026-10-26', day_index: 2, time_index: 4, ...extra });
const plan = (extra = {}) => ({ id: 'plan', scope: 'week', date: '2026-10-26', targetCount: null, scheduledBlockIds: [], ...extra });
const context = (blocks = []) => ({ blocks, slotCount: 17 });
const request = (destination, extra = {}) => ({ nodeId: 'item', planId: 'plan', destination, ...extra });
const find = nodes => model.outlineBranchItems(nodes).find(node => node.id === 'item');
test('groups cannot be scheduled but their children remain available for loose planning', () => {
  const nodes = [row('item', { tag: 'note', isGroup: true, plans: [plan()], children: [row('child', { plans: [plan({ id: 'child-plan' })] })] })];
  assert.throws(() => prepare(nodes, request({ kind: 'week', date: '2026-10-26' }), context()), /group/);
  assert.deepEqual(forWeek(nodes, '2026-10-26').map(entry => entry.node.id), ['child']);
});
const applyBlockChanges = (blocks, changes) => changes.reduce((current, change) => {
  const previous = current.find(item => item.id === change.id);
  const updated = { ...(previous ?? { id: change.id, completed: false }), ...change.timing };
  return previous ? current.map(item => item.id === change.id ? updated : item) : [...current, updated];
}, blocks);

test('week -> day -> time -> week -> unplanned preserves Outline home and source content', () => {
  const original = [row('theme', { tag: 'note', linked: { themeId: 'home', label: 'Home' }, children: [row('item', { children: [row('child')] })] })];
  const before = structuredClone(original);
  let result = prepare(original, request({ kind: 'week', date: '2026-10-28' }), context());
  assert.deepEqual(find(result.nodes).plans, [plan()]);
  assert.deepEqual(result.blockChanges, []);
  result = prepare(result.nodes, request({ kind: 'day', date: '2026-10-30' }), context());
  assert.deepEqual(find(result.nodes).plans, [plan({ scope: 'day', date: '2026-10-30' })]);
  assert.deepEqual(result.blockChanges, []);
  result = prepare(result.nodes, request({ kind: 'time', date: '2026-10-30', timeIndex: 8 }, { newBlockId: 'block' }), context());
  assert.deepEqual(result.blockChanges, [{ id: 'block', create: true, timing: { location_type: 'slot', week_start_date: '2026-10-26', day_index: 4, time_index: 8 } }]);
  let blocks = applyBlockChanges([], result.blockChanges);
  assert.equal(find(result.nodes).linked.blockId, 'block');
  result = prepare(result.nodes, request({ kind: 'week', date: '2026-11-04' }), context(blocks));
  assert.equal(find(result.nodes).plans[0].date, '2026-11-02');
  assert.equal(result.blockChanges[0].timing.location_type, 'unscheduled');
  blocks = applyBlockChanges(blocks, result.blockChanges);
  result = prepare(result.nodes, request({ kind: 'unplanned' }), context(blocks));
  assert.deepEqual(find(result.nodes).plans, []);
  assert.deepEqual(result.blockChanges, []);
  assert.equal(result.nodes[0].children[0].id, 'item');
  assert.equal(find(result.nodes).draftNote, before[0].children[0].draftNote);
  assert.equal(find(result.nodes).reminderAt, before[0].children[0].reminderAt);
  assert.equal(find(result.nodes).target, 3);
  assert.deepEqual(find(result.nodes).children, before[0].children[0].children);
  assert.equal(find(result.nodes).linked.blockId, 'block');
  assert.deepEqual(original, before);
});

test('a legacy day plan transfers ownership once and does not reappear after saving', () => {
  const nodes = [row('item', { planDate: '2026-10-28' })];
  const result = prepare(nodes, request({ kind: 'week', date: '2026-11-04' }, { planId: 'legacy-day:item' }), context());
  assert.equal(result.nodes[0].planDate, null);
  assert.equal(result.nodes[0].plans[0].id, 'legacy-day:item');
  assert.equal(result.nodes[0].plans[0].legacyPlanDate, undefined);
  assert.deepEqual(model.serializeOutline(result.nodes)[0].plans, result.nodes[0].plans);
  const cleared = prepare(result.nodes, request({ kind: 'unplanned' }, { planId: 'legacy-day:item' }), context());
  assert.deepEqual(model.serializeOutline(cleared.nodes)[0].plans, []);
});

test('a scheduled source block is reused and only its timing is changed', () => {
  const source = block({ label: 'Photos', notes: 'Calendar notes', completed_at: null });
  const original = structuredClone(source);
  const nodes = [row('item', { linked: { blockId: 'block', label: 'Photos' } })];
  const result = prepare(nodes, request({ kind: 'time', date: '2027-01-03', timeIndex: 16 }, { newBlockId: 'unused' }), context([source]));
  assert.deepEqual(result.blockChanges, [{ id: 'block', create: false, timing: { location_type: 'slot', week_start_date: '2026-12-28', day_index: 6, time_index: 16 } }]);
  assert.deepEqual(source, original);
  const updated = applyBlockChanges([source], result.blockChanges)[0];
  assert.equal(updated.notes, 'Calendar notes');
  assert.equal(updated.label, 'Photos');
});

test('removing a time releases the same block rather than deleting or recreating it', () => {
  const nodes = [row('item', { plans: [plan({ scheduledBlockIds: ['block'] })], linked: { blockId: 'block', label: 'Item' } })];
  for (const destination of [{ kind: 'day', date: '2026-10-29' }, { kind: 'week', date: '2026-10-28' }, { kind: 'unplanned' }]) {
    const result = prepare(nodes, request(destination), context([block()]));
    assert.deepEqual(result.blockChanges, [{ id: 'block', create: false, timing: { location_type: 'unscheduled', week_start_date: null, day_index: null, time_index: null } }]);
    assert.equal(find(result.nodes).linked.blockId, 'block');
  }
});

test('retrying week and day placement keeps a single stable plan', () => {
  for (const destination of [{ kind: 'week', date: '2026-10-28' }, { kind: 'day', date: '2026-10-29' }]) {
    const first = prepare([row('item')], request(destination), context());
    const second = prepare(first.nodes, request(destination), context());
    assert.deepEqual(second, first);
    assert.equal(find(second.nodes).plans.length, 1);
  }
});

test('scheduling retries reuse the reserved ID before or after an acknowledged block write', () => {
  const nodes = [row('item')];
  const action = request({ kind: 'time', date: '2026-10-30', timeIndex: 8 }, { newBlockId: 'reserved' });
  const prepared = prepare(nodes, action, context());
  assert.deepEqual(prepare(nodes, action, context()), prepared);
  const persistedBlocks = applyBlockChanges([], prepared.blockChanges);
  // Simulate a successful block write followed by a failed Outline write.
  const retry = prepare(nodes, action, context(persistedBlocks));
  assert.deepEqual(retry.blockChanges, []);
  assert.deepEqual(retry.nodes, prepared.nodes);
  assert.deepEqual(prepare(retry.nodes, action, context(persistedBlocks)).nodes, retry.nodes);
  assert.equal(persistedBlocks.length, 1);
});

test('unscheduling retries after a partial write keep the link and do not issue another write', () => {
  const nodes = [row('item', { plans: [plan({ scheduledBlockIds: ['block'] })], linked: { blockId: 'block', label: 'Item' } })];
  const action = request({ kind: 'day', date: '2026-10-29' });
  const prepared = prepare(nodes, action, context([block()]));
  const updatedBlocks = applyBlockChanges([block()], prepared.blockChanges);
  const retry = prepare(nodes, action, context(updatedBlocks));
  assert.deepEqual(retry.nodes, prepared.nodes);
  assert.deepEqual(retry.blockChanges, []);
});

test('invalid dates, times and IDs fail before preparing any changes', () => {
  const nodes = [row('item')];
  const before = structuredClone(nodes);
  for (const date of ['', 'bad', '2026-02-30', '2026-13-01']) {
    assert.throws(() => prepare(nodes, request({ kind: 'week', date }), context()), /valid day/);
  }
  for (const timeIndex of [-1, 17, 2.5, NaN]) {
    assert.throws(() => prepare(nodes, request({ kind: 'time', date: '2026-10-30', timeIndex }, { newBlockId: 'block' }), context()), /valid time/);
  }
  assert.throws(() => prepare(nodes, request({ kind: 'week', date: '2026-10-28' }, { planId: ' ' }), context()), /stable plan ID/);
  assert.throws(() => prepare(nodes, request({ kind: 'time', date: '2026-10-30', timeIndex: 8 }), context()), /stable calendar item ID/);
  assert.deepEqual(nodes, before);
});

test('missing and trashed rows cannot receive planning changes', () => {
  const action = request({ kind: 'week', date: '2026-10-28' });
  assert.throws(() => prepare([], action, context()), /missing or in Trash/);
  assert.throws(() => prepare([row('parent', { trashedAt: '2026-10-28', children: [row('item')] })], action, context()), /missing or in Trash/);
});

test('unloaded linked blocks cannot be silently replaced or moved', () => {
  const nodes = [row('item', { linked: { blockId: 'offscreen', label: 'Item' } })];
  assert.throws(() => prepare(nodes, request({ kind: 'week', date: '2026-10-28' }), context()), /Load the linked calendar item/);
  assert.throws(() => prepare(nodes, request({ kind: 'time', date: '2026-10-30', timeIndex: 8 }, { newBlockId: 'replacement' }), context()), /Load the linked calendar item/);
});

test('completed calendar history is never moved or erased when removing a plan', () => {
  const nodes = [row('item', { plans: [plan({ scheduledBlockIds: ['block'] })], linked: { blockId: 'block', label: 'Item' } })];
  const history = block({ completed: true });
  for (const destination of [{ kind: 'week', date: '2026-11-04' }, { kind: 'day', date: '2026-10-30' }, { kind: 'time', date: '2026-10-30', timeIndex: 8 }]) {
    assert.throws(() => prepare(nodes, request(destination), context([history])), /Completed calendar history/);
  }
  const removed = prepare(nodes, request({ kind: 'unplanned' }), context([history]));
  assert.deepEqual(removed.blockChanges, []);
  assert.deepEqual(find(removed.nodes).plans, []);
  assert.equal(find(removed.nodes).linked.blockId, history.id);
  assert.equal(history.completed, true);
});

test('completed tasks must be reopened, but notes are not treated as checkable tasks', () => {
  const action = request({ kind: 'week', date: '2026-10-28' });
  assert.throws(() => prepare([row('item', { taskDone: true })], action, context()), /Reopen/);
  assert.equal(prepare([row('item', { tag: 'note', taskDone: true })], action, context()).nodes[0].tag, 'note');
});

test('other plans and source owners, including Trash, cannot have their block stolen', () => {
  const action = request({ kind: 'time', date: '2026-10-30', timeIndex: 8 }, { newBlockId: 'block' });
  for (const owner of [row('other', { linked: { blockId: 'block', label: 'Other' } }), row('other', { trashedAt: '2026-10-28', plans: [plan({ scheduledBlockIds: ['block'] })] })]) {
    assert.throws(() => prepare([row('item'), owner], action, context([block()])), /belongs to another plan/);
  }
});

test('removing one shared plan does not unschedule another plan\'s block', () => {
  const nodes = [row('item', { plans: [plan({ scheduledBlockIds: ['block'] }), plan({ id: 'other', scheduledBlockIds: ['block'] })] })];
  const result = prepare(nodes, request({ kind: 'unplanned' }), context([block()]));
  assert.deepEqual(result.blockChanges, []);
  assert.deepEqual(find(result.nodes).plans.map(item => item.id), ['other']);
});

test('stale plan IDs and multiple occurrences require an explicit choice', () => {
  assert.throws(() => prepare([row('item', { plans: [plan({ id: 'newer' })] })], request({ kind: 'unplanned' }), context()), /plan changed/);
  assert.throws(() => prepare([row('item', { plans: [plan({ scheduledBlockIds: ['one', 'two'] })] })], request({ kind: 'week', date: '2026-10-28' }), context()), /single calendar occurrence/);
});

test('themes cannot be planned and unlinked habits cannot create calendar sessions', () => {
  assert.throws(() => prepare([row('item', { linked: { themeId: 'theme', label: 'Home' } })], request({ kind: 'week', date: '2026-10-28' }), context()));
  assert.throws(() => prepare([row('item', { tag: 'habit' })], request({ kind: 'time', date: '2026-10-28', timeIndex: 2 }, { newBlockId: 'block' }), context()), /Link this habit/);
});

test('weekly intentions do not change habit goals, count completion, or carry into future weeks', () => {
  for (const extra of [{ tag: 'habit', linked: { habitId: 'habit' } }, { linked: { routineId: 'routine' } }]) {
    const original = [row('item', extra)];
    const result = prepare(original, request({ kind: 'week', date: '2026-10-28' }, { targetCount: 5 }), context());
    assert.equal(result.nodes[0].plans[0].targetCount, 5);
    assert.equal(result.nodes[0].target, 3);
    assert.deepEqual(result.blockChanges, []);
    assert.deepEqual(progress(result.nodes[0], result.nodes[0].plans[0], []), { placed: 0, completed: 0, target: 5 });
    assert.deepEqual(forWeek(result.nodes, '2026-11-02'), []);
    assert.deepEqual(original[0].plans, []);
    for (const count of [0, -1, 1.5, NaN]) assert.throws(() => prepare(result.nodes, request({ kind: 'week', date: '2026-10-26' }, { targetCount: count }), context()), /whole number/);
  }
});

test('repeated sessions have independent IDs and progress; old linked history is untouched', () => {
  let nodes = [row('item', { tag: 'habit', linked: { habitId: 'habit', blockId: 'old' } })];
  let blocks = [block({ id: 'old', completed: true, week_start_date: '2026-10-19' })];
  const apply = (id, destination, extra = {}) => {
    const result = prepare(nodes, request(destination, { planId: id, ...extra }), context(blocks));
    nodes = result.nodes; blocks = applyBlockChanges(blocks, result.blockChanges);
    return result;
  };
  apply('parent', { kind: 'week', date: '2026-10-26' }, { targetCount: 3 });
  const time = { kind: 'time', date: '2026-10-29', timeIndex: 3 };
  apply('one', time, { parentPlanId: 'parent', newBlockId: 'one-block' });
  apply('one', time, { parentPlanId: 'parent', newBlockId: 'one-block' });
  apply('two', time, { parentPlanId: 'parent', newBlockId: 'two-block' });
  apply('three', { kind: 'day', date: '2026-10-30' }, { parentPlanId: 'parent' });
  const parent = () => nodes[0].plans.find(plan => plan.id === 'parent');
  assert.equal(blocks.length, 3);
  assert.equal(nodes[0].linked.blockId, 'old');
  assert.deepEqual(progress(nodes[0], parent(), blocks), { placed: 3, completed: 0, target: 3 });
  blocks.find(block => block.id === 'one-block').completed = true;
  assert.deepEqual(progress(nodes[0], parent(), blocks), { placed: 3, completed: 1, target: 3 });
  assert.throws(() => apply('one', { kind: 'day', date: time.date }), /Completed/);
  const before = structuredClone(nodes);
  apply('one', { kind: 'unplanned' });
  assert.deepEqual(nodes, before);
  apply('two', { kind: 'week', date: time.date });
  assert.deepEqual(progress(nodes[0], parent(), blocks), { placed: 2, completed: 1, target: 3 });
  assert.equal(forWeek(nodes, time.date).filter(entry => entry.placement === 'week').length, 1);
  apply('two', { ...time, date: '2026-11-03' });
  assert.equal(blocks.length, 3);
  assert.equal(blocks.find(block => block.id === 'two-block').week_start_date, '2026-11-02');
  const moved = nodes[0].plans.find(plan => plan.id === 'two');
  assert.notEqual(moved.parentPlanId, 'parent');
  assert.deepEqual(progress(nodes[0], parent(), blocks), { placed: 2, completed: 1, target: 3 });
  apply('parent', { kind: 'week', date: time.date }, { targetCount: 1 });
  assert.deepEqual(progress(nodes[0], parent(), blocks), { placed: 2, completed: 1, target: 1 });
  const history = structuredClone(blocks);
  apply('parent', { kind: 'unplanned' });
  assert.deepEqual(blocks, history);
  assert.ok(nodes[0].plans.some(plan => plan.id === 'one'));
  assert.ok(nodes[0].plans.some(plan => plan.id === 'three'));
  assert.deepEqual(model.serializeOutline(nodes)[0].plans, nodes[0].plans);
});

test('a sibling session cannot reuse another session block, even after it is released', () => {
  const nodes = [row('item', { tag: 'habit', linked: { habitId: 'habit' }, plans: [
    plan({ id: 'parent' }), plan({ id: 'one', parentPlanId: 'parent', occurrenceBlockId: 'block' }),
  ] })];
  assert.throws(() => prepare(nodes, request({ kind: 'time', date: '2026-10-28', timeIndex: 2 }, { planId: 'two', parentPlanId: 'parent', newBlockId: 'block' }), context([block({ location_type: 'unscheduled' })])), /another plan/);
});

test('weekly counts ignore missing, unscheduled and other-week blocks and deduplicate linked IDs', () => {
  const parent = plan({ id: 'parent', targetCount: 3 });
  const habit = row('item', { tag: 'habit', plans: [parent,
    plan({ id: 'one', parentPlanId: 'parent', scope: 'day', date: '2026-10-29', scheduledBlockIds: ['block', 'missing', 'loose', 'other-week'] }),
    plan({ id: 'two', parentPlanId: 'parent', scope: 'day', date: '2026-10-29', scheduledBlockIds: ['block'] }),
  ] });
  assert.deepEqual(progress(habit, parent, [block({ completed: true }), block({ id: 'loose', location_type: 'unscheduled' }), block({ id: 'other-week', week_start_date: '2026-11-02', completed: true })]), { placed: 1, completed: 1, target: 3 });
});

test('editing an older weekly intention retains existing calendar references', () => {
  const habit = row('item', { tag: 'habit', plans: [plan({ scheduledBlockIds: ['old-one', 'old-two'], targetCount: 3 })] });
  const result = prepare([habit], request({ kind: 'week', date: '2026-10-26' }, { targetCount: 4 }), context());
  assert.deepEqual(result.nodes[0].plans[0].scheduledBlockIds, ['old-one', 'old-two']);
});

test('weekly selectors preserve Outline order, paths, categories and planning specificity', () => {
  const weekly = row('week', { plans: [plan()] });
  const daily = row('day', { tag: 'note', plans: [plan({ scope: 'day', date: '2026-11-01' })] });
  const timed = row('scheduled', { plans: [plan({ scope: 'day', date: '2026-10-30', scheduledBlockIds: ['block'] })] });
  const nodes = [row('Home', { linked: { themeId: 'theme', label: 'Home' }, children: [weekly, daily, timed] })];
  const before = structuredClone(nodes);
  const selected = forWeek(nodes, '2026-10-28');
  assert.deepEqual(selected.map(entry => entry.placement), ['week', 'day', 'scheduled']);
  assert.deepEqual(selected.map(entry => entry.path), [['Home', 'week'], ['Home', 'day'], ['Home', 'scheduled']]);
  assert.equal(selected[0].node, weekly);
  assert.equal(selected[1].node.tag, 'note');
  assert.deepEqual(nodes, before);
});

test('weekly selectors exclude Trash and completed tasks without hiding active child notes', () => {
  const nodes = [row('trash', { trashedAt: '2026-10-28', children: [row('hidden', { plans: [plan()] })] }),
    row('done', { taskDone: true, plans: [plan()], children: [row('note', { tag: 'note', plans: [plan()] })] }),
    row('old-day', { planDate: '2026-10-30' })];
  assert.deepEqual(forWeek(nodes, '2026-10-28').map(entry => entry.node.id), ['note', 'old-day']);
});

test('selected-week queries do not roll old plans forward and respect DST/year boundaries', () => {
  const previous = process.env.TZ;
  try {
    for (const timezone of ['America/New_York', 'Pacific/Auckland', 'UTC']) {
      process.env.TZ = timezone;
      const nodes = [row('old', { plans: [plan()] }), row('next', { plans: [plan({ date: '2026-11-02' })] }), row('year', { plans: [plan({ scope: 'day', date: '2027-01-03' })] })];
      assert.deepEqual(forWeek(nodes, '2026-11-01').map(entry => entry.node.id), ['old']);
      assert.deepEqual(forWeek(nodes, '2026-11-02').map(entry => entry.node.id), ['next']);
      assert.deepEqual(forWeek(nodes, '2026-12-28').map(entry => entry.node.id), ['year']);
      assert.deepEqual(forWeek(nodes, '2027-01-04'), []);
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
