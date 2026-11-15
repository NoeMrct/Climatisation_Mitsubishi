export interface Coordinates {
  latitude: number;
  longitude: number;
}

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 10_000;

export async function fetchOutdoorTemp({ latitude, longitude }: Coordinates): Promise<number | null> {
  const url = `${ENDPOINT}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m`;
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const data = (await response.json()) as { current?: { temperature_2m?: unknown } };
  const temperature = data.current?.temperature_2m;
  return typeof temperature === 'number' ? temperature : null;
}
