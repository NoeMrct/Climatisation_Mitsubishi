export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export class SimClock implements Clock {
  private simAnchor: number;
  private realAnchor: number;
  private rate = 1;
  private readonly real: () => number;

  constructor(start: number = Date.now(), real: () => number = Date.now) {
    this.real = real;
    this.simAnchor = start;
    this.realAnchor = real();
  }

  now(): number {
    return this.simAnchor + (this.real() - this.realAnchor) * this.rate;
  }

  get speed(): number {
    return this.rate;
  }

  setSpeed(rate: number): void {
    this.simAnchor = this.now();
    this.realAnchor = this.real();
    this.rate = rate;
  }

  reset(start: number): void {
    this.simAnchor = start;
    this.realAnchor = this.real();
    this.rate = 1;
  }

  get offset(): number {
    return this.now() - this.real();
  }
}
