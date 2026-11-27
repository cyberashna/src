import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { TimerAlarm } from '../services/tileTimers';

export const nativeTimers = Capacitor.isNativePlatform();
export async function prepareTileTimerAlarm() {
  if (!nativeTimers) return;
  let permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions();
  if (permission.display !== 'granted') throw new Error('Allow notifications in your phone settings to start a timer.');
  if (Capacitor.getPlatform() === 'android') {
    const exact = await LocalNotifications.checkExactNotificationSetting();
    if (exact.exact_alarm !== 'granted') throw new Error('Allow Alarms & reminders, then return here and press Start.');
    await LocalNotifications.createChannel({ id: 'tile-timers', name: 'Tile timers', importance: 4, vibration: true, visibility: 0 });
  }
}
export const tileTimerAlarm: TimerAlarm = {
  async schedule(timer) {
    if (!nativeTimers) return;
    await LocalNotifications.schedule({ notifications: [{
      id: timer.notificationId, title: 'Timer ready', body: timer.label,
      channelId: 'tile-timers', schedule: { at: new Date(timer.endsAt), allowWhileIdle: true },
      isExactNotification: true, isExactMandatory: true,
      extra: { blockId: timer.blockId }, autoCancel: true,
    }] });
  },
  async cancel(id) {
    if (!nativeTimers) return;
    await LocalNotifications.cancel({ notifications: [{ id }] });
    await LocalNotifications.removeDeliveredNotificationsById({ ids: [id] });
  },
};
export async function openTimerAlarmSettings() {
  if (Capacitor.getPlatform() === 'android') await LocalNotifications.changeExactNotificationSetting();
}
