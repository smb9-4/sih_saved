import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export function isNative() {
  try {
    return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
  } catch (e) {
    return false;
  }
}

export function getPlatform() {
  return Capacitor.getPlatform();
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      window.__swReg = reg;
    }).catch(() => {});
  });
}

export function getServiceWorkerRegistration() {
  return navigator.serviceWorker && navigator.serviceWorker.ready;
}

let notificationAudio = null;
let notificationUnlockAttached = false;
let notificationPending = null;

function attachNotificationUnlock() {
  if (notificationUnlockAttached || typeof document === 'undefined') return;
  notificationUnlockAttached = true;
  const tryPlay = () => {
    const item = notificationPending;
    if (!item) return;
    notificationPending = null;
    try {
      const promise = item.audio.play();
      if (promise && typeof promise.catch === 'function') {
        promise.catch(() => {
          if (notificationAudio === item.audio) notificationAudio = null;
        });
      }
    } catch (e) {}
  };
  document.addEventListener('pointerdown', tryPlay, { capture: true });
  document.addEventListener('touchstart', tryPlay, { capture: true });
  document.addEventListener('keydown', tryPlay, { capture: true });
}

export function playNotificationSound(repeats = 2) {
  if (typeof window === 'undefined' || !window.Audio) return;
  try {
    stopNotificationSound();
    const base = process.env.PUBLIC_URL || '';
    const audio = new Audio(`${base}/sounds/notification.mp3`);
    audio.preload = 'auto';
    notificationAudio = audio;
    let count = 0;
    const end = () => {
      if (notificationAudio !== audio) return;
      count += 1;
      if (count < repeats) {
        try {
          audio.currentTime = 0;
          const promise = audio.play();
          if (promise && typeof promise.catch === 'function') {
            promise.catch(() => {
              if (notificationAudio === audio) notificationAudio = null;
            });
          }
        } catch (e) {}
      } else if (notificationAudio === audio) {
        notificationAudio = null;
      }
    };
    audio.onended = end;
    audio.onerror = () => {
      if (notificationAudio === audio) notificationAudio = null;
    };
    const promise = audio.play();
    if (promise && typeof promise.catch === 'function') {
      promise.catch((err) => {
        const blocked = err && (err.name === 'NotAllowedError' || err.name === 'AbortError');
        if (blocked) {
          notificationPending = { audio };
          attachNotificationUnlock();
        } else if (notificationAudio === audio) {
          notificationAudio = null;
        }
      });
    }
  } catch (e) {}
}

export function stopNotificationSound() {
  const audio = notificationAudio;
  notificationAudio = null;
  if (!audio) return;
  try {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  } catch (e) {}
}

export const REMINDER_CHANNEL_ID = 'reminders_channel';

export async function ensureReminderChannel() {
  if (!isNative()) return;
  try {
    await LocalNotifications.createChannel({
      id: REMINDER_CHANNEL_ID,
      name: 'Daily Reminders',
      description: 'Sound alarms and reminders for medication, hydration, and tasks',
      importance: 5,
      visibility: 1,
      sound: 'notification.mp3',
      vibration: true,
      lights: true,
      lightColor: '#2E7D32',
    });
  } catch (e) {
    console.warn('Could not create notification channel:', e);
  }
}

export async function checkNotificationPermissions() {
  if (isNative()) {
    try {
      const permission = await LocalNotifications.checkPermissions();
      return permission.display;
    } catch (e) {
      return 'denied';
    }
  }
  if (typeof window !== 'undefined' && 'Notification' in window) {
    return Notification.permission;
  }
  return 'granted';
}

export function requestNotificationPermission() {
  requestNotificationPermissions().catch(() => {});
}

export async function requestNotificationPermissions() {
  if (isNative()) {
    try {
      await ensureReminderChannel();
      const result = await LocalNotifications.requestPermissions();
      try {
        const exactSetting = await LocalNotifications.checkExactNotificationSetting();
        if (exactSetting && exactSetting.exact_alarm !== 'granted') {
          await LocalNotifications.changeExactNotificationSetting();
        }
      } catch (err) {}
      return result.display === 'granted';
    } catch (e) {
      return false;
    }
  }
  if (!('Notification' in window)) return false;
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    if (window.__swReg) return window.__swReg;
    const reg = await navigator.serviceWorker.ready;
    window.__swReg = reg;
    return reg;
  } catch (e) {
    return null;
  }
}

export function nextOccurrenceTime(time, days = [0, 1, 2, 3, 4, 5, 6]) {
  const [hours, minutes] = String(time || '').split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  const now = new Date();
  const selectedDays = Array.isArray(days) && days.length ? days : [0, 1, 2, 3, 4, 5, 6];
  for (let offset = 0; offset <= 7; offset += 1) {
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hours, minutes, 0, 0);
    if (selectedDays.includes(target.getDay()) && target.getTime() > (now.getTime() + 3000)) {
      return target;
    }
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, hours, minutes, 0, 0);
}

export async function scheduleNativeReminder(reminder) {
  if (!isNative() || !reminder || reminder.completed) return [];
  await ensureReminderChannel();

  const days = Array.isArray(reminder.days) && reminder.days.length
    ? reminder.days
    : [0, 1, 2, 3, 4, 5, 6];
  const title = reminder.name || 'MemoryCare Reminder';
  const body = reminder.description
    ? `${reminder.time} - ${reminder.description}`
    : `Reminder at ${reminder.time}`;

  // Safe 32-bit integer base id under 2,000,000,000
  const rawId = Math.abs(Number(reminder.id) || Date.now());
  const baseId = (rawId % 100000) * 10;

  const notifications = [];
  const scheduledNotificationIds = [];

  for (const day of days) {
    const at = nextOccurrenceTime(reminder.time, [day]);
    if (!at) continue;

    const notifId = baseId + (day % 10);
    scheduledNotificationIds.push(notifId);

    notifications.push({
      id: notifId,
      title,
      body,
      channelId: REMINDER_CHANNEL_ID,
      sound: 'notification.mp3',
      smallIcon: 'ic_stat_memorycare',
      iconColor: '#2E7D32',
      foreground: true,
      schedule: {
        at,
        repeats: true,
        every: 'week',
        allowWhileIdle: true,
      },
      isExactNotification: true,
      autoCancel: true,
      extra: {
        reminderId: reminder.id,
        url: '/reminders',
      },
    });
  }

  if (notifications.length > 0) {
    try {
      await LocalNotifications.schedule({ notifications });
    } catch (e) {
      console.warn('Error scheduling native local notifications:', e);
    }
  }

  return scheduledNotificationIds;
}

export async function syncRemindersToNative(reminders) {
  if (!isNative()) return [];
  try {
    await ensureReminderChannel();
    await LocalNotifications.cancelAll();

    const updated = [];
    for (const reminder of (reminders || [])) {
      if (!reminder.completed) {
        const notificationIds = await scheduleNativeReminder(reminder);
        updated.push({ ...reminder, notificationIds });
      } else {
        updated.push(reminder);
      }
    }
    return updated;
  } catch (e) {
    console.warn('Error syncing reminders to native:', e);
    return reminders || [];
  }
}

export async function cancelNativeReminder(reminderOrId) {
  if (!isNative()) return;
  try {
    let ids = [];
    if (Array.isArray(reminderOrId)) {
      ids = reminderOrId;
    } else if (typeof reminderOrId === 'object' && reminderOrId !== null) {
      if (Array.isArray(reminderOrId.notificationIds) && reminderOrId.notificationIds.length) {
        ids = reminderOrId.notificationIds;
      } else if (reminderOrId.id) {
        const baseId = (Math.abs(Number(reminderOrId.id)) % 100000) * 10;
        ids = Array.from({ length: 7 }, (_, d) => baseId + d);
      }
    } else if (reminderOrId !== undefined && reminderOrId !== null) {
      const baseId = (Math.abs(Number(reminderOrId)) % 100000) * 10;
      ids = Array.from({ length: 7 }, (_, d) => baseId + d);
    }

    if (ids.length > 0) {
      await LocalNotifications.cancel({
        notifications: ids.map((id) => ({ id: Number(id) })),
      });
    }
  } catch (e) {
    console.warn('Error cancelling native local notification:', e);
  }
}

export function initNativeNotificationListeners(navigate) {
  if (!isNative()) return;
  try {
    LocalNotifications.removeAllListeners().then(() => {
      LocalNotifications.addListener('localNotificationActionPerformed', (notificationAction) => {
        if (typeof navigate === 'function') {
          navigate('/reminders');
        } else if (typeof window !== 'undefined') {
          window.location.href = '/reminders';
        }
      });
    }).catch(() => {});
  } catch (e) {}
}

export async function syncRemindersToSW(reminders) {
  const reg = await getRegistration();
  if (!reg) return;
  try {
    reg.active.postMessage({ type: 'SYNC_REMINDERS', reminders });
  } catch (e) {}
}

export async function cancelReminderInSW(reminderId) {
  const reg = await getRegistration();
  if (!reg) return;
  try {
    reg.active.postMessage({ type: 'CANCEL_REMINDER', reminderId });
  } catch (e) {}
}

export async function triggerReminderNotification(reminder) {
  playNotificationSound(2);
  const reg = await getRegistration();
  if (!(reg && 'showNotification' in reg)) return;
  const title = reminder.name || 'MemoryCare Reminder';
  const body = reminder.description
    ? `${reminder.time} - ${reminder.description}`
    : `Reminder at ${reminder.time}`;
  try {
    await reg.showNotification(title, {
      body,
      icon: '/assets/icon-192.png',
      badge: '/assets/icon-192.png',
      tag: `reminder-${reminder.id}`,
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200],
      data: { reminderId: reminder.id, url: '/reminders' },
    });
  } catch (e) {}
}

export function isPwaInstalled() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches ||
      navigator.standalone === true;
  } catch (e) {
    return false;
  }
}

export function getOnlineStatus() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}