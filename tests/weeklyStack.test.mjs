import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { readingDependencies } from './helpers/readingLinkModules.mjs';

const compiled = ts.transpileModule(readFileSync(new URL('../src/components/WeeklyStack.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText;
const component = { exports: {} };
const hookModule = { exports: {} };
const hookCode = ts.transpileModule(readFileSync(new URL('../src/components/useItemLongPress.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
new Function('require', 'module', 'exports', hookCode)(createRequire(import.meta.url), hookModule, hookModule.exports);
new Function('require', 'module', 'exports', compiled)(id => readingDependencies[id] ?? (id === './useItemLongPress' ? hookModule.exports : id === './TileTimers' ? { TileTimerButton: () => null } : createRequire(import.meta.url)(id)), component, component.exports);
const { WeeklyStack } = component.exports;
const noop = () => {};
const days = Array.from({ length: 7 }, (_, index) => ({ date: `2026-10-${19 + index}`, anytime: [], timed: [], suggestions: [] }));
const props = { days, today: '2026-10-21', selectedDay: 2, onSelectDay: noop, themes: [], onAdd: noop, onOpenDay: noop };
const render = overrides => renderToStaticMarkup(React.createElement(WeeklyStack, { ...props, ...overrides }));

test('week renders seven dated columns with one selected day and today marker', () => {
  const html = render();
  assert.equal((html.match(/class="stack-day-column"/g) ?? []).length, 7);
  assert.equal((html.match(/data-selected="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-today="true"/g) ?? []).length, 1);
  assert.match(html, /aria-label="Plan for Wednesday, October 21"/);
});

test('date-only plans and timed commitments retain separate sections', () => {
  const customDays = days.map(day => ({ ...day }));
  customDays[2] = { ...customDays[2], anytime: [{ id: 'soft', name: 'Book dentist', detail: 'Health', onOpen: noop, onRemove: noop }], timed: [{ id: 'timed', name: 'Read', detail: 'Learning', time: '10:00 AM', completed: true, onOpen: noop, onDone: noop }] };
  const html = render({ days: customDays });
  assert.match(html, /Any time<\/h3><article[^]*Book dentist[^]*Scheduled<\/h3><article[^]*Read/);
  assert.match(html, /aria-label="Remove day for Book dentist"/);
  assert.match(html, /aria-label="Mark incomplete Read"/);
  assert.match(html, /checked=""/);
});

test('suggestions keep explicit schedule and dismiss labels without a completion control', () => {
  const customDays = days.map(day => ({ ...day }));
  customDays[0] = { ...customDays[0], suggestions: [{ id: 'suggested', name: 'Walk', detail: '9:00 AM', onOpen: noop, onRemove: noop, openLabel: 'Schedule Walk', removeLabel: 'Dismiss Walk' }] };
  const html = render({ days: customDays });
  assert.match(html, /Suggested<\/h3>/);
  assert.match(html, /title="Schedule Walk"/);
  assert.match(html, /aria-label="Dismiss Walk"/);
  assert.doesNotMatch(html, /type="checkbox"/);
});

test('scheduled cards expose accessible options without removing completion or normal opening', () => {
  const customDays = days.map(day => ({ ...day }));
  customDays[0] = { ...customDays[0], timed: [{ id: 'scheduled', name: 'Write a note', time: '9:00 AM', detail: 'Note', onOpen: noop, onDone: noop, onActions: noop }] };
  const html = render({ days: customDays });
  assert.match(html, /aria-label="Options for Write a note"/);
  assert.match(html, /aria-label="Complete Write a note"/);
  assert.match(html, /title="Open day for Write a note"/);
});

test('scheduled notes have a direct labeled icon and existing-note indicator', () => {
  const customDays = days.map(day => ({ ...day }));
  customDays[0] = { ...customDays[0], timed: [{ id: 'note', name: 'Park walk', time: '9:00 AM', detail: 'Note', hasNote: true, onOpen: noop, onNote: noop }] };
  const html = render({ days: customDays });
  assert.match(html, /aria-label="Notes for Park walk"/);
  assert.match(html, /data-has-note="true"/);
  assert.match(html, /title="Read note for Park walk"/);
});
