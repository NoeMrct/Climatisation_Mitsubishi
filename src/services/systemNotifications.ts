import type { AppNotification } from '../domain/notify';
import { attemptAsync } from '../lib/attempt';

export type SystemPermission = 'default' | 'granted' | 'denied' | 'unsupported';

const supported = (): boolean => typeof window !== 'undefined' && 'Notification' in window;

export function systemPermission(): SystemPermission {
  return supported() ? Notification.permission : 'unsupported';
}

export async function requestSystemPermission(): Promise<SystemPermission> {
  if (!supported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return systemPermission();
  }
}

export async function showSystemNotification(notification: AppNotification, silent: boolean): Promise<void> {
  if (!supported() || Notification.permission !== 'granted') return;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
  const options: NotificationOptions = {
    body: notification.body,
    tag: `clim-${notification.kind}`,
    icon: `${import.meta.env.BASE_URL}pwa-192.png`,
    lang: 'fr',
    silent,
  };
  await attemptAsync(async () => {
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registration) await registration.showNotification(notification.title, options);
    else new Notification(notification.title, options);
  });
}
