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

export function requestNotificationPermission() {
  if (isNative()) {
    LocalNotifications.checkPermissions()
      .then((permission) => {
        if (permission.display !== 'granted') {
          return LocalNotifications.requestPermissions();
        }
        return permission;
      })
      .catch(() => {});
    return;
  }
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return;
  setTimeout(() => {
    Notification.requestPermission().catch(() => {});
  }, 3000);
}

export async function requestNotificationPermissions() {
  if (isNative()) {
    try {
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display === 'granted') return true;
      const result = await LocalNotifications.requestPermissions();
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

function nextOccurrenceTime(time, days = [0, 1, 2, 3, 4, 5, 6]) {
  const [hours, minutes] = String(time || '').split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  const now = new Date();
  const selectedDays = Array.isArray(days) && days.length ? days : [0, 1, 2, 3, 4, 5, 6];
  for (let offset = 0; offset <= 7; offset += 1) {
    const target = new Date(now);
    target.setDate(now.getDate() + offset);
    target.setHours(hours, minutes, 0, 0);
    if (selectedDays.includes(target.getDay()) && target.getTime() > now.getTime()) {
      return target;
    }
  }
  return null;
}

export async function scheduleNativeReminder(reminder) {
  if (!isNative() || !reminder) return;
  const days = Array.isArray(reminder.days) && reminder.days.length
    ? reminder.days
    : [0, 1, 2, 3, 4, 5, 6];
  const title = reminder.name || 'MemoryCare Reminder';
  const body = reminder.description
    ? `${reminder.time} - ${reminder.description}`
    : `Reminder at ${reminder.time}`;
  try {
    await LocalNotifications.schedule({
      notifications: days.map((day) => {
        const at = nextOccurrenceTime(reminder.time, [day]);
        return {
          id: Number(`${String(reminder.id).slice(-7)}${day}`) || Date.now() % 2147483647,
          title,
          body,
          schedule: { at, every: 'week' },
          sound: 'notification.mp3',
          smallIcon: 'ic_stat_memorycare',
          iconColor: '#2E7D32',
        };
      }),
    });
  } catch (e) {}
}

export async function syncRemindersToNative(reminders) {
  if (!isNative()) return;
  try {
    const pending = await LocalNotifications.getPending();
    const pendingIds = (pending.notifications || []).map((n) => n.id);
    if (pendingIds.length) {
      await LocalNotifications.cancel({
        notifications: pending.notifications || [],
      });
    }
    (reminders || [])
      .filter((r) => !r.completed)
      .forEach((reminder) => scheduleNativeReminder(reminder));
  } catch (e) {}
}

export async function cancelNativeReminder(reminderId) {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancel({ notifications: Array.from({ length: 7 }, (_, day) => ({
      id: Number(`${String(reminderId).slice(-7)}${day}`),
    })) });
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