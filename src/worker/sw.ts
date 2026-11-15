import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { readPushMessage } from '../domain/push';
import { callOf, displayOf, failureDisplay, linkOf, unreadableMessage, type Display, type RemoteCall } from './display';

declare const self: ServiceWorkerGlobalScope;

void self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }));

const { scope } = self.registration;

const show = ({ title, options }: Display): Promise<void> => self.registration.showNotification(title, options);

async function open(link: string): Promise<void> {
  const [client] = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const focused = await client?.focus().catch(() => null);
  if (focused) focused.postMessage({ link });
  else await self.clients.openWindow(`${scope}${link}`);
}

async function run(call: RemoteCall): Promise<void> {
  const response = await fetch('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(call),
  }).catch(() => null);
  if (!response?.ok) await show(failureDisplay(scope, Date.now()));
}

self.addEventListener('push', (event) => {
  const message = readPushMessage(event.data?.text()) ?? unreadableMessage(Date.now());
  event.waitUntil(show(displayOf(message, scope)));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const call = callOf(event.action);
  event.waitUntil(call ? run(call) : open(linkOf(event.notification.data)));
});
