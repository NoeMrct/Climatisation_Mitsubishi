import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, DEFAULT_HTTPS, fileStore, loadConfig, loadTls } from './config';

let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'clim-config-'));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe('configuration du serveur', () => {
  it('crée le fichier avec les valeurs par défaut au premier lancement', () => {
    const file = join(folder, 'clim.config.json');
    expect(loadConfig(file)).toEqual(DEFAULT_CONFIG);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(DEFAULT_CONFIG);
  });

  it('complète une configuration partielle sans réécrire le fichier', () => {
    const file = join(folder, 'clim.config.json');
    const content = JSON.stringify({ clim: '10.0.0.7', meteo: { latitude: 45.76 } });
    writeFileSync(file, content);
    expect(loadConfig(file)).toEqual({
      ...DEFAULT_CONFIG,
      clim: '10.0.0.7',
      meteo: { latitude: 45.76, longitude: DEFAULT_CONFIG.meteo.longitude },
    });
    expect(readFileSync(file, 'utf8')).toBe(content);
  });

  it('laisse le HTTPS éteint tant qu’il n’est pas demandé', () => {
    const file = join(folder, 'clim.config.json');
    expect(loadConfig(file).https).toBeNull();
    writeFileSync(file, JSON.stringify({ https: null }));
    expect(loadConfig(file).https).toBeNull();
  });

  it('complète un réglage HTTPS partiel et lit le contact des services de push', () => {
    const file = join(folder, 'clim.config.json');
    writeFileSync(file, JSON.stringify({ https: { port: 9443 }, contact: 'mailto:clim@exemple.fr' }));
    expect(loadConfig(file)).toMatchObject({
      https: { ...DEFAULT_HTTPS, port: 9443 },
      contact: 'mailto:clim@exemple.fr',
    });
  });

  it('garde un fichier illisible intact et retombe sur les valeurs par défaut', () => {
    const file = join(folder, 'clim.config.json');
    writeFileSync(file, '{ clim: ');
    expect(loadConfig(file)).toEqual(DEFAULT_CONFIG);
    expect(readFileSync(file, 'utf8')).toBe('{ clim: ');
  });
});

describe('certificat HTTPS', () => {
  it('lit le certificat et la clé, relatifs au dossier du serveur', () => {
    mkdirSync(join(folder, 'certs'));
    writeFileSync(join(folder, 'certs', 'clim.pem'), 'certificat');
    writeFileSync(join(folder, 'certs', 'clim-key.pem'), 'clé');
    const tls = loadTls(DEFAULT_HTTPS, folder);
    expect(tls?.cert.toString()).toBe('certificat');
    expect(tls?.key.toString()).toBe('clé');
  });

  it('accepte des chemins absolus', () => {
    const cert = join(folder, 'ailleurs.pem');
    writeFileSync(cert, 'certificat');
    expect(loadTls({ port: 8443, cert, key: cert }, join(folder, 'absent'))?.cert.toString()).toBe('certificat');
  });

  it('ne renvoie rien quand un fichier manque', () => {
    expect(loadTls(DEFAULT_HTTPS, folder)).toBeNull();
    mkdirSync(join(folder, 'certs'));
    writeFileSync(join(folder, 'certs', 'clim.pem'), 'certificat');
    expect(loadTls(DEFAULT_HTTPS, folder)).toBeNull();
  });
});

describe('état enregistré sur disque', () => {
  it('relit les valeurs après un redémarrage', () => {
    const file = join(folder, 'clim.state.json');
    const store = fileStore(file);
    expect(store.get('clé')).toBeNull();
    store.set('clé', 'valeur');
    expect(store.get('clé')).toBe('valeur');
    expect(fileStore(file).get('clé')).toBe('valeur');
  });

  it('repart de zéro quand le fichier est illisible', () => {
    const file = join(folder, 'clim.state.json');
    writeFileSync(file, 'illisible');
    expect(fileStore(file).get('clé')).toBeNull();
  });

  it('continue de fonctionner en mémoire quand l’écriture échoue', () => {
    const store = fileStore(join(folder, 'absent', 'clim.state.json'));
    expect(() => store.set('clé', 'valeur')).not.toThrow();
    expect(store.get('clé')).toBe('valeur');
  });
});
