import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const compile = (file, dependencies = {}) => {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => {
    if (!(id in dependencies)) throw new Error('Unexpected dependency: ' + id);
    return dependencies[id];
  }, module, module.exports);
  return module.exports;
};
const { startTileTimer, cancelTileTimer, readTileTimers, expireTileTimers, remainingTime, timerStorageKey } = compile('../src/services/tileTimers.ts');
const setup = () => {
  const data = new Map(), scheduled = new Map();
  const state = { failWrite: false, failAlarm: false };
  const storage = { getItem: key => data.get(key) ?? null, setItem(key, value) { if (state.failWrite) throw new Error('Storage full'); data.set(key, value); } };
  const alarm = {
    async schedule(timer) { if (state.failAlarm) throw new Error('Permission denied'); scheduled.set(timer.notificationId, structuredClone(timer)); },
    async cancel(id) { scheduled.delete(id); },
  };
  const start = (block = 'note', minutes = 5, id = 123, now = 1000) => startTileTimer(storage, alarm, 'user', block, block, minutes, id, now);
  return { data, scheduled, state, storage, alarm, start };
};

test('quick notes and saved tiles get independent timers without Outline or calendar changes', async () => {
  const { storage, start, scheduled } = setup();
  const quick = await start('quick-note', 5, 10);
  const habit = await start('habit-session', 25, 11);
  assert.equal(quick.endsAt, 301000);
  assert.equal(habit.endsAt, 1501000);
  assert.equal(readTileTimers(storage, 'user').length, 2);
  assert.equal(scheduled.size, 2);
  assert.deepEqual(readTileTimers(storage, 'other-user'), []);
});
test('invalid durations fail before storage or notification changes', async () => {
  const { storage, start, scheduled } = setup();
  for (const minutes of [0, -1, 0.5, 1441, NaN, Infinity]) await assert.rejects(start('note', minutes), /whole minutes/);
  assert.deepEqual(readTileTimers(storage, 'user'), []);
  assert.equal(scheduled.size, 0);
});
test('restarting a tile replaces its existing countdown and native notification ID', async () => {
  const { storage, start, scheduled } = setup();
  await start('one', 1, 10);
  await start('two', 3, 11);
  await start('one', 10, 12, 5000);
  const timers = readTileTimers(storage, 'user');
  assert.equal(timers.length, 2);
  assert.equal(timers.find(timer => timer.blockId === 'one').notificationId, 10);
  assert.equal(timers.find(timer => timer.blockId === 'one').endsAt, 605000);
  assert.equal(scheduled.size, 2);
});
test('expiry uses the absolute deadline across reload, sleep and week changes and fires once', async () => {
  const { storage, start } = setup();
  await start('note', 1);
  assert.equal(expireTileTimers(storage, 'user', 60999).length, 0);
  assert.equal(expireTileTimers(storage, 'user', 61000).length, 1);
  assert.equal(expireTileTimers(storage, 'user', 61001).length, 0);
  assert.equal(readTileTimers(storage, 'user')[0].fired, true);
  assert.equal(remainingTime(readTileTimers(storage, 'user')[0], 99999999), 'Timer ready');
});
test('countdown rounds up and never shows negative time', async () => {
  const { start } = setup();
  const timer = await start('note', 1);
  assert.equal(remainingTime(timer, 1000), '1:00');
  assert.equal(remainingTime(timer, 1001), '1:00');
  assert.equal(remainingTime(timer, 2000), '0:59');
  assert.equal(remainingTime(timer, 61000), 'Timer ready');
});
test('cancel and dismiss remove only that tile timer and cancel its native alarm', async () => {
  const { storage, alarm, start, scheduled } = setup();
  await start('one', 1, 10); await start('two', 3, 11);
  expireTileTimers(storage, 'user', 61000);
  await cancelTileTimer(storage, alarm, 'user', 'one');
  await cancelTileTimer(storage, alarm, 'user', 'one');
  assert.deepEqual(readTileTimers(storage, 'user').map(timer => timer.blockId), ['two']);
  assert.deepEqual([...scheduled.keys()], [11]);
});
test('notification denial never advertises a running timer', async () => {
  const { storage, start, state } = setup();
  state.failAlarm = true;
  await assert.rejects(start(), /Permission denied/);
  assert.deepEqual(readTileTimers(storage, 'user'), []);
});
test('storage failure cancels a newly scheduled native notification', async () => {
  const { start, state, scheduled } = setup();
  state.failWrite = true;
  await assert.rejects(start(), /Storage full/);
  assert.equal(scheduled.size, 0);
});
test('failed restart restores the previous future alarm', async () => {
  const { start, state, scheduled } = setup();
  const original = await start('note', 10, 123, Date.now());
  state.failWrite = true;
  await assert.rejects(start('note', 20, 124, Date.now()), /Storage full/);
  assert.deepEqual(scheduled.get(123), original);
});
test('malformed persisted entries cannot become spurious timer alerts', async () => {
  const { storage, data, start } = setup();
  const valid = await start();
  data.set(timerStorageKey('user'), JSON.stringify([null, {}, { ...valid, notificationId: -1 }, valid, valid]));
  assert.deepEqual(readTileTimers(storage, 'user'), [valid]);
});
test('a concurrent tile saved during notification permission is not overwritten', async () => {
  const { storage, start, alarm } = setup();
  const schedule = alarm.schedule;
  alarm.schedule = async timer => {
    await startTileTimer(storage, { ...alarm, schedule }, 'user', 'other', 'Other', 2, 456, 1000);
    await schedule(timer);
  };
  await start();
  assert.deepEqual(readTileTimers(storage, 'user').map(timer => timer.blockId), ['other', 'note']);
});

const native = (display = 'granted', exact = 'granted', platform = 'android') => {
  const calls = [];
  const api = {
    checkPermissions: async () => ({ display }),
    requestPermissions: async () => { calls.push('request'); return { display }; },
    checkExactNotificationSetting: async () => ({ exact_alarm: exact }),
    createChannel: async options => calls.push(['channel', options]),
    schedule: async options => calls.push(['schedule', options]),
    cancel: async options => calls.push(['cancel', options]),
    removeDeliveredNotificationsById: async options => calls.push(['remove', options]),
    changeExactNotificationSetting: async () => calls.push('settings'),
  };
  return { calls, ...compile('../src/native/tileTimerAlarm.ts', {
    '@capacitor/core': { Capacitor: { isNativePlatform: () => platform !== 'web', getPlatform: () => platform } },
    '@capacitor/local-notifications': { LocalNotifications: api },
  }) };
};
test('Android requires notification and exact alarm permission before a timer starts', async () => {
  const denied = native('denied');
  await assert.rejects(denied.prepareTileTimerAlarm(), /Allow notifications/);
  assert.deepEqual(denied.calls, ['request']);
  const inexact = native('granted', 'denied');
  await assert.rejects(inexact.prepareTileTimerAlarm(), /Alarms & reminders/);
  assert.deepEqual(inexact.calls, []);
});
test('native alarms use an absolute exact deadline, wake while idle, and cancel delivered alerts', async () => {
  const { calls, prepareTileTimerAlarm, tileTimerAlarm } = native();
  await prepareTileTimerAlarm();
  await tileTimerAlarm.schedule({ notificationId: 12, label: 'Tea', blockId: 'quick', endsAt: 1234567 });
  const notification = calls.find(call => call[0] === 'schedule')[1].notifications[0];
  assert.equal(notification.schedule.at.getTime(), 1234567);
  assert.equal(notification.schedule.allowWhileIdle, true);
  assert.equal(notification.isExactMandatory, true);
  assert.equal(notification.body, 'Tea');
  await tileTimerAlarm.cancel(12);
  assert.deepEqual(calls.slice(-2), [['cancel', { notifications: [{ id: 12 }] }], ['remove', { ids: [12] }]]);
});
test('web timers never invoke unsupported native notification APIs', async () => {
  const { calls, prepareTileTimerAlarm, tileTimerAlarm } = native('granted', 'granted', 'web');
  await prepareTileTimerAlarm(); await tileTimerAlarm.schedule({}); await tileTimerAlarm.cancel(1);
  assert.deepEqual(calls, []);
});
