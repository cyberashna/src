import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { readingDependencies } from './helpers/readingLinkModules.mjs';

const compiled = ts.transpileModule(readFileSync(new URL('../src/components/WeeklySoftPlan.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText;
const component = { exports: {} };
new Function('require', 'module', 'exports', compiled)(id => readingDependencies[id] ?? createRequire(import.meta.url)(id), component, component.exports);
const noop = () => {};
const render = overrides => renderToStaticMarkup(React.createElement(component.exports.WeeklySoftPlan, {
  title: 'This week', entries: [], choices: [], onAdd: noop, onRemove: noop, onDay: noop, onSchedule: noop, onOpen: noop, ...overrides,
}));

test('week-only section has a named region, explicit empty state and disabled empty picker', () => {
  const html = render();
  assert.match(html, /aria-label="This week - No day chosen"/);
  assert.match(html, /No loose plans yet/);
  assert.match(html, /select[^>]*disabled/);
  assert.doesNotMatch(html, /type="checkbox"/);
});

test('canonical entries expose Outline ancestry and distinct accessible actions', () => {
  const html = render({ entries: [{ node: { id: 'task', text: 'Book dentist', tag: 'task' }, plan: { id: 'plan' }, path: ['Home', 'Appointments', 'Book dentist'] }] });
  for (const label of ['Choose day for Book dentist', 'Schedule Book dentist', 'Open Book dentist in Outline', 'Remove Book dentist from week']) assert.ok(html.includes(`aria-label="${label}"`));
  assert.match(html, /Home \/ Appointments/);
  assert.doesNotMatch(html, /Delete|type="checkbox"/);
});

test('loading does not advertise an empty week or enable capture', () => {
  const html = render({ loading: true, choices: [{ id: 'task', name: 'Home / Task', kind: 'task' }] });
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Loading plans/);
  assert.doesNotMatch(html, /No tasks or notes planned/);
  assert.match(html, /select[^>]*disabled/);
});

test('repeating cards show placed separately from completed and provide a count editor', () => {
  const html = render({ onEdit: noop, entries: [{ node: { id: 'habit', text: 'Walk', tag: 'habit' }, plan: { id: 'week' }, path: ['Health', 'Walk'], progress: { placed: 2, completed: 1, target: 3 } }] });
  assert.match(html, /Week intentions/);
  assert.match(html, /2 of 3 placed, 1 completed/);
  assert.match(html, /aria-label="Edit weekly sessions for Walk"/);
});
