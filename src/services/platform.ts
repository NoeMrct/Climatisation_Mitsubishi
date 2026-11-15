import type { DeviceClass } from '../domain/notify';

export function detectDeviceClass(): DeviceClass {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'pc';
  const touch = window.matchMedia('(pointer: coarse)').matches;
  return touch && Math.min(window.screen.width, window.screen.height) < 820 ? 'phone' : 'pc';
}
