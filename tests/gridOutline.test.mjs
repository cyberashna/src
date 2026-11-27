import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../src/services/gridOutline.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { findGridOutlineEntry, gridOutlineDestinations, insertGridOutlineEntry, placeGridOutlineEntry, placeOccurrenceNote, gridHabitCreditChoices } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const node = (id, children = [], linked = null) => ({ id, text: id, children, linked, collapsed: true });
const occurrenceNote = () => ({ ...node('copy-id'), text: 'Walk: note', tag: 'note', draftNote: 'Tried the riverside route', plans: [], planDate: null });

test('saving an occurrence note creates an independent child without changing its source', () => {
  const source = { ...node('Walk', [node('Existing note')], { habitId: 'h', blockId: 'b' }), draftNote: 'Original instructions', target: 3 };
  const before = structuredClone(source);
  const draft = occurrenceNote();
  const next = placeOccurrenceNote([source], draft, 'Walk');
  assert.equal(next[0].children.length, 2);
  assert.equal(next[0].children[1], draft);
  assert.equal(draft.linked, null);
  assert.equal(next[0].draftNote, 'Original instructions');
  assert.deepEqual(next[0].linked, source.linked);
  assert.equal(next[0].target, 3);
  assert.deepEqual(source, before);
});

test('occurrence copies support groups and top level; retries do not duplicate or replace edits', () => {
  const draft = occurrenceNote();
  const grouped = placeOccurrenceNote([{ ...node('Kitchen'), isGroup: true }], draft, 'Kitchen');
  assert.equal(grouped[0].children[0].id, draft.id);
  const saved = placeOccurrenceNote([], draft, '');
  saved[0].draftNote = 'Edited later in Outline';
  assert.equal(placeOccurrenceNote(saved, occurrenceNote(), 'missing'), saved);
  assert.equal(saved[0].draftNote, 'Edited later in Outline');
  assert.equal(saved.length, 1);
});

test('occurrence copies reject blank notes, stale destinations, Trash and accidental source links', () => {
  const draft = occurrenceNote();
  assert.throws(() => placeOccurrenceNote([], { ...draft, draftNote: ' ' }, ''));
  assert.throws(() => placeOccurrenceNote([], { ...draft, text: ' ' }, ''));
  assert.throws(() => placeOccurrenceNote([], { ...draft, linked: { blockId: 'source' } }, ''));
  assert.throws(() => placeOccurrenceNote([], draft, 'missing'));
  assert.throws(() => placeOccurrenceNote([{ ...node('Trash'), trashedAt: 'today' }], draft, 'Trash'));
  assert.throws(() => placeOccurrenceNote([{ ...node('Trash', [draft]), trashedAt: 'today' }], draft, ''), /Trash/);
});
test('credit choices are real Outline habits with full paths, excluding Trash descendants', () => {
  const nodes = [node('Home', [node('Care', [node('Loose note')], { habitId: 'care' }), node('Task')]),
    { ...node('Removed', [node('Hidden habit', [], { habitId: 'hidden' })]), trashedAt: 'today' }];
  assert.deepEqual(gridHabitCreditChoices(nodes), [{ id: 'care', label: 'Home / Care' }]);
});
test('destinations include full paths and nearest theme and habit context', () => {
  const nodes = [node('Home', [node('Clean', [node('Kitchen')], { habitId: 'habit' })], { themeId: 'theme' })];
  assert.deepEqual(gridOutlineDestinations(nodes)[2], { id: 'Kitchen', label: 'Home / Clean / Kitchen', themeId: 'theme', parentHabitId: 'habit' });
});
test('placement preserves source identity, notes and completion without mutating the tree', () => {
  const nodes = [node('Home', [node('Existing')])], original = JSON.stringify(nodes);
  const item = { ...node('Capture', [], { blockId: 'block' }), draftNote: 'Notes', taskDone: true };
  const next = insertGridOutlineEntry(nodes, item, 'Home');
  assert.equal(next[0].collapsed, false); assert.equal(next[0].children[1], item);
  assert.equal(JSON.stringify(nodes), original);
  assert.equal(insertGridOutlineEntry(next, item, ''), next);
});
test('linked entries in Trash cannot be duplicated and trashed parents cannot receive items', () => {
  const nodes = [{ ...node('Removed', [node('Child', [], { blockId: 'block' })]), trashedAt: '2026-10-26' }];
  assert.equal(findGridOutlineEntry(nodes, { id: 'block' }).inTrash, true);
  assert.deepEqual(gridOutlineDestinations(nodes), []);
  assert.equal(insertGridOutlineEntry(nodes, node('Duplicate', [], { blockId: 'block' }), ''), nodes);
  assert.throws(() => insertGridOutlineEntry(nodes, node('New'), 'Removed'));
});
test('habit occurrences reuse the canonical Outline entry; exact block links take precedence', () => {
  const habit = node('Habit', [], { habitId: 'habit' }), exact = node('Exact', [], { blockId: 'block' });
  assert.equal(findGridOutlineEntry([habit], { id: 'new-block', habitId: 'habit' }).node.id, 'Habit');
  assert.equal(findGridOutlineEntry([habit, exact], { id: 'block', habitId: 'habit' }).node.id, 'Exact');
});
test('routine sessions resolve to one Outline home when timed or released, including Trash', () => {
  const routine = { ...node('Morning', [], { routineId: 'morning' }), plans: [
    { scheduledBlockIds: ['timed'], occurrenceBlockId: 'timed' },
    { scheduledBlockIds: [], occurrenceBlockId: 'released' },
  ] };
  for (const id of ['timed', 'released']) {
    assert.equal(findGridOutlineEntry([routine], { id }).node.id, 'Morning');
    assert.equal(insertGridOutlineEntry([routine], node('Duplicate', [], { blockId: id }), '').length, 1);
    assert.equal(findGridOutlineEntry([{ ...routine, trashedAt: '2026-10-26' }], { id }).inTrash, true);
  }
});
test('retry preserves identity while applying a changed type and destination', () => {
  const draft = { ...node('Capture', [], { blockId: 'block' }), tag: 'task', draftNote: 'Keep me', taskDone: true };
  const first = placeGridOutlineEntry([node('Home'), node('Work')], draft, 'Home');
  const retry = placeGridOutlineEntry(first.nodes, { ...draft, id: 'different-id', tag: 'note' }, 'Work');
  assert.equal(retry.node.id, 'Capture');
  assert.equal(retry.nodes[0].children.length, 0);
  assert.equal(retry.nodes[1].children[0].tag, 'note');
  assert.equal(retry.node.draftNote, 'Keep me');
});
test('new canonical habit sync respects the selected branch and reconciles optimistic task retry', () => {
  const canonical = node('Auto habit', [], { habitId: 'habit', themeId: 'theme' });
  const task = { ...node('Task retry', [], { blockId: 'block' }), draftNote: 'Notes' };
  const draft = { ...task, tag: 'habit', linked: { blockId: 'block', habitId: 'habit', themeId: 'theme' } };
  const placed = placeGridOutlineEntry([node('Theme', [canonical]), node('Branch'), task], draft, 'Branch', true);
  assert.equal(placed.nodes.length, 2);
  assert.equal(placed.nodes[0].children.length, 0);
  assert.equal(placed.nodes[1].children[0].id, canonical.id);
  assert.equal(placed.node.linked.blockId, 'block');
  assert.equal(placed.node.draftNote, 'Notes');
});
test('existing habits keep their home, settings, previous block link and notes on repeated linking', () => {
  const habit = { ...node('Habit', [], { habitId: 'habit', blockId: 'old' }), draftNote: 'Habit notes', target: 5 };
  const draft = { ...node('Capture', [], { habitId: 'habit', blockId: 'new' }), draftNote: 'Calendar notes', target: 3 };
  const first = placeGridOutlineEntry([node('Home', [habit]), node('Other')], draft, 'Other');
  const second = placeGridOutlineEntry(first.nodes, draft, 'Other');
  assert.deepEqual(second.nodes, first.nodes);
  assert.equal(second.nodes[0].children[0].target, 5);
  assert.equal(second.node.linked.blockId, 'old');
  assert.equal(second.node.draftNote, 'Habit notes\n\nCalendar notes');
});
test('reconciliation rejects Trash and self or descendant placement', () => {
  const draft = node('Capture', [node('Child')], { blockId: 'block' });
  assert.throws(() => placeGridOutlineEntry([draft], draft, 'Capture'));
  assert.throws(() => placeGridOutlineEntry([draft], draft, 'Child'));
  assert.throws(() => placeGridOutlineEntry([{ ...draft, trashedAt: 'today' }], draft, ''));
});
