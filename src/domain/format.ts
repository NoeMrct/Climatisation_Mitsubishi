const pad = (n: number): string => String(n).padStart(2, '0');

export function formatTemp(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(Math.abs(rounded) === 0 ? 0 : rounded) : rounded.toFixed(1);
  return text.replace('.', ',');
}

export function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatMinute(minute: number): string {
  return `${pad(Math.floor(minute / 60) % 24)}:${pad(minute % 60)}`;
}

export function parseMinute(text: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatDuration(ms: number): string {
  const total = Math.max(1, Math.round(ms / 60_000));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${pad(minutes)}`;
}
