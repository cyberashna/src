import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../src/services/gridCapture.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(() => ({ database: {} }), module, module.exports);
const { persistGridCapture } = module.exports;
const draft = { id: 'block-one', taskId: 'task-one', text: 'Walk by the river', mode: 'note', weekStartDate: '2026-11-02', dayIndex: 1, timeIndex: 8, creditHabitId: 'walk' };

function setup(failure) {
  const rows = { blocks: new Map(), notes: new Map(), tasks: new Map(), credits: new Map() };
  const fail = step => { if (failure === step) { failure = null; throw new Error('Offline'); } };
  const db = {
    blocks: { ensureWithId: async (user, id, block) => { fail('block'); if (!rows.blocks.has(id)) rows.blocks.set(id, { ...block, id, user_id: user }); }, getByIds: async (_user, ids) => { fail('read'); return ids.map(id => rows.blocks.get(id)).filter(Boolean); } },
    blockNotes: { getByBlock: async id => rows.notes.get(id), upsert: async (_user, id, content) => { fail('note'); rows.notes.set(id, { content }); } },
    blockTasks: { ensureWithIds: async (_user, blockId, items) => { fail('task'); items.forEach(item => { if (!rows.tasks.has(item.id)) rows.tasks.set(item.id, { ...item, block_id: blockId, completed: false }); }); }, getByBlock: async blockId => [...rows.tasks.values()].filter(task => task.block_id === blockId) },
    blockHabitCredits: { ensure: async (_user, blockId, habitId) => { fail('credit'); rows.credits.set(`${blockId}:${habitId}`, { block_id: blockId, habit_id: habitId }); }, getByBlock: async blockId => [...rows.credits.values()].filter(credit => credit.block_id === blockId) },
  };
  return { rows, db };
}

test('one-off note keeps its identity, note and slot; credit does not make it an Outline habit', async () => {
  const { db, rows } = setup();
  const result = await persistGridCapture('user', draft, db);
  assert.equal(result.block.is_habit_block, false);
  assert.equal(result.block.habit_id, null);
  assert.equal(result.block.completed, false);
  assert.equal(result.block.week_start_date, draft.weekStartDate);
  assert.equal(result.note.content, draft.text);
  assert.deepEqual(result.credits, [{ block_id: draft.id, habit_id: 'walk' }]);
  assert.equal(rows.tasks.size, 0);
});
test('uncredited capture makes no habit credit and a task gets its own checklist', async () => {
  const { db } = setup();
  const result = await persistGridCapture('user', { ...draft, mode: 'task', creditHabitId: '' }, db);
  assert.deepEqual(result.credits, []);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].label, draft.text);
  assert.equal(result.tasks[0].completed, false);
});
for (const failure of ['block', 'note', 'credit', 'read', 'task']) test(`retry after ${failure} failure finishes the same capture without duplicates`, async () => {
  const { db, rows } = setup(failure);
  const request = { ...draft, mode: failure === 'task' ? 'task' : 'note' };
  await assert.rejects(persistGridCapture('user', request, db), /Offline/);
  await persistGridCapture('user', request, db);
  await persistGridCapture('user', request, db);
  assert.equal(rows.blocks.size, 1);
  assert.equal(rows.credits.size, 1);
  assert.equal(rows.tasks.size, failure === 'task' ? 1 : 0);
});
test('retry never overwrites subsequent block, note or task edits', async () => {
  const { db, rows } = setup();
  await persistGridCapture('user', draft, db);
  rows.notes.set(draft.id, { content: 'Edited note' });
  rows.blocks.get(draft.id).completed = true;
  const result = await persistGridCapture('user', draft, db);
  assert.equal(result.note.content, 'Edited note');
  assert.equal(result.block.completed, true);
});
