import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFS } from '../domain/notify';
import { DEFAULT_REGULATION, IDLE_RUNTIME } from '../domain/regulation';
import { loadState, memoryStore, saveState } from './storage';

const KEY = 'clim.state.v1';

describe('enregistrement des réglages', () => {
  it('ne renvoie rien sans état enregistré ou si le contenu est illisible', () => {
    const store = memoryStore();
    expect(loadState(store)).toBeNull();
    store.set(KEY, '{pas du json');
    expect(loadState(store)).toBeNull();
    store.set(KEY, '42');
    expect(loadState(store)).toBeNull();
  });

  it('complète un état partiel avec les valeurs par défaut', () => {
    const store = memoryStore();
    store.set(KEY, JSON.stringify({ regulation: { enabled: false, heat: { low: 18 } }, notifications: { lead: 60 } }));
    const state = loadState(store);
    expect(state?.regulation).toEqual({
      enabled: false,
      heat: { enabled: true, low: 18, high: 21 },
      cool: DEFAULT_REGULATION.cool,
    });
    expect(state?.notifications).toEqual({ ...DEFAULT_NOTIFICATION_PREFS, lead: 60 });
    expect(state?.runtime).toEqual(IDLE_RUNTIME);
    expect(state?.schedule.days).toHaveLength(7);
    expect(state?.simulator).toBeNull();
  });

  it('remplace un programme incomplet et relit la clim simulée', () => {
    const store = memoryStore();
    store.set(
      KEY,
      JSON.stringify({
        schedule: { days: [[]] },
        simulator: { roomTemp: 22, outdoorTemp: 30, settings: { mode: 'cool' } },
      }),
    );
    const state = loadState(store);
    expect(state?.schedule.days).toHaveLength(7);
    expect(state?.simulator).toMatchObject({ roomTemp: 22, outdoorTemp: 30, clockOffset: 0 });
    expect(state?.simulator?.settings).toMatchObject({ mode: 'cool', fan: 'auto' });
  });

  it('relit ce qu’il a enregistré', () => {
    const store = memoryStore();
    const first = loadState({ get: () => '{}', set: () => {} });
    expect(first).not.toBeNull();
    if (!first) return;
    saveState(store, { ...first, regulation: { ...first.regulation, enabled: false } });
    expect(loadState(store)?.regulation.enabled).toBe(false);
  });
});
