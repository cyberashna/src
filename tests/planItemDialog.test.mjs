import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { readingDependencies } from './helpers/readingLinkModules.mjs';

const compiled = ts.transpileModule(readFileSync(new URL('../src/components/PlannerShell.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText;
const component = { exports: {} };
const dateModule = { exports: {} };
const dateCode = ts.transpileModule(readFileSync(new URL('../src/services/planningDate.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
new Function('require', 'module', 'exports', dateCode)(createRequire(import.meta.url), dateModule, dateModule.exports);
new Function('require', 'module', 'exports', compiled)(id => readingDependencies[id] ?? (id === '../services/planningDate' ? dateModule.exports : createRequire(import.meta.url)(id)), component, component.exports);
const { PlanItemDialog, TodayHome, PlannerModal, AddPlannerDialog, AddToRoutineDialog, PlannerNavigation, PlannerNoteDialog } = component.exports;
const choices = [
  { id: 'habit', name: 'Health / Walk', kind: 'habit', section: 'Outline' },
  { id: 'block:waiting', name: 'Book haircut', kind: 'task', section: 'Waiting' },
  { id: 'linked-row', name: 'Home / Buy bulbs', kind: 'task', section: 'Waiting' },
];
const render = (items = choices, initialId) => renderToStaticMarkup(React.createElement(PlanItemDialog, {
  choices: items, initialId, initialDate: '2026-10-21', slots: ['9:00 AM'], onSave: async () => {}, onClose: () => {},
}));

test('occurrence notes name their scope and keep Outline copying separate and disabled until loaded', () => {
  const html = renderToStaticMarkup(React.createElement(PlannerNoteDialog, { name: 'Walk', occurrence: true,
    onLoad: async () => '', onSave: async () => {}, onClose: () => {},
    outlineCopy: { destinations: [], initialParentId: '', onSave: async () => {} },
  }));
  assert.match(html, /Note for this occurrence/);
  assert.match(html, /Save occurrence note/);
  assert.match(html, /occurrence-outline-action[^>]*disabled/);
  assert.match(html, /Save to Outline/);
  assert.doesNotMatch(html, /Place in/);
});

test('ordinary Outline notes do not claim occurrence scope or offer a redundant copy', () => {
  const html = renderToStaticMarkup(React.createElement(PlannerNoteDialog, { name: 'Ideas', onLoad: async () => '', onSave: async () => {}, onClose: () => {} }));
  assert.match(html, /Save note/);
  assert.doesNotMatch(html, /Save to Outline|Note for this occurrence/);
});

test('Outline and Waiting have distinct labeled option groups', () => {
  const html = render();
  assert.match(html, /<optgroup label="Outline"><option value="habit">Health \/ Walk \(habit\)<\/option><\/optgroup>/);
  assert.match(html, /<optgroup label="Waiting"><option value="block:waiting">Book haircut \(task\)<\/option><option value="linked-row">Home \/ Buy bulbs \(task\)<\/option><\/optgroup>/);
});

test('linked Waiting items appear once and remain selectable by their outline identity', () => {
  const html = render(choices, 'linked-row');
  assert.equal((html.match(/value="linked-row"/g) ?? []).length, 1);
  assert.match(html, /<option value="linked-row" selected="">/);
});

test('empty groups are omitted without hiding available choices', () => {
  const html = render([choices[0]]);
  assert.doesNotMatch(html, /<optgroup label="Waiting"/);
  assert.match(html, /<optgroup label="Outline"/);
  assert.doesNotMatch(render([]), /<optgroup/);
});

test('mobile picker starts with Waiting and provides a scheduling step and add-another action', () => {
  const html = render();
  const mobile = html.slice(html.indexOf('class="plan-mobile-picker"'));
  assert.ok(mobile.indexOf('aria-label="Waiting"') < mobile.indexOf('aria-label="Outline"'));
  assert.match(html, /data-picking="true"/);
  assert.match(html, /class="plan-choice-row"/);
  assert.match(html, /value="another"/);
  assert.match(render(choices, 'habit'), /data-picking="false"/);
});

test('rescheduling retains its time and cannot silently turn a scheduled block into a soft plan', () => {
  const html = renderToStaticMarkup(React.createElement(PlanItemDialog, { choices: [choices[0]], initialId: 'habit', initialDate: '2026-10-22', initialTime: 1, rescheduling: true, slots: ['9:00 AM', '10:00 AM'], onSave: async () => {}, onClose: () => {} }));
  assert.match(html, /aria-label="Reschedule"/);
  assert.match(html, /<option value="1" selected="">10:00 AM/);
  assert.doesNotMatch(html, />Any time<\/option>/);
});

const renderMode = overrides => renderToStaticMarkup(React.createElement(PlanItemDialog, {
  choices: [{ id: 'task', name: 'Book dentist', kind: 'task', section: 'Outline' }], initialId: 'task',
  initialDate: '2026-10-29', slots: ['9:00 AM', '10:00 AM'], onSave: async () => {}, onClose: () => {}, ...overrides,
}));

test('new task plans default to Week with a Monday date and no invented time', () => {
  const html = renderMode();
  assert.match(html, /aria-label="Planning precision"/);
  assert.match(html, /aria-pressed="true"[^>]*>Week<\/button>/);
  assert.match(html, /Week of<input[^>]*value="2026-10-26"/);
  assert.match(html, />Plan for week<\/button>/);
  assert.doesNotMatch(html, /name="time"/);
});

test('Day mode preserves its chosen date without a time selector', () => {
  const html = renderMode({ initialMode: 'day' });
  assert.match(html, /aria-pressed="true"[^>]*>Day<\/button>/);
  assert.match(html, /name="day"[^>]*value="2026-10-29"/);
  assert.match(html, />Plan for day<\/button>/);
  assert.doesNotMatch(html, /name="time"/);
});

test('Time mode requires an explicit slot and restores a previous slot', () => {
  const html = renderMode({ initialMode: 'time' });
  assert.match(html, /name="time" required/);
  assert.match(html, /value="" disabled="" selected="">Choose a time/);
  assert.match(renderMode({ initialMode: 'time', initialTime: 1 }), /value="1" selected="">10:00 AM/);
});

test('habit and routine week planning offers a session count without inventing a time', () => {
  for (const kind of ['habit', 'routine']) {
    const html = renderMode({ choices: [{ id: 'task', name: 'Morning', kind, section: 'Outline' }] });
    assert.match(html, /aria-pressed="true"[^>]*>Week<\/button>/);
    assert.match(html, /Sessions this week<input name="count" type="number" min="1" step="1" required="" value="1"/);
    assert.doesNotMatch(html, /name="time"/);
  }
});

test('weekly target is restored, but rescheduling a session never edits the weekly target', () => {
  const choices = [{ id: 'task', name: 'Walk', kind: 'habit', section: 'Outline', weeklyTarget: 3 }];
  assert.match(renderMode({ choices }), /name="count"[^>]*value="3"/);
  assert.match(renderMode({ choices, initialTarget: 5 }), /name="count"[^>]*value="5"/);
  assert.doesNotMatch(renderMode({ choices, initialMode: 'week', rescheduling: true, allowLoose: true }), /name="count"/);
});

test('a scheduled task can explicitly loosen its timing but opens in Time mode', () => {
  const html = renderMode({ rescheduling: true, allowLoose: true, initialTime: 1 });
  assert.match(html, /aria-pressed="false">Week<\/button>/);
  assert.match(html, /aria-pressed="false">Day<\/button>/);
  assert.match(html, /aria-pressed="true">Time<\/button>/);
});

test('time-only calendar rescheduling cannot select Week or Day', () => {
  const html = renderMode({ rescheduling: true, allowLoose: false, initialTime: 1 });
  assert.match(html, /aria-pressed="false" disabled=""[^>]*>Week<\/button>/);
  assert.match(html, /aria-pressed="false" disabled=""[^>]*>Day<\/button>/);
});

test('busy modal disables Close so an in-flight save is not dismissed', () => {
  const html = renderToStaticMarkup(React.createElement(PlannerModal, { title: 'Plan', busy: true, onClose: () => {} }));
  assert.match(html, /disabled=""[^>]*aria-label="Close"/);
});

test('Today has explicit notes and reschedule actions, an optional routine widget, and collapsed Waiting', () => {
  const noop = () => {};
  const html = renderToStaticMarkup(React.createElement(TodayHome, { date: '2026-10-22', blocks: [{ id: 'one', name: 'Walk', time: '9:00 AM', completed: false }], anytime: [{ id: 'two', name: 'Book dentist', canComplete: true }], waiting: [], routines: [], onDone: noop, onAnytimeDone: noop, onPlan: noop, onReschedule: noop, onNote: noop, onRoutineItem: noop, onOpenPlan: noop }));
  assert.match(html, /aria-label="Notes for Walk"/);
  assert.match(html, /aria-label="Reschedule Walk"/);
  assert.match(html, /aria-label="Complete Book dentist"/);
  assert.equal((html.match(/<details class="today-section today-disclosure">/g) ?? []).length, 1);
  const widgetHtml = renderToStaticMarkup(React.createElement(TodayHome, { date: '2026-10-22', blocks: [], anytime: [], waiting: [], routineWidget: React.createElement('section', { 'aria-label': 'Routine widget' }, 'Pinned routines'), onOpenPlan: noop }));
  assert.match(widgetHtml, /aria-label="Routine widget"/);
  assert.ok(widgetHtml.indexOf('Pinned routines') < widgetHtml.indexOf('Schedule'));
});

test('rapid capture exposes categories, theme placement and continued entry', () => {
  const html = renderToStaticMarkup(React.createElement(AddPlannerDialog, { themes: [{ id: 'home', name: 'Home' }], initialThemeId: 'home', onSave: async () => 'id', onView: () => {}, onClose: () => {} }));
  assert.match(html, /aria-label="Capture type"/);
  assert.match(html, /value="home" selected="">Home/);
  assert.match(html, /Capture &amp; next/);
  assert.match(html, /No theme yet/);
  assert.doesNotMatch(html, /Waiting/);
});

test('capture is reachable from navigation and quick-note launches select Note', () => {
  const html = renderToStaticMarkup(React.createElement(AddPlannerDialog, { themes: [], initialKind: 'note', onSave: async () => 'id', onView: () => {}, onClose: () => {} }));
  assert.match(html, /aria-pressed="true"[^>]*>.*?Note<\/button>/);
  assert.match(html, /What is on your mind/);
  const nav = renderToStaticMarkup(React.createElement(PlannerNavigation, { view: 'themes', onView: () => {}, onAdd: () => {}, onMore: () => {}, more: null }));
  assert.ok(nav.indexOf('Outline') < nav.indexOf('Today'));
  assert.match(nav, /Capture/);
});

test('routine destination picker handles empty and available routines', () => {
  const renderRoutine = routines => renderToStaticMarkup(React.createElement(AddToRoutineDialog, { name: 'Stretch', routines, onSave: async () => {}, onClose: () => {} }));
  assert.match(renderRoutine([]), /No routines yet/);
  assert.match(renderRoutine([]), /type="submit" disabled/);
  assert.match(renderRoutine([{ id: 'morning', name: 'Morning' }]), /value="morning" selected="">Morning/);
});
