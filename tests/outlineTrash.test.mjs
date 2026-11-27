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
const setup = () => {
  const records = {
    planning_outliner_data: { nodes: [] },
    themes: [{ id: 'theme', name: 'Health' }],
    habits: [{ id: 'habit', name: 'Walk', theme_id: 'theme', target_per_week: 3, frequency: 'weekly' }],
  };
  const service = compile('../src/services/planningOutliner.ts', {
    './outlineModel': model,
    '../lib/supabase': { supabase: { from(table) {
      const query = {
        select: () => query, eq: () => query, maybeSingle: () => query,
        upsert: value => { records[table] = structuredClone(value); return Promise.resolve({ error: null }); },
        then: resolve => resolve({ data: structuredClone(records[table]), error: null }),
      };
      return query;
    } } },
  });
  const task = { ...service.createOutlineNode('Dentist'), id: 'task-row', tag: 'task', taskDone: true,
    reminderAt: '2026-10-01T12:00:00Z', draftNote: 'Keep the appointment notes' };
  const habit = { ...service.createOutlineNode('Walk'), id: 'habit-row', tag: 'habit', linked: { habitId: 'habit', themeId: 'theme', label: 'Walk' } };
  const theme = { ...service.createOutlineNode('Health'), id: 'theme-row', linked: { themeId: 'theme', label: 'Health' }, children: [task, habit] };
  return { service, records, theme };
};

test('linked rows in Trash stay removed after save, reload and canonical sync', async () => {
  const { service, theme } = setup();
  const nodes = [{ ...theme, trashedAt: '2026-10-23T12:00:00Z' }];
  await service.savePlanningOutliner('user', nodes);
  const result = await service.syncThemesToPlanningOutliner('user', [{
    themeId: 'theme', themeName: 'Health', habits: [{ habitId: 'habit', habitName: 'Walk', themeId: 'theme', themeName: 'Health', target: 3, frequency: 'weekly' }],
  }]);
  assert.equal(result.createdThemes, 0);
  assert.equal(result.createdHabits, 0);
  assert.equal(result.nodes.length, 1);
  assert.deepEqual(model.activeOutline(result.nodes), []);
  assert.equal(result.nodes[0].children[0].draftNote, 'Keep the appointment notes');
});

test('trashed parents suppress nested reminders, restoring brings the original tree back', async () => {
  const { service, theme } = setup();
  await service.savePlanningOutliner('user', [{ ...theme, trashedAt: '2026-10-23T12:00:00Z' }]);
  assert.equal(await service.getDueOutlinerReminder('user', new Date('2026-10-24T12:00:00Z')), null);
  const loaded = await service.loadPlanningOutliner('user');
  const restored = service.updateOutlineNode(loaded, 'theme-row', row => ({ ...row, trashedAt: null }));
  await service.savePlanningOutliner('user', restored);
  assert.equal((await service.getDueOutlinerReminder('user', new Date('2026-10-24T12:00:00Z'))).id, 'task-row');
  assert.equal(model.activeOutline(await service.loadPlanningOutliner('user'))[0].children.length, 2);
});

test('older saved outlines without Trash metadata still load normally', () => {
  const { service } = setup();
  const node = service.normalizeOutlineNode({ id: 'old', text: 'Existing note', children: [] });
  assert.equal(node.trashedAt, null);
  assert.equal(model.activeOutline([node])[0].id, 'old');
});
