import { describe, expect, it } from 'vitest';
import { attempt, attemptAsync } from './attempt';

const fail = (): never => {
  throw new Error('échec');
};

describe('tentatives sans exception', () => {
  it('renvoie le résultat quand tout se passe bien', () => {
    expect(attempt(() => 42)).toBe(42);
    expect(attempt(() => null)).toBeNull();
  });

  it('renvoie undefined quand l’action échoue', () => {
    expect(attempt(fail)).toBeUndefined();
  });

  it('attend le résultat d’une action asynchrone', async () => {
    await expect(attemptAsync(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('absorbe un rejet comme une exception immédiate', async () => {
    await expect(attemptAsync(() => Promise.reject(new Error('échec')))).resolves.toBeUndefined();
    await expect(attemptAsync(async () => fail())).resolves.toBeUndefined();
  });
});
