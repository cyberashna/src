import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../src/components/useItemLongPress.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const setup = (ignoreControls = false) => {
  let id = 0, opened = 0;
  const timers = new Map(), cleanup = [];
  const module = { exports: {} };
  const react = { useRef: current => ({ current }), useEffect: fn => cleanup.push(fn()) };
  new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', code)(() => react, module, module.exports,
    fn => { timers.set(++id, fn); return id; }, timer => timers.delete(timer));
  const handlers = module.exports.useItemLongPress(() => opened++, ignoreControls);
  return { handlers, opened: () => opened, tick: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); }, cleanup: () => cleanup.forEach(fn => fn()) };
};
const event = (overrides = {}) => ({ button: 0, isPrimary: true, pointerType: 'touch', clientX: 10, clientY: 10, target: { closest: () => null }, cancelable: true, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...overrides });

test('holding opens once and suppresses the follow-up click and native menu', () => {
  const { handlers: h, tick, opened } = setup();
  h.onPointerDown(event()); tick();
  h.onContextMenu(event()); h.onPointerUp(event());
  assert.equal(opened(), 1);
  const click = event(); h.onClickCapture(click);
  assert.equal(click.prevented, true); assert.equal(click.stopped, true);
});
test('ordinary taps and mouse drags do not open the hold menu', () => {
  const { handlers: h, tick, opened } = setup();
  h.onPointerDown(event()); h.onPointerUp(event()); tick();
  const click = event(); h.onClickCapture(click); assert.equal(click.prevented, undefined);
  h.onPointerDown(event({ pointerType: 'mouse' })); tick(); assert.equal(opened(), 0);
});
test('scrolling, pointer cancellation and unmount cancel pending holds', () => {
  for (const action of ['move', 'cancel', 'leave', 'unmount']) {
    const { handlers: h, tick, opened, cleanup } = setup(); h.onPointerDown(event());
    if (action === 'move') h.onPointerMove(event({ clientY: 30 }));
    if (action === 'cancel') h.onPointerCancel();
    if (action === 'leave') h.onPointerLeave();
    if (action === 'unmount') cleanup();
    tick(); assert.equal(opened(), 0);
  }
});
test('checkbox controls are excluded, but label text can open the menu', () => {
  const { handlers: h, tick, opened } = setup(true);
  h.onPointerDown(event({ target: { closest: () => ({ tagName: 'INPUT' }) } })); tick(); assert.equal(opened(), 0);
  h.onPointerDown(event()); tick(); assert.equal(opened(), 1);
});
test('right-click opens the same menu and suppresses the browser menu', () => {
  const { handlers: h, opened } = setup(); const menu = event(); h.onContextMenu(menu);
  assert.equal(opened(), 1); assert.equal(menu.prevented, true);
});
