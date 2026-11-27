import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/services/outlineModel.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { outlineCardSections, activeOutline, outlineTrashRoots, filterPlanningOutline, filterOutlineCategory, hydrateOutline, serializeOutline, outlineHabitPlacements, outlineSelectionRoots, outlineBranchItems, moveOutlineSelection, outlineMoveDestinations, revealOutlineItem, outlineDropPosition, applyOutlineDrop, moveOutlineOut, rememberOutlineMove, restoreOutlineMove } =
  await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));

const row = (id, tag = "note", children = [], linked = null) => ({
  id, text: id, tag, children, linked, frequency: "weekly", target: 3, collapsed: true,
  draftNote: "Keep my note", taskDone: false,
});
const habit = row("habit-row", "habit", [], { habitId: "habit-1", themeId: "theme-1", label: "Old alias" });
const task = row("task", "task");
const tree = [row("theme-row", "note", [
  habit, row("group", "note", [task, row("nested-note")]), row("plain-note"),
], { themeId: "theme-1", label: "Old theme" }), row("other-note")];
const themes = [{ id: "theme-1", name: "Everyday care" }];
const habits = [{ id: "habit-1", theme_id: "theme-1", name: "Walk outside", target_per_week: 4, frequency: "daily" }];

test('card sections group direct siblings by kind without mutating their saved order or nesting', () => {
  const children = [row('note'), row('habit', 'habit'), row('task-a', 'task'), row('subgroup', 'note', [row('nested', 'task')]), row('task-b', 'task'), row('reading', 'link'), row('routine', 'note', [], { routineId: 'r' })];
  const before = JSON.stringify(children);
  const sections = outlineCardSections(children);
  assert.deepEqual(sections.map(s => [s.key, s.items.map(n => n.id)]), [
    ['task', ['task-a', 'task-b']], ['habit', ['habit']], ['note', ['note']], ['link', ['reading']], ['routine', ['routine']], ['branches', ['subgroup']],
  ]);
  assert.equal(sections[5].items[0], children[3]);
  assert.equal(JSON.stringify(children), before);
});

test('empty structural groups and filtered branches keep their group presentation', () => {
  const full = [row('parent', 'note', [row('child', 'task')]), { ...row('empty'), isGroup: true }, row('theme', 'note', [], { themeId: 'theme' })];
  const filtered = [{ ...full[0], children: [] }, full[1], full[2]];
  assert.deepEqual(outlineCardSections(filtered, full).map(s => [s.key, s.items.length]), [['branches', 3]]);
  assert.deepEqual(outlineCardSections([]), []);
});

test("category views retain ancestor context without moving or duplicating items", () => {
  const original = JSON.stringify(tree);
  const tasks = filterOutlineCategory(tree, "task");
  assert.deepEqual(outlineBranchItems(tasks).map(item => item.id), ["theme-row", "group", "task"]);
  const habits = filterOutlineCategory(tree, "habit");
  assert.deepEqual(outlineBranchItems(habits).map(item => item.id), ["theme-row", "habit-row"]);
  assert.equal(JSON.stringify(tree), original);
});

test("notes exclude empty themes, routine containers and Trash", () => {
  const nodes = [row("theme", "note", [], { themeId: "theme" }), row("routine", "note", [], { routineId: "routine" }), row("note"), { ...row("hidden"), trashedAt: "2026-10-25" }];
  assert.deepEqual(filterOutlineCategory(nodes, "note").map(item => item.id), ["note"]);
  assert.deepEqual(filterOutlineCategory(nodes, "all").map(item => item.id), ["theme", "routine", "note"]);
});

test('groups are category ancestors, not notes, and preserve the inherited habit theme', () => {
  const group = { ...row('Kitchen', 'note', [task, habit]), isGroup: true };
  const nodes = [row('Home', 'note', [group], { themeId: 'theme-1' })];
  assert.deepEqual(filterOutlineCategory(nodes, 'note'), []);
  assert.deepEqual(outlineBranchItems(filterOutlineCategory(nodes, 'task')).map(node => node.id), ['Home', 'Kitchen', 'task']);
  assert.deepEqual(outlineHabitPlacements(nodes), [{ habitId: 'habit-1', themeId: 'theme-1', parentHabitId: null }]);
  assert.equal(hydrateOutline(serializeOutline(nodes), themes, habits)[0].children[0].isGroup, true);
});

test("batch selection counts selected descendants once and preserves outline order", () => {
  const roots = outlineSelectionRoots(tree, new Set(["task", "other-note", "group"]));
  assert.deepEqual(roots.map(node => node.id), ["group", "other-note"]);
  assert.deepEqual(outlineBranchItems(roots).map(node => node.id), ["group", "task", "nested-note", "other-note"]);
});

test("batch moves retain children and metadata without mutating the original", () => {
  const original = JSON.stringify(tree);
  const moved = moveOutlineSelection(tree, new Set(["task", "group", "habit-row"]), "other-note");
  assert.deepEqual(moved[0].children.map(node => node.id), ["plain-note"]);
  assert.deepEqual(moved[1].children.map(node => node.id), ["habit-row", "group"]);
  assert.equal(moved[1].collapsed, false);
  assert.deepEqual(moved[1].children[1], tree[0].children[1]);
  assert.deepEqual(moved[1].children[0].linked, habit.linked);
  assert.equal(JSON.stringify(tree), original);
});

test("batch moves reject missing, selected, nested and trashed destinations", () => {
  const items = [...tree, { ...row("trash", "note", [row("hidden")]), trashedAt: "2026-10-23" }];
  for (const destination of ["missing", "group", "task", "trash", "hidden"]) {
    assert.equal(moveOutlineSelection(items, new Set(["group"]), destination), items);
  }
  assert.equal(moveOutlineSelection(items, new Set(["missing", "trash", "hidden"]), null), items);
});

test('move destinations exclude entire selected and trashed branches, and retain ancestry', () => {
  const items = [...tree, { ...row('trash', 'note', [row('hidden')]), trashedAt: '2026-11-17' }];
  const options = outlineMoveDestinations(items, new Set(['group']));
  assert.deepEqual(options.map(item => item.id), ['theme-row', 'habit-row', 'plain-note', 'other-note']);
  assert.equal(options[0].container, true);
  assert.equal(options[1].path, 'theme-row');
  assert.equal(options[1].kind, 'habit');
  assert.equal(outlineMoveDestinations([{ ...row('group'), isGroup: true }], new Set())[0].container, true);
});

test('moving inside an ordinary note reveals its ancestors without changing plans or row types', () => {
  const linkedTask = { ...task, plans: [{ id: 'week', scheduledBlockIds: ['block-1'] }], linked: { blockId: 'block-1' } };
  const items = [row('source', 'note', [linkedTask]), row('destination', 'note', [row('deep', 'note', [row('note')])]), row('unrelated')];
  const original = JSON.stringify(items);
  const moved = revealOutlineItem(moveOutlineSelection(items, new Set(['task']), 'note'), 'task');
  assert.equal(moved[0].collapsed, true);
  assert.equal(moved[1].collapsed, false);
  assert.equal(moved[1].children[0].collapsed, false);
  const parent = moved[1].children[0].children[0];
  assert.equal(parent.collapsed, false);
  assert.equal(parent.tag, 'note');
  assert.equal(parent.isGroup, undefined);
  assert.deepEqual(parent.children[0], linkedTask);
  assert.equal(moved[2].collapsed, true);
  assert.equal(JSON.stringify(items), original);
  assert.equal(revealOutlineItem(items, 'missing'), items);
});

test('drag preview uses row edges for before/after and the middle for nesting', () => {
  assert.equal(outlineDropPosition(101, 100, 48), 'before');
  assert.equal(outlineDropPosition(111, 100, 48), 'before');
  assert.equal(outlineDropPosition(112, 100, 48), 'inside');
  assert.equal(outlineDropPosition(124, 100, 48), 'inside');
  assert.equal(outlineDropPosition(136, 100, 48), 'inside');
  assert.equal(outlineDropPosition(147, 100, 48), 'after');
  assert.equal(outlineDropPosition(0, 0, 0), 'inside');
});

test('before/after drops create siblings of the target, not children of its expanded branch', () => {
  const items = [row('first', 'note', [row('child')]), row('second'), row('last')];
  const before = applyOutlineDrop(items, 'last', 'first', 'before');
  assert.deepEqual(before.map(item => item.id), ['last', 'first', 'second']);
  const after = applyOutlineDrop(items, 'last', 'first', 'after');
  assert.deepEqual(after.map(item => item.id), ['first', 'last', 'second']);
  assert.deepEqual(after[0].children.map(item => item.id), ['child']);
  const nested = applyOutlineDrop(items, 'last', 'child', 'after');
  assert.deepEqual(nested[0].children.map(item => item.id), ['child', 'last']);
  assert.equal(nested[0].collapsed, false);
  assert.deepEqual(applyOutlineDrop(items, 'child', 'first', 'before').map(item => item.id), ['child', 'first', 'second', 'last']);
});

test('inside drops preserve whole branches, notes and calendar links, revealing the destination', () => {
  const source = { ...row('branch', 'task', [row('child')]), linked: { blockId: 'calendar' }, plans: [{ id: 'week', scheduledBlockIds: ['calendar'] }] };
  const items = [source, row('parent', 'note', [row('destination', 'note', [row('existing')])])];
  const original = JSON.stringify(items);
  const moved = applyOutlineDrop(items, 'branch', 'destination', 'inside');
  assert.equal(moved[0].collapsed, false);
  assert.equal(moved[0].children[0].collapsed, false);
  assert.equal(moved[0].children[0].isGroup, undefined);
  assert.deepEqual(moved[0].children[0].children, [items[1].children[0].children[0], source]);
  assert.equal(JSON.stringify(items), original);
});

test('every drop position rejects cycles, missing rows, and Trash without changing data', () => {
  const items = [...tree, { ...row('trash', 'note', [row('hidden')]), trashedAt: '2026-11-17' }];
  for (const position of ['before', 'inside', 'after']) {
    for (const target of ['group', 'task', 'nested-note', 'missing', 'trash', 'hidden']) {
      assert.equal(applyOutlineDrop(items, 'group', target, position), items);
    }
    for (const source of ['missing', 'trash', 'hidden']) assert.equal(applyOutlineDrop(items, source, 'group', position), items);
  }
});

test('move out lifts a whole branch directly after its parent and stops at the top level', () => {
  const moved = moveOutlineOut(tree, 'group');
  assert.deepEqual(moved.map(item => item.id), ['theme-row', 'group', 'other-note']);
  assert.deepEqual(moved[0].children.map(item => item.id), ['habit-row', 'plain-note']);
  assert.deepEqual(moved[1], tree[0].children[1]);
  const nested = moveOutlineOut(tree, 'task');
  assert.deepEqual(nested[0].children.map(item => item.id), ['habit-row', 'group', 'task', 'plain-note']);
  assert.equal(moveOutlineOut(tree, 'other-note'), tree);
  assert.equal(moveOutlineOut(tree, 'missing'), tree);
});

test('undo restores placement while retaining later content, children, completion and plans', () => {
  const moved = moveOutlineOut(tree, 'group');
  const undo = rememberOutlineMove(tree, moved, new Set(['group']));
  const edited = structuredClone(moved);
  Object.assign(edited[1], { text: 'Renamed', draftNote: 'New note', taskDone: true, linked: { blockId: 'new-block' }, plans: [{ id: 'new-plan' }] });
  edited[1].children.push(row('new-child'));
  edited[0].children.unshift(row('unrelated-new-item'));
  const restored = restoreOutlineMove(edited, undo);
  assert.equal(restored.error, undefined);
  assert.deepEqual(restored.nodes[0].children.map(item => item.id), ['unrelated-new-item', 'habit-row', 'group', 'plain-note']);
  assert.deepEqual(restored.nodes[0].children[2], edited[1]);
  assert.equal(restored.nodes[0].collapsed, false);
  assert.equal(edited[1].id, 'group');
});

test('undo batch moves restores original sibling order across multiple parents exactly once', () => {
  const items = [row('a', 'note', [row('a1'), row('a2'), row('a3')]), row('b', 'note', [row('b1'), row('b2')]), row('target')];
  const ids = new Set(['a1', 'a2', 'b2']);
  const moved = moveOutlineSelection(items, ids, 'target');
  const restored = restoreOutlineMove(moved, rememberOutlineMove(items, moved, ids));
  assert.equal(restored.error, undefined);
  assert.deepEqual(restored.nodes.map(item => item.children.map(child => child.id)), [['a1', 'a2', 'a3'], ['b1', 'b2'], []]);
});

test('undo tracks drag reordering and ignores no-op moves', () => {
  const items = [row('a'), row('b'), row('c')];
  const moved = applyOutlineDrop(items, 'a', 'c', 'after');
  assert.deepEqual(restoreOutlineMove(moved, rememberOutlineMove(items, moved, new Set(['a']))).nodes.map(item => item.id), ['a', 'b', 'c']);
  assert.equal(rememberOutlineMove(items, items, new Set(['a'])), null);
  assert.equal(rememberOutlineMove(items, applyOutlineDrop(items, 'a', 'b', 'before'), new Set(['a'])), null);
});

test('undo does not resurrect trashed items or parents or overwrite a subsequent move', () => {
  const moved = moveOutlineOut(tree, 'group');
  const undo = rememberOutlineMove(tree, moved, new Set(['group']));
  for (const id of ['group', 'theme-row']) {
    const changed = moved.map(item => item.id === id ? { ...item, trashedAt: '2026-11-18' } : item);
    const result = restoreOutlineMove(changed, undo);
    assert.ok(result.error);
    assert.equal(result.nodes, changed);
  }
  const movedAgain = applyOutlineDrop(moved, 'group', 'other-note', 'after');
  assert.ok(restoreOutlineMove(movedAgain, undo).error);
  const parentInsideSource = applyOutlineDrop(moved, 'theme-row', 'group', 'inside');
  assert.ok(restoreOutlineMove(parentInsideSource, undo).error);
});

test('undo tolerates removed original neighbors without losing unrelated new items', () => {
  const items = [row('parent', 'note', [row('before'), row('source'), row('after')]), row('target')];
  const moved = applyOutlineDrop(items, 'source', 'target', 'inside');
  const undo = rememberOutlineMove(items, moved, new Set(['source']));
  const changed = [{ ...moved[0], children: [row('new')] }, moved[1]];
  const result = restoreOutlineMove(changed, undo);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.nodes[0].children.map(item => item.id), ['new', 'source']);
});

test("moving to top level keeps selected outline order and independently trashed descendants", () => {
  const items = structuredClone(tree);
  items[0].children[1].children[1].trashedAt = "2026-10-23";
  const moved = moveOutlineSelection(items, new Set(["group", "habit-row"]), null);
  assert.deepEqual(moved.map(node => node.id), ["theme-row", "other-note", "habit-row", "group"]);
  assert.equal(moved[3].children[1].trashedAt, "2026-10-23");
  assert.deepEqual(outlineBranchItems([moved[3]]).map(node => node.id), ["group", "task"]);
});

test("planning filter preserves ancestors and tasks but hides unrelated notes", () => {
  const original = JSON.stringify(tree);
  const filtered = filterPlanningOutline(tree);
  assert.deepEqual(filtered.map((node) => node.id), ["theme-row"]);
  assert.deepEqual(filtered[0].children.map((node) => node.id), ["habit-row", "group"]);
  assert.deepEqual(filtered[0].children[1].children.map((node) => node.id), ["task"]);
  assert.equal(JSON.stringify(tree), original);
});

test("linked theme and habit names and settings are references, not stored copies", () => {
  const stored = serializeOutline(tree);
  assert.equal(stored[0].text, undefined);
  assert.equal(stored[0].children[0].text, undefined);
  assert.equal(stored[0].children[0].target, undefined);
  assert.equal(stored[0].children[0].frequency, undefined);
  assert.equal(stored[0].children[1].text, "group");
  assert.equal(stored[0].children[0].draftNote, "Keep my note");
});

test("reload reads the current canonical name and habit settings while keeping outline order", () => {
  const loaded = hydrateOutline(serializeOutline(tree), themes, habits);
  assert.equal(loaded[0].text, "Everyday care");
  assert.equal(loaded[0].children[0].text, "Walk outside");
  assert.equal(loaded[0].children[0].target, 4);
  assert.equal(loaded[0].children[0].frequency, "daily");
  assert.equal(loaded[0].collapsed, true);
  assert.equal(loaded[0].children[1].children[0].id, "task");
});

test("rows saved as New row by an older phone recover their shared names without losing notes", () => {
  const oldPhoneRows = serializeOutline(tree);
  oldPhoneRows[0].text = "New row";
  oldPhoneRows[0].children[0].text = "New row";
  const loaded = hydrateOutline(oldPhoneRows, themes, habits);
  assert.equal(loaded[0].text, "Everyday care");
  assert.equal(loaded[0].children[0].text, "Walk outside");
  assert.equal(loaded[0].children[0].draftNote, "Keep my note");
  assert.equal(loaded[0].children[1].children[0].id, "task");
  assert.equal(loaded[1].id, "other-note");
});

test("a task associated with a theme is not mistaken for the theme itself", () => {
  const taskWithTheme = row("task-name", "task", [], { themeId: "theme-1", blockId: "block-1", label: "task-name" });
  assert.equal(serializeOutline([taskWithTheme])[0].text, "task-name");
  assert.equal(hydrateOutline([taskWithTheme], themes, habits)[0].text, "task-name");
});

test("deleted entities do not leave duplicate rows or remove unrelated child notes", () => {
  const children = [row("keep-note")];
  const deleted = row("deleted-habit", "habit", children, { habitId: "missing", themeId: "theme-1", label: "" });
  assert.deepEqual(hydrateOutline([deleted], themes, habits).map((node) => node.id), ["keep-note"]);
});

test("moving a habit under another theme updates its placement and descendant habits", () => {
  const moved = row("other-theme", "note", [
    { ...habit, children: [row("child", "habit", [], { habitId: "habit-2", themeId: "theme-1", label: "Child" })] },
  ], { themeId: "theme-2", label: "Other theme" });
  assert.deepEqual(outlineHabitPlacements([moved]), [
    { habitId: "habit-1", themeId: "theme-2", parentHabitId: null },
    { habitId: "habit-2", themeId: "theme-2", parentHabitId: "habit-1" },
  ]);
});

test("trash hides a whole subtree without deleting its notes, links or placement", () => {
  const trashed = [{ ...tree[0], trashedAt: "2026-10-23T12:00:00Z" }, tree[1]];
  const original = JSON.stringify(trashed);
  assert.deepEqual(activeOutline(trashed).map(node => node.id), ["other-note"]);
  assert.deepEqual(filterPlanningOutline(trashed), []);
  assert.deepEqual(outlineTrashRoots(trashed).map(node => node.id), ["theme-row"]);
  assert.equal(outlineTrashRoots(trashed)[0].children[0].draftNote, "Keep my note");
  assert.deepEqual(outlineHabitPlacements(trashed), outlineHabitPlacements(tree));
  assert.equal(JSON.stringify(trashed), original);
});

test("nested trash survives serialization and canonical hydration, then restores in place", () => {
  const trashed = structuredClone(tree);
  trashed[0].children[0].trashedAt = "2026-10-23T12:00:00Z";
  const loaded = hydrateOutline(serializeOutline(trashed), themes, habits);
  assert.equal(outlineTrashRoots(loaded)[0].text, "Walk outside");
  assert.deepEqual(activeOutline(loaded)[0].children.map(node => node.id), ["group", "plain-note"]);
  loaded[0].children[0].trashedAt = null;
  assert.equal(activeOutline(loaded)[0].children[0].id, "habit-row");
  assert.deepEqual(outlineTrashRoots(loaded), []);
});

test("restoring a parent does not restore children independently trashed earlier", () => {
  const trashed = structuredClone(tree);
  trashed[0].trashedAt = "2026-10-23T12:00:00Z";
  trashed[0].children[0].trashedAt = "2026-10-22T12:00:00Z";
  assert.equal(outlineTrashRoots(trashed).length, 1);
  trashed[0].trashedAt = null;
  assert.equal(outlineTrashRoots(trashed)[0].id, "habit-row");
  assert.equal(activeOutline(trashed)[0].children.some(node => node.id === "habit-row"), false);
});

test("removing a canonical entity does not resurrect its trashed child notes", () => {
  const deleted = { ...habit, trashedAt: "2026-10-23T12:00:00Z", children: [row("keep-note")] };
  const loaded = hydrateOutline([deleted], themes, []);
  assert.deepEqual(activeOutline(loaded), []);
  assert.equal(outlineTrashRoots(loaded)[0].id, "keep-note");
});

test('moving into a collapsed destination can preserve its collapsed state', () => {
  const source = row('source', 'task');
  const destination = row('destination');
  const moved = moveOutlineSelection([source, destination], new Set(['source']), 'destination', { revealParent: false });
  assert.equal(moved[0].collapsed, true);
  assert.equal(moved[0].children[0].id, 'source');
  assert.equal(moveOutlineSelection([source, destination], new Set(['source']), 'destination')[0].collapsed, false);
});
