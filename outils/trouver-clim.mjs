import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import tls from 'node:tls';

const KEY = Buffer.concat([Buffer.from('unregistered'), Buffer.alloc(4)]);
const HEADERS = {
  'Content-Type': 'text/plain;chrset=UTF-8',
  'User-Agent':
    'KirigamineRemote/5.1.0 (jp.co.MitsubishiElectric.KirigamineRemote; build:3; iOS 17.5.1) Alamofire/5.9.1',
};

export function encrypt(xml, iv = randomBytes(16)) {
  const data = Buffer.from(xml, 'utf8');
  const fill = (16 - ((data.length + 1) % 16)) % 16;
  const padded = Buffer.concat([data, Buffer.from([0x80]), Buffer.alloc(fill)]);
  const cipher = createCipheriv('aes-128-cbc', KEY, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([iv, cipher.update(padded), cipher.final()]).toString('base64');
}

export function decrypt(base64) {
  const raw = Buffer.from(base64, 'base64');
  const decipher = createDecipheriv('aes-128-cbc', KEY, raw.subarray(0, 16));
  decipher.setAutoPadding(false);
  const clear = Buffer.concat([decipher.update(raw.subarray(16)), decipher.final()]);
  let end = clear.length;
  while (end > 0 && clear[end - 1] === 0) end -= 1;
  if (end > 0 && clear[end - 1] === 0x80) end -= 1;
  return clear.subarray(0, end).toString('utf8');
}

function candidates() {
  const addresses = new Set();
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family !== 'IPv4' || info.internal || info.address.startsWith('169.254.')) continue;
      const base = info.address.split('.').slice(0, 3).join('.');
      for (let host = 1; host < 255; host += 1) {
        const address = `${base}.${host}`;
        if (address !== info.address) addresses.add(address);
      }
    }
  }
  return [...addresses];
}

function hasWebServer(address, timeoutMs = 600) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: address, port: 80 });
    const finish = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function askState(address) {
  const body = `<?xml version="1.0" encoding="UTF-8"?><ESV>${encrypt('<CSV></CSV>')}</ESV>`;
  try {
    const response = await fetch(`http://${address}/smart`, {
      method: 'POST',
      headers: HEADERS,
      body,
      signal: AbortSignal.timeout(6000),
    });
    const text = await response.text();
    const match = /<ESV>([^<]+)<\/ESV>/.exec(text);
    if (!match) {
      return {
        address,
        found: false,
        http: response.status,
        server: response.headers.get('server'),
        body: text.slice(0, 160),
      };
    }
    return { address, found: true, xml: decrypt(match[1].trim()) };
  } catch (error) {
    return { address, found: false, error: error?.cause?.code ?? error?.name ?? 'erreur' };
  }
}

const mask = (xml) =>
  xml.replace(/<(MAC|SERIAL|APP_VER)>([^<]*)<\/\1>/g, (_, tag, value) => `<${tag}>…${value.slice(-4)}</${tag}>`);

async function describe(address) {
  try {
    const response = await fetch(`http://${address}/`, { signal: AbortSignal.timeout(5000) });
    const text = await response.text();
    const title = /<title>([^<]*)<\/title>/i.exec(text)?.[1] ?? '';
    return { http: response.status, server: response.headers.get('server'), title: title.slice(0, 60) };
  } catch (error) {
    return { error: error?.cause?.code ?? error?.name ?? 'erreur' };
  }
}

function rawExchange(address, port, secure, request) {
  return new Promise((resolve) => {
    const chunks = [];
    const options = { host: address, port, rejectUnauthorized: false };
    const socket = secure ? tls.connect(options) : net.connect(options);
    const finish = (error) => {
      socket.destroy();
      resolve({ port, error, raw: Buffer.concat(chunks).toString('latin1') });
    };
    socket.setTimeout(7000, () => finish('délai dépassé'));
    socket.once(secure ? 'secureConnect' : 'connect', () => socket.write(request));
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.once('error', (error) => finish(error.code ?? error.message));
    socket.once('close', () => finish(null));
  });
}

async function rawProbe(address) {
  const body = `<?xml version="1.0" encoding="UTF-8"?><ESV>${encrypt('<CSV></CSV>')}</ESV>`;
  const head = (method, path, length) =>
    `${method} ${path} HTTP/1.1\r\nHost: ${address}\r\nUser-Agent: ${HEADERS['User-Agent']}\r\n` +
    'Accept-Encoding: gzip, deflate\r\nAccept: */*\r\nConnection: keep-alive\r\n' +
    (length === null ? '' : `Content-Type: ${HEADERS['Content-Type']}\r\nContent-Length: ${length}\r\n`) +
    '\r\n';
  const requests = [
    ['POST /smart', head('POST', '/smart', Buffer.byteLength(body)) + body],
    ['GET /', head('GET', '/', null)],
  ];
  for (const [port, secure] of [
    [80, false],
    [443, true],
  ]) {
    for (const [label, request] of requests) {
      const answer = await rawExchange(address, port, secure, request);
      const match = /<ESV>([^<]+)<\/ESV>/.exec(answer.raw);
      const shown = answer.raw
        .replace(/[^\x20-\x7e\r\n]/g, '.')
        .replace(/\r?\n/g, ' | ')
        .slice(0, 220);
      console.log(`[${port} ${label}] ${answer.error ?? 'ok'} · ${answer.raw.length} octets · ${shown}`);
      if (match) {
        try {
          console.log('  déchiffré : ' + mask(decrypt(match[1].trim())).slice(0, 700));
        } catch (error) {
          console.log('  déchiffrement impossible : ' + error.message);
        }
      }
    }
  }
}

async function main() {
  const options = process.argv.slice(2);
  const details = options.includes('--details');
  const target = options.find((option) => !option.startsWith('--'));
  if (target && options.includes('--brut')) {
    await rawProbe(target);
    return;
  }
  let hosts = target ? [target] : [];
  if (!target) {
    const all = candidates();
    console.log(`Recherche sur ${all.length} adresses du réseau local…`);
    for (let index = 0; index < all.length; index += 64) {
      const slice = all.slice(index, index + 64);
      const open = await Promise.all(slice.map((address) => hasWebServer(address)));
      hosts.push(...slice.filter((_, position) => open[position]));
    }
    console.log(`${hosts.length} appareil(s) avec une interface web.`);
  }
  const answers = await Promise.all(hosts.map(askState));
  const units = answers.filter((answer) => answer.found);
  if (details) {
    for (const answer of answers.filter((item) => !item.found)) {
      console.log(JSON.stringify({ smart: answer, accueil: await describe(answer.address) }));
    }
  }
  if (units.length === 0) {
    console.log('RESULTAT : aucune interface Mitsubishi ne répond sur /smart.');
    if (target) console.log(JSON.stringify(answers[0]));
    return;
  }
  for (const unit of units) {
    const codes = [...unit.xml.matchAll(/<VALUE>([0-9a-fA-F]+)<\/VALUE>/g)].map((match) => match[1]);
    console.log(`RESULTAT : interface Mitsubishi trouvée à ${unit.address}, ${codes.length} trame(s) d'état.`);
    console.log(mask(unit.xml).slice(0, 900));
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  await main();
}
