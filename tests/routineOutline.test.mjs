import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/services/routineNotes.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { addOutlineItemToRoutine, resolveRoutineOutlineLabels, normalizeRoutine } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const routine = { id: 'morning', name: 'Morning', items: [], notes: '', category: 'morning', completedByDate: { '2026-10-25': ['old'] } };

test('adding to a routine creates a source reference and is idempotent', () => {
  const next = addOutlineItemToRoutine([routine], 'morning', { id: 'task', text: 'Stretch' });
  assert.equal(next[0].items[0].sourceOutlineId, 'task');
  assert.equal(routine.items.length, 0);
  assert.deepEqual(next[0].completedByDate, routine.completedByDate);
  const repeated = addOutlineItemToRoutine(next, 'morning', { id: 'task', text: 'Stretch' });
  assert.equal(repeated[0].items.length, 1);
  assert.equal(repeated[0].items[0].id, next[0].items[0].id);
  assert.throws(() => addOutlineItemToRoutine(next, 'missing', { id: 'task', text: 'Stretch' }));
});

test('source references survive normalization and names resolve from nested Outline items', () => {
  const next = addOutlineItemToRoutine([routine], 'morning', { id: 'task', text: 'Stretch' }).map(normalizeRoutine);
  const resolved = resolveRoutineOutlineLabels(next, [{ id: 'theme', text: 'Health', children: [{ id: 'task', text: 'Gentle stretching' }] }]);
  assert.equal(resolved[0].items[0].label, 'Gentle stretching');
  assert.equal(resolved[0].items[0].sourceOutlineId, 'task');
  assert.equal(next[0].items[0].label, 'Stretch');
  assert.equal(resolveRoutineOutlineLabels(next, [])[0].items[0].label, 'Stretch');
});

test('essential flags survive normalization and linked Outline label refresh', () => {
  const template = { ...routine, items: [{ id: 'step', label: 'Stretch', sourceOutlineId: 'task', essential: true }] };
  const normalized = normalizeRoutine(template);
  assert.equal(normalized.items[0].essential, true);
  const resolved = resolveRoutineOutlineLabels([normalized], [{ id: 'task', text: 'Gentle stretching' }]);
  assert.equal(resolved[0].items[0].essential, true);
  assert.equal(resolved[0].items[0].label, 'Gentle stretching');
  assert.equal(normalizeRoutine({ ...routine, items: [{ id: 'old', label: 'Old step' }] }).items[0].essential, undefined);
});
