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
const week = (id = 'week-plan', date = '2026-10-26') => ({ id, scope: 'week', date, targetCount: null, scheduledBlockIds: [] });
const setup = () => {
  const records = {
    planning_outliner_data: { nodes: [] },
    themes: [{ id: 'theme', name: 'Home' }],
    habits: [{ id: 'habit', name: 'Walk', theme_id: 'theme', target_per_week: 3, frequency: 'weekly' }],
  };
  let failNext = false;
  const writes = [];
  const createClient = () => compile('../src/services/planningOutliner.ts', {
    './outlineModel': model,
    '../lib/supabase': { supabase: { from(table) {
      const query = {
        select: () => query, eq: () => query, maybeSingle: () => query,
        upsert: async value => {
          writes.push(table);
          if (failNext) { failNext = false; return { error: new Error('Offline') }; }
          records[table] = structuredClone(value);
          return { error: null };
        },
        then: resolve => resolve({ data: structuredClone(records[table]), error: null }),
      };
      return query;
    } } },
  });
  return { service: createClient(), createClient, records, writes, fail: () => { failNext = true; } };
};

test('new and older unplanned rows stay unplanned without changing their content', () => {
  const { service } = setup();
  assert.deepEqual(service.createOutlineNode('New note').plans, []);
  const old = { id: 'old', text: 'Keep this', draftNote: 'Details', taskDone: true, children: [] };
  const loaded = service.normalizeOutlineNode(old);
  assert.deepEqual(loaded.plans, []);
  assert.equal(loaded.planDate, null);
  assert.equal(loaded.text, old.text);
  assert.equal(loaded.draftNote, old.draftNote);
  assert.equal(loaded.taskDone, true);
  assert.equal(old.plans, undefined);
});

test('reading links keep their URL, thumbnail and category through shared Outline storage', async () => {
  const { service, createClient, writes } = setup();
  const readingLink = { url: 'https://example.org/article', imageUrl: 'https://example.org/cover.jpg' };
  const node = { ...service.createOutlineNode('Read this'), tag: 'link', readingLink, taskDone: true };
  await service.savePlanningOutliner('user', [node]);
  const loaded = await createClient().loadPlanningOutliner('user');
  assert.equal(loaded[0].id, node.id);
  assert.equal(loaded[0].tag, 'link');
  assert.equal(loaded[0].taskDone, true);
  assert.deepEqual(loaded[0].readingLink, readingLink);
  assert.deepEqual(writes, ['planning_outliner_data']);
});

test('subgroups survive shared storage and reload without creating another canonical theme', async () => {
  const { service, createClient, writes, records } = setup();
  const node = { ...service.createOutlineNode('Kitchen'), isGroup: true, children: [service.createOutlineNode('Pantry')] };
  await service.savePlanningOutliner('user', [node]);
  const loaded = await createClient().loadPlanningOutliner('user');
  assert.equal(loaded[0].isGroup, true);
  assert.equal(loaded[0].children[0].text, 'Pantry');
  assert.equal(records.themes.length, 1);
  assert.deepEqual(writes, ['planning_outliner_data']);
});

test('legacy day plans migrate idempotently with stable identity and no invented time', () => {
  const { service } = setup();
  const old = { id: 'old', text: 'Dentist', planDate: '2026-10-29', children: [] };
  const loaded = service.normalizeOutlineNode(old);
  assert.deepEqual(loaded.plans, [{ id: 'legacy-day:old', scope: 'day', date: old.planDate, targetCount: null, scheduledBlockIds: [], legacyPlanDate: true }]);
  const roundTrip = service.normalizeOutlineNode(model.serializeOutline([loaded])[0]);
  assert.deepEqual(roundTrip, loaded);
  assert.equal(roundTrip.planDate, old.planDate);
});

test('old date edits and clearing cannot resurrect stale migrated plans', () => {
  const { service } = setup();
  const loaded = service.normalizeOutlineNode({ id: 'old', planDate: '2026-10-29', children: [] });
  loaded.plans.push(week());
  const moved = model.serializeOutline([{ ...loaded, planDate: '2026-11-02' }])[0];
  assert.equal(moved.plans.find(plan => plan.legacyPlanDate).date, '2026-11-02');
  const cleared = model.serializeOutline([{ ...moved, planDate: null }])[0];
  assert.deepEqual(cleared.plans, [week()]);
  assert.deepEqual(service.normalizeOutlineNode(cleared).plans, [week()]);
});

test('a matching explicit day plan is not duplicated by legacy migration', () => {
  const day = { ...week('chosen-day'), scope: 'day', date: '2026-10-29' };
  assert.deepEqual(model.normalizeOutlinePlans([day], 'row', day.date), [day]);
});

test('week plans keep calendar dates across DST and year boundaries without requiring a day or time', () => {
  for (const date of ['2026-03-02', '2026-03-09', '2026-10-26', '2026-11-02', '2026-12-28', '2027-01-04']) {
    assert.deepEqual(model.normalizeOutlinePlans([week('plan', date)], 'row'), [week('plan', date)]);
  }
});

test('normalization rejects malformed records, deduplicates IDs and links, and stores metadata only', () => {
  const input = [null, 'bad', {}, { ...week(), date: '2026-02-30' }, { ...week(), date: '2026-10-27' },
    { ...week(), scope: 'month' }, { ...week(), id: '' },
    { ...week(), title: 'Not a second copy', notes: 'Not a second copy', targetCount: -3, scheduledBlockIds: ['block', 'block', '', 3, null] },
    { ...week(), date: '2026-11-02' }];
  const original = structuredClone(input);
  assert.deepEqual(model.normalizeOutlinePlans(input, 'row'), [{ ...week(), scheduledBlockIds: ['block'] }]);
  assert.deepEqual(input, original);
  assert.deepEqual(model.normalizeOutlinePlans({}, 'row', 'not-a-date'), []);
  for (const target of [0, 1.5, NaN, Infinity, '3']) {
    assert.equal(model.normalizeOutlinePlans([{ ...week(), targetCount: target }], 'row')[0].targetCount, null);
  }
});

test('shared persistence retains nested plans, links and habit goals without creating calendar blocks', async () => {
  const { service, createClient, writes, records } = setup();
  const habit = { ...service.createOutlineNode('Walk'), id: 'habit-row', tag: 'habit', target: 3,
    linked: { habitId: 'habit', themeId: 'theme', label: 'Walk' }, draftNote: 'Gentle walks',
    plans: [{ ...week(), targetCount: 2, scheduledBlockIds: ['existing-block'] }, week('next-week', '2026-11-02')] };
  const theme = { ...service.createOutlineNode('Home'), linked: { themeId: 'theme', label: 'Home' }, children: [habit] };
  await service.savePlanningOutliner('user', [theme]);
  const loaded = await createClient().loadPlanningOutliner('user');
  assert.deepEqual(loaded[0].children[0].plans, habit.plans);
  assert.equal(loaded[0].children[0].target, 3);
  assert.equal(loaded[0].children[0].draftNote, 'Gentle walks');
  assert.equal(records.planning_outliner_data.nodes[0].children[0].text, undefined);
  assert.deepEqual(writes, ['planning_outliner_data']);
});

test('plans survive moving, Trash and restore without changing original Outline content', () => {
  const { service } = setup();
  const item = { ...service.createOutlineNode('Photos'), id: 'photos', plans: [week()], draftNote: 'Keep notes' };
  const nodes = [item, { ...service.createOutlineNode('Home'), id: 'home' }];
  const moved = model.moveOutlineSelection(nodes, new Set(['photos']), 'home');
  moved[0].trashedAt = '2026-10-26T12:00:00Z';
  const restored = service.normalizeOutlineNode(model.serializeOutline(moved)[0]);
  assert.deepEqual(model.activeOutline([restored]), []);
  restored.trashedAt = null;
  assert.deepEqual(model.activeOutline([restored])[0].children[0].plans, [week()]);
  assert.equal(restored.children[0].draftNote, 'Keep notes');
  assert.equal(nodes[0].id, 'photos');
});

test('Outline clones and queued saves do not share mutable planning arrays', async () => {
  const { service } = setup();
  const original = { ...service.createOutlineNode('Photos'), plans: [{ ...week(), scheduledBlockIds: ['block'] }] };
  const copy = service.cloneOutlineNodes([original])[0];
  copy.plans[0].scheduledBlockIds.push('copy-only');
  assert.deepEqual(original.plans[0].scheduledBlockIds, ['block']);
  const saving = service.savePlanningOutliner('user', [original]);
  original.plans[0].scheduledBlockIds.push('after-save');
  await saving;
  assert.deepEqual((await service.loadPlanningOutliner('user'))[0].plans[0].scheduledBlockIds, ['block']);
});

test('failed saves preserve existing stored plans and can be retried without duplication', async () => {
  const { service, records, fail } = setup();
  const item = { ...service.createOutlineNode('Photos'), plans: [week()] };
  await service.savePlanningOutliner('user', [item]);
  const previous = structuredClone(records.planning_outliner_data.nodes);
  const next = { ...item, plans: [week(), week('next-week', '2026-11-02')] };
  fail();
  await assert.rejects(service.savePlanningOutliner('user', [next]), /Offline/);
  assert.deepEqual(records.planning_outliner_data.nodes, previous);
  await service.savePlanningOutliner('user', [next]);
  assert.deepEqual((await service.loadPlanningOutliner('user'))[0].plans, next.plans);
});
