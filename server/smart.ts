import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import net from 'node:net';

const KEY = Buffer.concat([Buffer.from('unregistered'), Buffer.alloc(4)]);
const USER_AGENT =
  'KirigamineRemote/5.1.0 (jp.co.MitsubishiElectric.KirigamineRemote; build:3; iOS 17.5.1) Alamofire/5.9.1';

export function encrypt(xml: string): string {
  const iv = randomBytes(16);
  const data = Buffer.from(xml, 'utf8');
  const padded = Buffer.concat([data, Buffer.from([0x80]), Buffer.alloc((16 - ((data.length + 1) % 16)) % 16)]);
  const cipher = createCipheriv('aes-128-cbc', KEY, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([iv, cipher.update(padded), cipher.final()]).toString('base64');
}

export function decrypt(base64: string): string {
  const raw = Buffer.from(base64, 'base64');
  const decipher = createDecipheriv('aes-128-cbc', KEY, raw.subarray(0, 16));
  decipher.setAutoPadding(false);
  const clear = Buffer.concat([decipher.update(raw.subarray(16)), decipher.final()]);
  let end = clear.length;
  while (end > 0 && clear[end - 1] === 0) end -= 1;
  if (end > 0 && clear[end - 1] === 0x80) end -= 1;
  return clear.subarray(0, end).toString('utf8');
}

export function exchange(address: string, xml: string, timeoutMs = 8000): Promise<string> {
  const [host, port = '80'] = address.split(':');
  const body = `<?xml version="1.0" encoding="UTF-8"?><ESV>${encrypt(xml)}</ESV>`;
  const request =
    `POST /smart HTTP/1.1\r\nHost: ${address}\r\nUser-Agent: ${USER_AGENT}\r\n` +
    'Accept-Encoding: gzip, deflate\r\nAccept: */*\r\nConnection: keep-alive\r\n' +
    `Content-Type: text/plain;chrset=UTF-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = net.connect({ host, port: Number(port) });
    let settled = false;
    const finish = (error: Error | null): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      const match = /<ESV>([^<]+)<\/ESV>/.exec(Buffer.concat(chunks).toString('latin1'));
      if (!match) {
        reject(error ?? new Error('réponse sans données'));
        return;
      }
      try {
        resolve(decrypt(match[1].trim()));
      } catch (cause) {
        reject(cause instanceof Error ? cause : new Error('réponse illisible'));
      }
    };
    socket.setTimeout(timeoutMs, () => finish(new Error('délai dépassé')));
    socket.once('connect', () => socket.write(request));
    socket.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      if (chunk.includes('</ESV>')) finish(null);
    });
    socket.once('error', (error) => finish(error));
    socket.once('close', () => finish(null));
  });
}
