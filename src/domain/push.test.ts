import { describe, expect, it } from 'vitest';
import type { AppNotification } from './notify';
import { pushMessage, pushTopic, readPushMessage, type PushMessage } from './push';

const MESSAGE: PushMessage = {
  kind: 'forecast',
  title: 'Chauffage prévu vers 17:40',
  body: 'La pièce passera sous 19° d’ici 25 min. Il fait 4° dehors.',
  at: new Date(2026, 10, 15, 17, 15).getTime(),
  silent: false,
};

describe('message push', () => {
  it('ne transmet à l’appareil que ce qu’il affiche', () => {
    const notification: AppNotification = { ...MESSAGE, kind: 'forecast', devices: ['phone'] };
    expect(pushMessage(notification)).toEqual(MESSAGE);
  });

  it('relit un message complet', () => {
    expect(readPushMessage(JSON.stringify(MESSAGE))).toEqual(MESSAGE);
    expect(readPushMessage(JSON.stringify({ ...MESSAGE, kind: 'ready', silent: true, autre: 1 }))).toEqual({
      ...MESSAGE,
      kind: 'ready',
      silent: true,
    });
  });

  it('refuse un message absent, illisible ou incomplet', () => {
    const rejected = [
      undefined,
      '',
      'pas du json',
      'null',
      '42',
      '[]',
      JSON.stringify({ ...MESSAGE, kind: 'inconnu' }),
      JSON.stringify({ ...MESSAGE, title: 12 }),
      JSON.stringify({ ...MESSAGE, body: undefined }),
      JSON.stringify({ ...MESSAGE, at: '17:15' }),
      JSON.stringify({ ...MESSAGE, silent: 'non' }),
    ];
    for (const text of rejected) expect(readPushMessage(text)).toBeNull();
  });

  it('range chaque type de message sous son propre sujet', () => {
    expect([pushTopic('forecast'), pushTopic('start'), pushTopic('stop'), pushTopic('ready')]).toEqual([
      'clim-forecast',
      'clim-start',
      'clim-stop',
      'clim-ready',
    ]);
  });
});
