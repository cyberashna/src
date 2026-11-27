import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../android/app/src/main/assets/native-cache-reset.js', import.meta.url), 'utf8');
const runMigration = async ({ controlled = false, registered = true, fail = false } = {}) => {
  const events = [];
  const stored = new Map([['saved-outline', 'my notes'], ['auth-token', 'signed in']]);
  const context = {
    navigator: { serviceWorker: {
      controller: controlled ? {} : null,
      async getRegistrations() {
        if (fail) throw new Error('Unavailable');
        return registered ? [{ async unregister() { events.push('unregister'); } }] : [];
      },
    } },
    caches: {
      async keys() { return ['workbox-precache-v2', 'supabase-api-cache', 'supabase-auth-cache', 'images-cache', 'unrelated-cache']; },
      async delete(key) { events.push('delete:' + key); },
    },
    localStorage: { clear() { stored.clear(); }, removeItem(key) { stored.delete(key); } },
    location: { reload() { events.push('reload'); } },
    console: { error() { events.push('error'); } },
  };
  context.window = context;
  await vm.runInNewContext(source, context);
  return { events, stored };
};

test('older installed native app retires its worker and reloads after cache cleanup', async () => {
  const { events, stored } = await runMigration({ controlled: true });
  assert.deepEqual(events, ['unregister', 'delete:workbox-precache-v2', 'delete:supabase-api-cache', 'delete:supabase-auth-cache', 'delete:images-cache', 'reload']);
  assert.equal(stored.get('saved-outline'), 'my notes');
  assert.equal(stored.get('auth-token'), 'signed in');
});

test('fresh native launch does not enter a reload loop', async () => {
  const { events } = await runMigration({ registered: false });
  assert.equal(events.includes('reload'), false);
});

test('an uncontrolled page removes a dormant registration without a reload', async () => {
  const { events } = await runMigration();
  assert.equal(events[0], 'unregister');
  assert.equal(events.includes('reload'), false);
});

test('cache failure does not clear user data or reload repeatedly', async () => {
  const { events, stored } = await runMigration({ controlled: true, fail: true });
  assert.deepEqual(events, ['error']);
  assert.equal(stored.size, 2);
});
