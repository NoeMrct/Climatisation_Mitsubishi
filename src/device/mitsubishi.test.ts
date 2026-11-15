import { describe, expect, it } from 'vitest';
import {
  buildCommand,
  checksum,
  hexToBytes,
  parseSensors,
  parseSettings,
  readStatus,
  type UnitSettings,
} from './mitsubishi';

const SETTINGS = 'fc6201301002000000080c0000000082a646000000d9';
const SENSORS = 'fc62013010030000060001a0a4fe42000991ef000046';
const off: UnitSettings = { power: false, mode: 'auto', temp: 19, fan: 'auto', vaneV: 'auto', vaneH: 1 };

describe('trames Mitsubishi', () => {
  it('lit les réglages de la clim', () => {
    expect(parseSettings(hexToBytes(SETTINGS))).toEqual(off);
    expect(parseSettings(hexToBytes(SENSORS))).toBeNull();
  });

  it('lit la température de la pièce, sans température extérieure', () => {
    expect(parseSensors(hexToBytes(SENSORS))).toEqual({ roomTemp: 16, outdoorTemp: null });
  });

  it('retrouve les trames dans la réponse de l’interface', () => {
    const xml = `<LSV><PROFILECODE><VALUE>fc7b013010c9</VALUE></PROFILECODE><CODE><VALUE>${SETTINGS}</VALUE><VALUE>${SENSORS}</VALUE></CODE></LSV>`;
    expect(readStatus(xml)).toEqual({
      settings: off,
      sensors: { roomTemp: 16, outdoorTemp: null },
      operating: null,
      autoPhase: null,
    });
  });

  it('produit les mêmes ordres que pymitsubishi', () => {
    expect(buildCommand({ ...off, power: true }, ['power'])).toBe('fc4101301001010201000c0000000000000002a64184');
    expect(buildCommand(off, ['power'])).toBe('fc4101301001010200000c0000000000000002a64185');
    expect(buildCommand({ ...off, mode: 'heat', temp: 21 }, ['mode', 'temp'])).toBe(
      'fc4101301001060200010a0000000000000002aa417d',
    );
    expect(buildCommand({ ...off, fan: 2 }, ['fan'])).toBe('fc4101301001080200000c0300000000000002a6417b');
    expect(buildCommand({ ...off, vaneV: 3, vaneH: 2 }, ['vaneV', 'vaneH'])).toBe(
      'fc4101301001100300000c0004000000000003a64170',
    );
  });

  it('relit ses propres ordres de volets', () => {
    for (const vaneH of [0, 4, 'split', 'swing'] as const) {
      const hex = buildCommand({ ...off, vaneV: 'swing', vaneH }, ['vaneV', 'vaneH']);

      const bytes = hexToBytes(hex);
      const report = hexToBytes(SETTINGS);
      report[12] = bytes[12];
      report[15] = bytes[18];
      expect(parseSettings(report)).toMatchObject({ vaneV: 'swing', vaneH });
    }
  });

  it('demande le mode Auto avec le code 8, que la clim relit comme 0', () => {
    const frame = hexToBytes(buildCommand({ ...off, power: true, temp: 22 }, ['mode']));
    expect(frame.slice(6, 8)).toEqual([0x02, 0x02]);
    expect(frame[9]).toBe(0x08);
    expect(hexToBytes(buildCommand({ ...off, power: true }, ['power']))[9]).toBe(0x00);
    expect(frame[frame.length - 1]).toBe(checksum(frame.slice(1, -1)));
    expect(parseSettings(hexToBytes(SETTINGS))?.mode).toBe('auto');
  });

  it('lit le sens choisi par la clim en mode Auto', () => {
    const report = (code: string): string => `<VALUE>fc620130100900000000${code}0000000000000000000000</VALUE>`;
    expect(readStatus(report('02')).autoPhase).toBe('heat');
    expect(readStatus(report('03')).autoPhase).toBe('cool');
    expect(readStatus(report('01')).autoPhase).toBeNull();
    expect(readStatus(`<VALUE>${SETTINGS}</VALUE>`).autoPhase).toBeNull();
  });
});
