import React from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from '../../src/lib/supabase';
import { createOutlineNode } from '../../src/services/planningOutliner';
import { getWeekStartDateString } from '../../src/utils/dateUtils';
import '../../src/index.css';

if (!import.meta.env.DEV) throw new Error('Development fixture only');
const cutout = new URLSearchParams(location.search).get('cutout');
if (cutout) {
  const insets = cutout === 'landscape' ? { top: 0, right: 0, bottom: 24, left: 40 } : { top: 40, right: 0, bottom: 24, left: 0 };
  Object.entries(insets).forEach(([edge, value]) => document.documentElement.style.setProperty(`--safe-area-inset-${edge}`, `${value}px`));
}
const user = { id: 'streamline-fixture', email: 'planner@example.test' };
if (new URLSearchParams(location.search).has('reading')) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === 'https://reading.example.org/article') return Promise.resolve(new Response('<html><head><meta property="og:title" content="A quiet walk in the woods"><meta property="og:image" content="https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=240&amp;h=160&amp;fit=crop"></head></html>', { headers: { 'content-type': 'text/html' } }));
    if (url === 'https://reading.example.org/blocked') return Promise.reject(new TypeError('Preview blocked'));
    return originalFetch(input, init);
  };
}
if (new URLSearchParams(location.search).has('reset')) {
  sessionStorage.removeItem('streamline-fixture-db');
  localStorage.removeItem('routine-notes:' + user.id);
  localStorage.removeItem('outline-planning-only:' + user.id);
}
const theme = { id: 'theme-1', user_id: user.id, name: 'Everyday care', theme_type: 'habit' };
const habit = { id: 'habit-1', user_id: user.id, theme_id: theme.id, name: 'Take a walk', target_per_week: 3, done_count: 16, frequency: 'weekly', parent_habit_id: null };
const sampleWeek = getWeekStartDateString();
const sampleDay = (index: number) => {
  const date = new Date(`${sampleWeek}T12:00:00`);
  date.setDate(date.getDate() + index);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const data = JSON.parse(sessionStorage.getItem('streamline-fixture-db') || 'null') ?? {
  themes: [theme], habits: [habit],
  blocks: [{ id: 'waiting-1', user_id: user.id, label: 'Task: Book a haircut', is_habit_block: false, completed: false, location_type: 'unscheduled', week_start_date: null }],
  planning_outliner_data: [{ user_id: user.id, nodes: [
    { ...createOutlineNode(theme.name), id: 'theme-row', linked: { themeId: theme.id, label: theme.name }, children: [
      { ...createOutlineNode(habit.name), id: 'habit-row', tag: 'habit', linked: { habitId: habit.id, themeId: theme.id, label: habit.name } },
      { ...createOutlineNode('Book dentist'), id: 'task-row', tag: 'task' },
      { ...createOutlineNode('Weekend ideas'), id: 'note-row', draftNote: 'A picnic by the river' },
    ] },
  ] }],
};
if (new URLSearchParams(location.search).has('family')) {
  const home = { id: 'theme-2', user_id: user.id, name: 'Home', theme_type: 'household' };
  const learning = { id: 'theme-3', user_id: user.id, name: 'Learning', theme_type: 'habit' };
  data.themes = [theme, home, learning];
  data.blocks = [...data.blocks.filter((block: any) => !block.id.startsWith('sample-')),
    ...['Take a walk', 'Library visit', 'Stretch and move', 'Water the plants', 'Read a chapter', 'Grocery shopping', 'Prepare for the week'].map((label, index) => ({
      id: `sample-${index}`, user_id: user.id, label, completed: false, is_habit_block: false,
      theme_id: [theme.id, learning.id, theme.id, home.id, learning.id, home.id, home.id][index],
      location_type: 'slot', day_index: index, time_index: index % 3 + 3, week_start_date: sampleWeek,
    })),
  ];
  const root = data.planning_outliner_data[0].nodes[0];
  root.children.find((node: any) => node.id === 'task-row').planDate = sampleDay((new Date().getDay() + 6) % 7);
  data.planning_outliner_data[0].nodes = data.planning_outliner_data[0].nodes.filter((node: any) => node.id !== 'home-row');
  data.planning_outliner_data[0].nodes.push({ ...createOutlineNode(home.name), id: 'home-row', linked: { themeId: home.id }, children: [
    { ...createOutlineNode('Sort the hallway cupboard and donate winter coats'), id: 'home-task', tag: 'task', planDate: sampleDay(0) },
  ] });
}
if (new URLSearchParams(location.search).has('longOutline') && !data.planning_outliner_data[0].nodes.some((node: any) => node.id === 'long-list')) {
  data.planning_outliner_data[0].nodes.push({ ...createOutlineNode('Household'), id: 'long-list', children: [
    { ...createOutlineNode('Weekend projects'), id: 'nested-group', children: [
      { ...createOutlineNode('Sort photos'), id: 'nested-task', tag: 'task' },
      { ...createOutlineNode('Print photos'), id: 'nested-done', tag: 'task', taskDone: true },
    ] },
    ...Array.from({ length: 30 }, (_, index) => ({ ...createOutlineNode(`Household task ${index + 1}`), id: `long-task-${index}`, tag: 'task', taskDone: index < 2 })),
  ] });
}
const errors: string[] = [];
if (new URLSearchParams(location.search).has('groupPlans') && !data.planning_outliner_data[0].nodes.some((node: any) => node.id === 'group-test-row')) {
  data.planning_outliner_data[0].nodes.push({ ...createOutlineNode('Home projects'), id: 'group-test-row', linked: { blockId: 'waiting-1', label: 'Book a haircut' }, children: [
    { ...createOutlineNode('Paint the shelves'), id: 'group-test-child', tag: 'task' },
  ] });
  data.block_notes = [...(data.block_notes ?? []), { id: 'group-source-note', user_id: user.id, block_id: 'waiting-1', content: 'Keep the measurements: 120 cm.' }];
  data.planning_outliner_data[0].nodes.push({ ...createOutlineNode('Old calendar note'), id: 'group-missing-row', linked: { blockId: 'missing-block', label: 'Old calendar note' } });
}
let failGroupSave = new URLSearchParams(location.search).has('failGroupSave');
const writes: unknown[] = [];
let failOnce = new URLSearchParams(location.search).get('failOnce');
let failUndoSave = new URLSearchParams(location.search).has('failUndoSave');
let taskMovedOut = false;
let writesBeforeFailure = Number(new URLSearchParams(location.search).get('failAfter') || 0);
window.addEventListener('error', event => errors.push(event.message));
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
Object.assign(window, { fixture: { data, writes, errors, week: getWeekStartDateString() } });
Object.assign(supabase.auth, {
  getSession: async () => ({ data: { session: { user } }, error: null }),
  getUser: async () => ({ data: { user }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
});
supabase.from = ((table: string) => {
  let filters: ((row: any) => boolean)[] = [];
  let single = false;
  let method = 'read';
  let values: any;
  let upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  let range: [number, number] | undefined;
  let selection = '';
  const query: any = new Proxy({}, { get(_target, name) {
    if (name === 'then') return (resolve: any) => {
      let rows = data[table] ?? [];
      const matches = (row: any) => filters.every(filter => filter(row));
      let result = rows.filter(matches);
      if (method !== 'read') {
        if (failUndoSave && table === 'planning_outliner_data' && values?.nodes) {
          if (values.nodes.some((node: any) => node.id === 'task-row')) taskMovedOut = true;
          else if (taskMovedOut && values.nodes.some((node: any) => node.id === 'theme-row' && node.children.some((child: any) => child.id === 'task-row'))) {
            failUndoSave = false;
            resolve({ data: null, error: { message: 'Simulated Undo save failure' } });
            return;
          }
        }
        if (failGroupSave && table === 'planning_outliner_data' && values?.nodes?.some((node: any) => node.id === 'group-test-row' && node.isGroup)) {
          failGroupSave = false;
          resolve({ data: null, error: { message: 'Simulated group save failure' } });
          return;
        }
        if (table === failOnce && writesBeforeFailure-- <= 0) {
          failOnce = null;
          resolve({ data: null, error: { message: 'Simulated write failure' } });
          return;
        }
        writes.push({ table, method, values });
        if (method === 'delete') data[table] = rows.filter((row: any) => !matches(row));
        else if (method === 'update') { data[table] = rows.map((row: any) => matches(row) ? { ...row, ...values } : row); result = data[table].filter(matches); }
        else if (method === 'upsert') {
          const keys = (upsertOptions.onConflict ?? 'id').split(',');
          result = (Array.isArray(values) ? values : [values]).map((value: any) => {
            const existing = rows.find((row: any) => keys.every(key => row[key] === value[key]));
            if (existing) {
              if (!upsertOptions.ignoreDuplicates) Object.assign(existing, value);
              return existing;
            }
            const inserted = { id: crypto.randomUUID(), ...value };
            rows = [...rows, inserted];
            return inserted;
          });
          data[table] = rows;
        } else {
          result = (Array.isArray(values) ? values : [values]).map((value: any) => ({ id: crypto.randomUUID(), ...value }));
          data[table] = table === 'planning_outliner_data' ? result : [...rows, ...result];
        }
        sessionStorage.setItem('streamline-fixture-db', JSON.stringify(data));
      }
      if (range) result = result.slice(range[0], range[1] + 1);
      if (table === 'blocks' && selection.includes('block_habit_credits(')) result = result.map((row: any) => ({
        ...row,
        block_habit_credits: (data.block_habit_credits ?? []).filter((credit: any) => credit.block_id === row.id),
        block_activity_logs: (data.block_activity_logs ?? []).filter((log: any) => log.block_id === row.id),
      }));
      resolve({ data: single ? result[0] ?? null : result, error: null });
    };
    return (...args: any[]) => {
      if (name === 'select') selection = args[0] ?? '*';
      if (name === 'eq') filters.push(row => row[args[0]] === args[1]);
      if (name === 'in') filters.push(row => args[1].includes(row[args[0]]));
      if (name === 'or') filters.push(row => args[0].split(',').some((part: string) => { const [key, op, value] = part.split('.'); return op === 'is' ? row[key] == null : row[key] === value; }));
      if (name === 'single' || name === 'maybeSingle') single = true;
      if (name === 'range') range = [args[0], args[1]];
      if (['insert', 'upsert', 'update', 'delete'].includes(String(name))) { method = String(name); values = args[0]; upsertOptions = args[1] ?? {}; }
      return query;
    };
  } });
  return query;
}) as any;
const { default: App } = await import('../../src/App');
createRoot(document.getElementById('root')!).render(<App />);
