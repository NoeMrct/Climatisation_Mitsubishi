import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOutdoorTemp } from './weather';

const PLACE = { latitude: 45.76, longitude: 4.84 };

const respondWith = (value: unknown) => {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(value))));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('température extérieure', () => {
  it('interroge Open-Meteo pour les coordonnées données', async () => {
    const fetchMock = respondWith({ current: { temperature_2m: 7.4 } });
    await expect(fetchOutdoorTemp(PLACE)).resolves.toBe(7.4);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      latitude: '45.76',
      longitude: '4.84',
      current: 'temperature_2m',
    });
  });

  it('ne renvoie rien quand la réponse ne contient pas de température', async () => {
    respondWith({ current: {} });
    await expect(fetchOutdoorTemp(PLACE)).resolves.toBeNull();
    respondWith({ current: { temperature_2m: '7.4' } });
    await expect(fetchOutdoorTemp(PLACE)).resolves.toBeNull();
  });

  it('laisse remonter une panne du service', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.reject(new Error('hors ligne'))),
    );
    await expect(fetchOutdoorTemp(PLACE)).rejects.toThrow('hors ligne');
  });
});
