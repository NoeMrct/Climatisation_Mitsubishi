import type { FanSpeed, Mode, VaneH, VaneStep, VaneV } from '../domain/types';

export interface UnitSettings {
  power: boolean;
  mode: Mode;
  temp: number;
  fan: FanSpeed;
  vaneV: VaneV;
  vaneH: VaneH;
}

export interface UnitSensors {
  roomTemp: number;
  outdoorTemp: number | null;
}

export interface UnitStatus {
  settings: UnitSettings | null;
  sensors: UnitSensors | null;
  operating: boolean | null;
  autoPhase: 'heat' | 'cool' | null;
}

export const UNIT_TEMP_RANGE = { min: 16, max: 31 } as const;

export type Field = keyof UnitSettings;

const MODE_CODE: Record<Mode, number> = { auto: 0, heat: 1, dry: 2, cool: 3, fan: 7 };
const AUTO_COMMAND = 0x08;
const AUTO_HEATING = 2;
const AUTO_COOLING = 3;
const FAN_CODE: [FanSpeed, number][] = [
  ['auto', 0],
  ['quiet', 1],
  [1, 2],
  [2, 3],
  [3, 5],
  [4, 6],
];

const FLAG: Record<Field, number> = {
  power: 0x0100,
  mode: 0x0200,
  temp: 0x0400,
  fan: 0x0800,
  vaneV: 0x1000,
  vaneH: 0x0001,
};
const OUTSIDE_CONTROL = 0x0002;
const SWING_V = 7;
const SPLIT_H = 8;
const SWING_H = 12;

const toStep = (value: number): VaneStep => Math.max(0, Math.min(4, value)) as VaneStep;

export function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let index = 0; index + 1 < hex.length; index += 2) bytes.push(Number.parseInt(hex.slice(index, index + 2), 16));
  return bytes;
}

export const bytesToHex = (bytes: readonly number[]): string =>
  bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');

export function checksum(bytes: readonly number[]): number {
  const sum = bytes.reduce((total, byte) => total + byte, 0);
  return (0x100 - (sum % 0x100)) % 0x100;
}

const isReport = (frame: readonly number[], group: number): boolean =>
  frame.length >= 22 && frame[0] === 0xfc && frame[1] === 0x62 && frame[5] === group;

export function parseSettings(frame: readonly number[]): UnitSettings | null {
  if (!isReport(frame, 0x02)) return null;
  const modeCode = frame[9] & 0x07;
  const mode = (Object.keys(MODE_CODE) as Mode[]).find((key) => MODE_CODE[key] === modeCode) ?? 'auto';
  const fan = FAN_CODE.find(([, code]) => code === frame[11])?.[0] ?? 'auto';
  const vertical = frame[12];
  const horizontal = frame[15] & 0x0f;
  let vaneH: VaneH = 2;
  if (horizontal === SWING_H) vaneH = 'swing';
  else if (horizontal === SPLIT_H || horizontal === 9) vaneH = 'split';
  else if (horizontal >= 1 && horizontal <= 5) vaneH = toStep(horizontal - 1);
  else if (horizontal === 6) vaneH = 1;
  else if (horizontal === 7) vaneH = 3;
  return {
    power: frame[8] !== 0,
    mode,
    temp: frame[16] !== 0 ? (frame[16] - 128) / 2 : 31 - frame[10],
    fan,
    vaneV: vertical === SWING_V ? 'swing' : vertical >= 1 && vertical <= 5 ? toStep(vertical - 1) : 'auto',
    vaneH,
  };
}

export function parseSensors(frame: readonly number[]): UnitSensors | null {
  if (!isReport(frame, 0x03)) return null;
  const outdoor = (frame[10] - 128) / 2;
  return {
    roomTemp: frame[11] !== 0 ? (frame[11] - 128) / 2 : frame[8] + 10,
    outdoorTemp: frame[10] > 1 && outdoor > -40 && outdoor < 60 ? outdoor : null,
  };
}

function autoPhaseOf(code: number): 'heat' | 'cool' | null {
  if (code === AUTO_HEATING) return 'heat';
  if (code === AUTO_COOLING) return 'cool';
  return null;
}

export function readStatus(xml: string): UnitStatus {
  const status: UnitStatus = { settings: null, sensors: null, operating: null, autoPhase: null };
  for (const match of xml.matchAll(/<VALUE>([0-9a-fA-F]+)<\/VALUE>/g)) {
    const frame = hexToBytes(match[1]);
    status.settings = parseSettings(frame) ?? status.settings;
    status.sensors = parseSensors(frame) ?? status.sensors;
    if (isReport(frame, 0x06)) status.operating = frame[9] !== 0;
    if (isReport(frame, 0x09)) status.autoPhase = autoPhaseOf(frame[10]);
  }
  return status;
}

export function buildCommand(settings: UnitSettings, fields: readonly Field[]): string {
  const flags = fields.reduce((bits, field) => bits | FLAG[field], OUTSIDE_CONTROL);
  const fan = FAN_CODE.find(([speed]) => speed === settings.fan)?.[1] ?? 0;
  let vertical = 0;
  if (settings.vaneV === 'swing') vertical = SWING_V;
  else if (typeof settings.vaneV === 'number') vertical = settings.vaneV + 1;
  let horizontal = SPLIT_H;
  if (settings.vaneH === 'swing') horizontal = SWING_H;
  else if (typeof settings.vaneH === 'number') horizontal = settings.vaneH + 1;

  const body = new Array<number>(20).fill(0);
  body.splice(0, 5, 0x41, 0x01, 0x30, 0x10, 0x01);
  body[5] = (flags >> 8) & 0xff;
  body[6] = flags & 0xff;
  body[7] = settings.power ? 1 : 0;
  body[8] = settings.mode === 'auto' && fields.includes('mode') ? AUTO_COMMAND : MODE_CODE[settings.mode];
  body[9] = 31 - Math.max(UNIT_TEMP_RANGE.min, Math.min(UNIT_TEMP_RANGE.max, Math.trunc(settings.temp)));
  body[10] = fan;
  body[11] = vertical;
  body[17] = horizontal;
  body[18] = 0x80 + Math.round(settings.temp * 2);
  body[19] = 0x41;
  return bytesToHex([0xfc, ...body, checksum(body)]);
}
