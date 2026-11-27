export type TileTimer = {
  blockId: string;
  label: string;
  notificationId: number;
  endsAt: number;
  minutes: number;
  fired: boolean;
};
export type TimerStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type TimerAlarm = { schedule: (timer: TileTimer) => Promise<void>; cancel: (id: number) => Promise<void> };
export const timerStorageKey = (userId: string) => 'tile-timers:v1:' + userId;
export const timerChangeEvent = 'habit-care-timers-changed';

export function readTileTimers(storage: TimerStorage, userId: string): TileTimer[] {
  const raw = storage.getItem(timerStorageKey(userId));
  if (!raw) return [];
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows)) throw new Error('Saved timers could not be read.');
  const seen = new Set<string>();
  return rows.filter((item): item is TileTimer => {
    if (!item || typeof item.blockId !== 'string' || !item.blockId || seen.has(item.blockId) ||
      typeof item.label !== 'string' || !Number.isSafeInteger(item.notificationId) || item.notificationId < 1 || item.notificationId > 2147483647 ||
      !Number.isFinite(item.endsAt) || !Number.isInteger(item.minutes) || item.minutes < 1 || item.minutes > 1440 || typeof item.fired !== 'boolean') return false;
    seen.add(item.blockId);
    return true;
  });
}
function writeTimers(storage: TimerStorage, userId: string, timers: TileTimer[]) {
  storage.setItem(timerStorageKey(userId), JSON.stringify(timers));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(timerChangeEvent));
}
export function remainingTime(timer: TileTimer, now: number) {
  const seconds = Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
  return seconds ? Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') : 'Timer ready';
}
export async function startTileTimer(storage: TimerStorage, alarm: TimerAlarm, userId: string,
  blockId: string, label: string, minutes: number, notificationId: number, now = Date.now()) {
  if (!blockId || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error('Choose 1 to 1440 whole minutes.');
  const timers = readTileTimers(storage, userId);
  const previous = timers.find(timer => timer.blockId === blockId);
  const timer: TileTimer = { blockId, label, minutes, notificationId: previous?.notificationId ?? notificationId, endsAt: now + minutes * 60000, fired: false };
  if (!Number.isSafeInteger(timer.notificationId) || timer.notificationId < 1 || timer.notificationId > 2147483647) throw new Error('Invalid timer identifier.');
  await alarm.schedule(timer);
  try {
    // Re-read after permission prompts so another tile's newly saved timer is retained.
    writeTimers(storage, userId, [...readTileTimers(storage, userId).filter(item => item.blockId !== blockId), timer]);
  } catch (error) {
    await alarm.cancel(timer.notificationId);
    if (previous && !previous.fired && previous.endsAt > Date.now()) await alarm.schedule(previous);
    throw error;
  }
  return timer;
}
export async function cancelTileTimer(storage: TimerStorage, alarm: TimerAlarm, userId: string, blockId: string) {
  const timer = readTileTimers(storage, userId).find(item => item.blockId === blockId);
  if (!timer) return;
  await alarm.cancel(timer.notificationId);
  writeTimers(storage, userId, readTileTimers(storage, userId).filter(item => item.blockId !== blockId));
}
export function expireTileTimers(storage: TimerStorage, userId: string, now = Date.now()) {
  const timers = readTileTimers(storage, userId);
  const due = timers.filter(timer => !timer.fired && timer.endsAt <= now);
  if (due.length) writeTimers(storage, userId, timers.map(timer => timer.endsAt <= now ? { ...timer, fired: true } : timer));
  return due;
}
