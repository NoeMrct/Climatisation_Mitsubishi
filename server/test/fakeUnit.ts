import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { bytesToHex, checksum, hexToBytes } from '../../src/device/mitsubishi';
import { decrypt, encrypt } from '../smart';

export interface FakeRegisters {
  power: number;
  mode: number;
  coarseTemp: number;
  fineTemp: number;
  fan: number;
  vaneV: number;
  vaneH: number;
  roomTemp: number;
  operating: number;
  autoMode: number;
}

export interface FakeUnit {
  readonly address: string;
  readonly registers: FakeRegisters;
  readonly commands: string[];
  polls: number;
  silent: boolean;
  frozen: boolean;
  close(): Promise<void>;
}

const INITIAL: FakeRegisters = {
  power: 0,
  mode: 0,
  coarseTemp: 0x0c,
  fineTemp: 0xa6,
  fan: 0,
  vaneV: 0,
  vaneH: 2,
  roomTemp: 16,
  operating: 0,
  autoMode: 0,
};

function report(group: number, values: Record<number, number>): string {
  const frame = new Array<number>(21).fill(0);
  frame.splice(0, 6, 0xfc, 0x62, 0x01, 0x30, 0x10, group);
  for (const [index, value] of Object.entries(values)) frame[Number(index)] = value;
  return bytesToHex([...frame, checksum(frame.slice(1))]);
}

function status(registers: FakeRegisters): string {
  const frames = [
    report(0x02, {
      8: registers.power,
      9: registers.mode | 0x08,
      10: registers.coarseTemp,
      11: registers.fan,
      12: registers.vaneV,
      15: 0x80 | registers.vaneH,
      16: registers.fineTemp,
    }),
    report(0x03, { 8: Math.trunc(registers.roomTemp) - 10, 10: 0x01, 11: 0x80 + registers.roomTemp * 2 }),
    report(0x06, { 9: registers.operating }),
    report(0x09, { 10: registers.autoMode }),
  ];
  return `<LSV><CODE>${frames.map((frame) => `<VALUE>${frame}</VALUE>`).join('')}</CODE></LSV>`;
}

function applyMode(registers: FakeRegisters, code: number): void {
  if (code === 0x08) registers.mode = 0;
  else if (code !== 0) registers.mode = code;
}

function apply(registers: FakeRegisters, command: readonly number[]): void {
  const flags = (command[6] << 8) | command[7];
  if (flags & 0x0100) registers.power = command[8];
  if (flags & 0x0200) applyMode(registers, command[9]);
  if (flags & 0x0400) {
    registers.coarseTemp = command[10];
    registers.fineTemp = command[19];
  }
  if (flags & 0x0800) registers.fan = command[11];
  if (flags & 0x1000) registers.vaneV = command[12];
  if (flags & 0x0001) registers.vaneH = command[18];
}

export async function startFakeUnit(): Promise<FakeUnit> {
  const registers = { ...INITIAL };
  const commands: string[] = [];

  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString('latin1');
    });
    request.on('end', () => {
      if (unit.silent) {
        request.socket.destroy();
        return;
      }
      const payload = decrypt(/<ESV>([^<]+)<\/ESV>/.exec(body)?.[1] ?? '');
      const command = /<VALUE>([0-9a-f]+)<\/VALUE>/.exec(payload)?.[1];
      if (command) {
        commands.push(command);
        if (!unit.frozen) apply(registers, hexToBytes(command));
      } else {
        unit.polls += 1;
      }
      const reply = `<?xml version="1.0" encoding="UTF-8"?><ESV>${encrypt(status(registers))}</ESV>`;
      response.writeHead(200, { 'Content-Length': Buffer.byteLength(reply), Connection: 'close' });
      response.end(reply);
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const unit: FakeUnit = {
    address: `127.0.0.1:${(server.address() as AddressInfo).port}`,
    registers,
    commands,
    polls: 0,
    silent: false,
    frozen: false,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
  return unit;
}
