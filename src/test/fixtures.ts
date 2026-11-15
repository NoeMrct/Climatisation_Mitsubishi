import { SimClock } from '../device/clock';
import { SimulatedClim } from '../device/SimulatedClim';
import { DEFAULT_SETTINGS } from '../domain/clim';
import type { ClimSettings } from '../domain/types';
import { AppController, type ControllerOptions, type Snapshot } from '../store/controller';
import { memoryStore } from '../store/storage';

export const START = new Date(2026, 10, 15, 17, 0).getTime();

export function makeController(settings: Partial<ClimSettings> = {}, options: Partial<ControllerOptions> = {}) {
  let real = 0;
  const clock = new SimClock(START, () => real);
  clock.setSpeed(60);
  const device = new SimulatedClim(
    { settings: { ...DEFAULT_SETTINGS, ...settings }, roomTemp: 19.5, outdoorTemp: 4 },
    START,
  );
  const controller = new AppController({
    device,
    clock,
    store: memoryStore(),
    simulator: { device, clock },
    ...options,
  });
  const advance = (minutes: number): void => {
    for (let step = 0; step < minutes; step += 1) {
      real += 1000;
      controller.tick();
    }
  };
  return { controller, device, advance };
}

export const makeSnapshot = (settings: Partial<ClimSettings> = {}): Snapshot =>
  makeController(settings).controller.getSnapshot();
