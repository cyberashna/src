import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../src/services/cardTypes.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { outlineCardType, prepareOutlineTypeChange, outlineTypeRestriction, outlineTypeBlockIds, blockTypePatch, withoutOutlinePlanning, describeOutlinePlanning, canUnlinkOutlinePlanning, outlinePlanningKey } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

test('Link conversion keeps resource metadata and calendar classification is reversible', () => {
  const node = { id: 'reading', tag: 'note', text: 'Article', plans: [], readingLink: { url: 'https://example.org/article' }, children: [], draftNote: 'My notes' };
  const converted = prepareOutlineTypeChange(node, 'link');
  assert.equal(outlineCardType(converted), 'link');
  assert.deepEqual(converted.readingLink, node.readingLink);
  assert.equal(converted.draftNote, node.draftNote);
  assert.deepEqual(blockTypePatch('Task: Article', 'link'), { label: 'Link: Article', hashtag: 'link' });
  assert.deepEqual(blockTypePatch('Link: Article', 'note'), { label: 'Note: Article', hashtag: 'note' });
});
const row = (extra = {}) => ({ id: 'row', text: 'Kitchen', tag: 'task', taskDone: true, children: [{ id: 'child' }], draftNote: 'Keep this', frequency: 'weekly', target: 3, plans: [], linked: null, ...extra });

test('task/note changes retain identity, notes, children, completion and plan ownership', () => {
  const node = row({ linked: { blockId: 'b' }, plans: [{ id: 'plan', scheduledBlockIds: ['b'] }] });
  const original = structuredClone(node);
  const note = prepareOutlineTypeChange(node, 'note');
  assert.deepEqual(note, { ...node, tag: 'note', isGroup: false });
  assert.deepEqual(prepareOutlineTypeChange(note, 'task'), { ...node, isGroup: false });
  assert.deepEqual(node, original);
});

test('groups use existing Outline identity and keep nested items, with reversible typing', () => {
  const node = row();
  const group = prepareOutlineTypeChange(node, 'group');
  assert.equal(outlineCardType(group), 'group');
  assert.equal(group.tag, 'note');
  assert.equal(group.children, node.children);
  assert.equal(group.linked, null);
  assert.equal(outlineCardType(prepareOutlineTypeChange(group, 'note')), 'note');
  assert.equal(outlineCardType(prepareOutlineTypeChange(group, 'habit')), 'habit');
});

test('groups cannot silently swallow their own plans or calendar block', () => {
  for (const extra of [{ linked: { blockId: 'b' } }, { planDate: '2026-11-02' }, { plans: [{ id: 'p', scheduledBlockIds: [] }] }]) {
    assert.throws(() => prepareOutlineTypeChange(row(extra), 'group'), /planning links/);
  }
});

test('canonical habit, theme and routine histories are protected', () => {
  for (const linked of [{ habitId: 'h' }, { themeId: 't' }, { routineId: 'r' }]) {
    assert.ok(outlineTypeRestriction(row({ linked }), 'note'));
    assert.throws(() => prepareOutlineTypeChange(row({ linked }), 'note'));
  }
  assert.equal(outlineTypeRestriction(row({ tag: 'habit', linked: { habitId: 'h' } }), 'habit'), null);
});

test('plain items can become habits but scheduled/repeating plans are not reinterpreted', () => {
  assert.equal(prepareOutlineTypeChange(row(), 'habit').tag, 'habit');
  assert.throws(() => prepareOutlineTypeChange(row({ linked: { blockId: 'b' } }), 'habit'), /calendar plans/);
  assert.throws(() => prepareOutlineTypeChange(row({ tag: 'habit', plans: [{ id: 'p' }] }), 'task'), /own plans/);
});

test('all related occurrences are included exactly once, not child cards', () => {
  assert.deepEqual(outlineTypeBlockIds(row({ linked: { blockId: 'a' }, plans: [{ scheduledBlockIds: ['a', 'b'], occurrenceBlockId: 'c' }, { scheduledBlockIds: ['c'] }], children: [{ linked: { blockId: 'child' } }] })), ['a', 'b', 'c']);
});

test('grid type updates only classification and remove old prefixes idempotently', () => {
  for (const label of ['Plan: Walk', 'Task: Walk', 'Note: Walk', 'Block: Walk', 'Walk']) {
    assert.deepEqual(blockTypePatch(label, 'note'), { label: 'Note: Walk', hashtag: 'note' });
    assert.deepEqual(blockTypePatch(blockTypePatch(label, 'note').label, 'task'), { label: 'Task: Walk', hashtag: 'task' });
  }
});

test('explicit unlinking converts only the parent, preserving notes, children, identity and completion', () => {
  const node = row({ planDate: '2026-11-11', linked: { blockId: 'waiting', themeId: 't', label: 'Old note' }, plans: [{ id: 'plan', scheduledBlockIds: ['scheduled'] }] });
  const before = structuredClone(node);
  const group = withoutOutlinePlanning(node, true, 'Linked calendar note');
  assert.equal(group.id, node.id);
  assert.equal(group.isGroup, true);
  assert.equal(group.tag, 'note');
  assert.equal(group.linked, null);
  assert.deepEqual(group.plans, []);
  assert.equal(group.planDate, null);
  assert.equal(group.draftNote, 'Keep this');
  assert.equal(group.children, node.children);
  assert.equal(group.taskDone, node.taskDone);
  assert.deepEqual(node, before);
  assert.equal(outlineTypeRestriction(group, 'group'), null);
});

test('unlinking can retain the current type and brings across a linked note when the row has none', () => {
  const node = row({ tag: 'note', linked: { blockId: 'b' }, draftNote: '' });
  const detached = withoutOutlinePlanning(node, false, 'Only saved on the block');
  assert.equal(detached.tag, 'note');
  assert.equal(detached.isGroup, undefined);
  assert.equal(detached.draftNote, 'Only saved on the block');
  assert.notEqual(outlinePlanningKey(detached), outlinePlanningKey(node));
  assert.equal(outlinePlanningKey({ ...node, text: 'Renamed', draftNote: 'Changed note' }), outlinePlanningKey(node));
});

test('unlinking never bypasses protected habit, theme or routine ownership', () => {
  for (const node of [row({ tag: 'habit' }), row({ linked: { habitId: 'h', blockId: 'b' } }), row({ linked: { routineId: 'r', blockId: 'b' } }), row({ linked: { themeId: 't' } })]) {
    assert.equal(canUnlinkOutlinePlanning(node), false);
    assert.throws(() => withoutOutlinePlanning(node, true), /protected/);
  }
});

test('planning details distinguish loose plans, Waiting, completed history and missing links', () => {
  const node = row({ linked: { blockId: 'waiting' }, planDate: '2026-11-13', plans: [
    { id: 'week', scope: 'week', date: '2026-11-09', scheduledBlockIds: [] },
    { id: 'day', scope: 'day', date: '2026-11-11', scheduledBlockIds: [] },
    { id: 'timed', scope: 'day', date: '2026-11-12', scheduledBlockIds: ['timed', 'missing'] },
  ] });
  const blocks = [
    { id: 'waiting', label: 'Waiting note', completed: false, location_type: 'unscheduled' },
    { id: 'timed', label: 'Finished note', completed: true, location_type: 'slot', week_start_date: '2026-11-09', day_index: 3, time_index: 0 },
  ];
  const before = structuredClone(blocks);
  const details = describeOutlinePlanning(node, blocks, ['9:00 AM']);
  assert.equal(details.find(item => item.id === 'block:waiting').detail, 'Waiting - no date or time');
  assert.match(details.find(item => item.id === 'block:timed').detail, /Calendar.*12.*9:00 AM.*completed/);
  assert.equal(details.find(item => item.id === 'block:missing').detail, 'Linked item no longer exists');
  assert.equal(details.find(item => item.id === 'plan:week').detail, 'Loose weekly plan');
  assert.equal(details.find(item => item.id === 'plan:day').detail, 'Any-time plan');
  assert.equal(details.find(item => item.id === 'day-preference').detail, 'Day preference');
  assert.deepEqual(blocks, before);
});
