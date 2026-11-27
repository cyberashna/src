import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { readingDependencies } from './helpers/readingLinkModules.mjs';

const require = createRequire(import.meta.url);
const compile = (path, dependencies = {}) => {
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(id => dependencies[id] ?? require(id), module, module.exports);
  return module.exports;
};
const model = compile('../src/services/outlineModel.ts');
const shell = compile('../src/components/PlannerShell.tsx', { ...readingDependencies, '../services/planningDate': compile('../src/services/planningDate.ts') });
const picker = compile('../src/components/OutlineTypePicker.tsx', { '../services/cardTypes': compile('../src/services/cardTypes.ts') });
const movePicker = compile('../src/components/OutlineMovePicker.tsx', { '../services/outlineModel': model, './PlannerShell': shell });
const { default: Outline } = compile('../src/components/PlanningOutlinerPanel.tsx', {
  ...readingDependencies,
  '../services/outlineModel': model, '../services/planningOutliner': {}, './PlannerShell': shell,
  './OutlineTypePicker': picker,
  './OutlineMovePicker': movePicker,
});
const row = (id, tag = 'note', children = [], linked = null) => ({
  id, text: id, tag, children, linked, collapsed: false, taskDone: false, frequency: 'weekly', target: 3,
  draftNote: '', reminderAt: null, planDate: null,
});
const nodes = [row('Health', 'note', [row('Walk', 'habit'), row('Dentist', 'task'), row('Ideas')], { themeId: 'theme', label: 'Health' })];
const render = (items = nodes, planningOnly = false) => {
  globalThis.localStorage = { getItem: () => String(planningOnly) };
  try {
    return renderToStaticMarkup(React.createElement(Outline, {
      userId: 'test', nodes: items, themes: [], boardHabitIds: [], presentation: 'inline', onPlan: () => {},
    }));
  } finally { delete globalThis.localStorage; }
};

test('only parents have collapse buttons; non-tasks no longer have clickable completion-like dots', () => {
  const html = render();
  assert.equal((html.match(/aria-expanded=/g) ?? []).length, 1);
  assert.match(html, /aria-label="Collapse Health"/);
  assert.doesNotMatch(html, /Focus this row|outliner-bullet/);
  assert.match(html, /role="checkbox" aria-checked="false" aria-label="Complete Dentist"/);
});

test('planning is directly available for tasks, habits and notes without enabling a filter', () => {
  const html = render();
  assert.match(html, /aria-label="Plan Walk"/);
  assert.match(html, /aria-label="Plan Dentist"/);
  assert.match(html, /aria-label="Plan Ideas"/);
  assert.doesNotMatch(html, /aria-label="Plan Health"/);
  assert.match(html, /aria-label="Actions for Ideas"/);
  assert.doesNotMatch(html, /<select[^>]*outliner-tag-select/);
});

test('every active row has a direct move action and nested rows have branch guides', () => {
  const html = render();
  for (const name of ['Health', 'Walk', 'Dentist', 'Ideas']) assert.ok(html.includes(`aria-label="Move ${name}"`));
  assert.match(html, /class="outliner-children"/);
  assert.match(html, /aria-label="Drag Dentist to move or nest"/);
  assert.match(html, /aria-live="polite" aria-atomic="true"/);
});

test('move picker distinguishes containers, other row types, paths and current location', () => {
  const html = renderToStaticMarkup(React.createElement(movePicker.OutlineMovePicker, {
    nodes, ids: ['Dentist'], summary: 'Dentist', currentParentId: 'Health', onClose() {}, onMove() {},
  }));
  assert.match(html, /Search destinations/);
  assert.match(html, /Themes &amp; groups/);
  assert.match(html, /Other items/);
  assert.match(html, /Current location/);
  assert.match(html, /Already in this location/);
  assert.match(html, /<button type="button" disabled="">[\s\S]*Move here/);
  assert.doesNotMatch(html, /<strong>Dentist<\/strong>/);
  assert.match(html, /<strong>Ideas<\/strong>/);
});

test('move picker offers a one-step outdent only when the parent supplies a valid action', () => {
  const props = { nodes, ids: ['Dentist'], summary: 'Dentist', currentParentId: 'Health', onClose() {}, onMove() {} };
  assert.match(renderToStaticMarkup(React.createElement(movePicker.OutlineMovePicker, { ...props, onMoveOut() {} })), /Move out one level/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(movePicker.OutlineMovePicker, { ...props, currentParentId: null })), /Move out one level/);
});

test('completed tasks offer Trash instead of planning and retain accessible completion state', () => {
  const html = render([{ ...row('Done task', 'task'), taskDone: true }]);
  assert.match(html, /aria-checked="true"/);
  assert.match(html, /aria-label="Move Done task to Trash"/);
  assert.doesNotMatch(html, /aria-label="Plan Done task"/);
});

test('category views and theme navigation are available without inheriting a hidden old filter', () => {
  const html = render(nodes, true);
  assert.match(html, /aria-label="Outline category"/);
  assert.match(html, />Tasks<\/button>/);
  assert.match(html, />Notes<\/button>/);
  assert.match(html, />Habits<\/button>/);
  assert.match(html, /Whole outline/);
  assert.match(html, /Details for Ideas/);
  assert.match(html, /Details for Health/);
});

test('groups are headings with a folder, not schedulable notes or completed tasks', () => {
  const html = render([{ ...row('Kitchen', 'note', [row('Dishes', 'task')]), isGroup: true, taskDone: true }]);
  assert.match(html, /title="Group"/);
  assert.match(html, /aria-label="Plan Dishes"/);
  assert.doesNotMatch(html, /aria-label="Plan Kitchen"|outliner-input--done/);
});

test('reading entries expose a category, completion, planning and a safe preview', () => {
  const link = { ...row('Read article', 'link'), readingLink: { url: 'https://example.org/article' } };
  const html = render([link]);
  assert.match(html, />Links<\/button>/);
  assert.match(html, /aria-label="Plan Read article"/);
  assert.match(html, /title="Mark read"/);
  assert.match(html, /aria-label="Read Read article on example.org"/);
  assert.doesNotMatch(render([{ ...link, taskDone: true }]), /aria-label="Plan Read article"/);
});

test('type details expose planning links and wait for inspection before enabling unlink', () => {
  const renderPicker = node => renderToStaticMarkup(React.createElement(picker.OutlineTypePicker, {
    node, onChange: async () => {}, onLoadPlanning: async () => [], onUnlinkPlanning: async () => {},
  }));
  const linked = renderPicker({ ...row('Waiting note'), linked: { blockId: 'waiting' } });
  assert.match(linked, /Plans &amp; calendar links/);
  assert.match(linked, /Checking linked items/);
  assert.match(linked, /<button type="button" disabled="">[\s\S]*Unlink plans/);
  assert.doesNotMatch(renderPicker(row('Unplanned note')), /Plans &amp; calendar links|Unlink plans/);
  assert.doesNotMatch(renderPicker({ ...row('Walk', 'habit'), linked: { habitId: 'h', blockId: 'b' } }), /Unlink plans/);
});

test('inline Outline uses named group cards with headings and explicit add and open actions', () => {
  const html = render();
  assert.match(html, /outliner-panel--cards/);
  assert.match(html, /outliner-group-card" role="region" aria-label="Health"/);
  assert.match(html, /role="heading" aria-level="3" aria-label="Health"/);
  assert.match(html, /3 items/);
  assert.match(html, /aria-label="Add item inside Health"/);
  assert.match(html, /aria-label="Open Health"/);
  assert.doesNotMatch(html, /outliner-group-meta/);
  assert.match(html, /<h4>Tasks<\/h4>/);
  assert.match(html, /<h4>Habits<\/h4>/);
  assert.match(html, /<h4>Notes<\/h4>/);
  assert.equal((html.match(/aria-label="Details for Dentist"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /aria-label="Ungrouped"/);
});

test('empty groups and themes remain cards, while loose leaves share an ungrouped section', () => {
  const html = render([{ ...row('Kitchen'), isGroup: true }, row('Health', 'note', [], { themeId: 't' }), row('Loose note'), row('Loose task', 'task')]);
  assert.equal((html.match(/outliner-group-card"/g) ?? []).length, 2);
  assert.match(html, /aria-label="Open Kitchen"/);
  assert.match(html, /<option value="Kitchen">Kitchen<\/option>/);
  assert.match(html, /Jump to<select/);
  assert.match(html, /aria-label="Add item inside Kitchen"/);
  assert.match(html, /aria-label="Ungrouped"/);
  assert.match(html, /aria-label="Plan Loose task"/);
});

test('nested groups stay flat inside one collection card without losing children or move controls', () => {
  const html = render([row('Projects', 'note', [{ ...row('Kitchen', 'note', [row('Paint', 'task')]), isGroup: true }])]);
  assert.equal((html.match(/outliner-group-card"/g) ?? []).length, 1);
  assert.match(html, /outliner-row--group-heading/);
  assert.match(html, /2 items/);
  assert.match(html, /aria-label="Move Kitchen"/);
  assert.match(html, /aria-label="Plan Paint"/);
});

test('collapsed group cards retain navigation and counts without rendering hidden child actions', () => {
  const html = render([{ ...nodes[0], collapsed: true }]);
  assert.match(html, /3 items/);
  assert.match(html, /aria-label="Expand Health"/);
  assert.match(html, /aria-label="Open Health"/);
  assert.doesNotMatch(html, /aria-label="Plan Dentist"/);
});
