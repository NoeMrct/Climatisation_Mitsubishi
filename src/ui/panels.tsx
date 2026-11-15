import {
  ECONO_OFFSET,
  NIGHT_OFFSET,
  SETPOINT_RANGE,
  canEconoCool,
  canISave,
  canPowerful,
  currentSetpoint,
  hasSetpoint,
} from '../domain/capabilities';
import { isPowerful } from '../domain/clim';
import { aimLabel, swingLabel } from '../domain/airflow';
import { FLOW_PROFILES, flowLevel } from '../domain/flow';
import { formatTemp } from '../domain/format';
import type { Segment } from '../domain/schedule';
import type { ClimCommand, FanSpeed } from '../domain/types';
import { useApp, useController } from '../store/hooks';
import { MODE_LIST, climLook, fanLabel, modeInfo } from '../store/view';
import { Radio, Switch } from './controls';
import { Icon, type IconName } from './icons';
import { LINKS } from './routes';
import { Stage, StageBlock } from './Stage';

export function ClimStage({ desktop = false }: { desktop?: boolean }) {
  const { clim, now } = useApp();
  const controller = useController();
  const { settings } = clim;
  const { look, accent, unitLabel } = climLook(clim);
  const press = desktop ? 'clique sur' : 'touche';
  let hint = `Glisse le flux · ${press} la clim pour éteindre`;
  if (!settings.power) hint = desktop ? 'Clique sur la clim pour l’allumer' : ' ';

  return (
    <StageBlock hint={hint}>
      <Stage
        look={look}
        accent={accent}
        unitLabel={unitLabel}
        power={settings.power}
        v={settings.vaneV}
        h={settings.vaneH}
        flow={FLOW_PROFILES[flowLevel(clim, now)]}
        desktop={desktop}
        onAim={(cell) => controller.command({ type: 'vanes', v: cell.row, h: cell.col })}
        onTogglePower={() => controller.command({ type: 'power', on: !settings.power })}
      />
    </StageBlock>
  );
}

export function TempBlock() {
  const { clim, now } = useApp();
  const controller = useController();
  const { settings } = clim;
  const { label, icon } = climLook(clim);
  const setpoint = currentSetpoint(settings);
  const range = hasSetpoint(settings.mode) ? SETPOINT_RANGE[settings.mode] : null;
  const outdoor = clim.outdoorTemp === null ? '' : ` · Extérieur ${formatTemp(clim.outdoorTemp)}°`;

  const tags: [IconName, string][] = [];
  if (settings.power) {
    if (isPowerful(settings, now)) tags.push(['bolt', 'Powerful']);
    if (settings.econoCool) tags.push(['leaf', 'Econo Cool']);
    if (settings.isave) tags.push(['bookmark', 'i-save']);
    if (settings.nightMode) tags.push(['moon', 'Nuit']);
  }

  const adjustable = settings.power && setpoint !== null && range !== null;
  const number = (
    <div className={settings.power ? 'temp__num' : 'temp__num temp__num--off'}>
      <span className="temp__value">{formatTemp(adjustable ? setpoint : clim.roomTemp)}</span>
      <span className="temp__degree">°</span>
    </div>
  );

  return (
    <section aria-label="Température" className="temp">
      <div className="temp__eyebrow eyebrow">
        {settings.power ? (
          <span className="temp__tag temp__tag--mode">
            <Icon name={icon} size={15} strokeWidth={1.8} />
            <span>{label}</span>
          </span>
        ) : (
          <span className="temp__tag temp__tag--off">
            <Icon name="power" size={15} strokeWidth={1.8} />
            <span>Éteinte</span>
          </span>
        )}
        {tags.map(([tagIcon, text]) => (
          <span key={text} className="temp__tag">
            <Icon name={tagIcon} size={15} strokeWidth={1.8} />
            <span>{text}</span>
          </span>
        ))}
      </div>
      {adjustable ? (
        <div className="temp__row">
          <button
            type="button"
            className="round round--lg"
            aria-label="Baisser la consigne"
            disabled={setpoint <= range.min}
            onClick={() => controller.command({ type: 'setpoint', value: setpoint - 1 })}
          >
            <Icon name="left" size={24} strokeWidth={1.8} />
          </button>
          {number}
          <button
            type="button"
            className="round round--lg"
            aria-label="Augmenter la consigne"
            disabled={setpoint >= range.max}
            onClick={() => controller.command({ type: 'setpoint', value: setpoint + 1 })}
          >
            <Icon name="right" size={24} strokeWidth={1.8} />
          </button>
        </div>
      ) : (
        <div className="temp__row temp__row--alone">{number}</div>
      )}
      <div className="temp__info">
        {adjustable ? `Intérieur ${formatTemp(clim.roomTemp)}°${outdoor}` : `Température intérieure${outdoor}`}
      </div>
    </section>
  );
}

export function Tiles() {
  const { clim } = useApp();
  const { settings } = clim;
  const on = settings.power;
  const mode = modeInfo(settings.mode);
  const tiles: { icon: IconName; label: string; value: string; href: string; color: string }[] = [
    { icon: mode.icon, label: 'Mode', value: mode.short, href: LINKS.modes, color: on ? 'var(--acc)' : 'var(--t2)' },
    {
      icon: 'wind',
      label: 'Ventilation',
      value: fanLabel(settings.fan),
      href: LINKS.flux,
      color: on ? 'var(--t1)' : 'var(--t2)',
    },
    {
      icon: 'swingv',
      label: 'Oscillation',
      value: swingLabel(settings.vaneV, settings.vaneH),
      href: LINKS.flux,
      color: on ? 'var(--t1)' : 'var(--t2)',
    },
  ];
  return (
    <nav aria-label="Réglages" className="tiles">
      {tiles.map((tile) => (
        <a key={tile.label} className="tile" href={tile.href} aria-label={`${tile.label} : ${tile.value}`}>
          <span className="tile__icon" style={{ color: tile.color }}>
            <Icon name={tile.icon} />
          </span>
          <span className="tile__text">
            <span className="tile__label">{tile.label}</span>
            <span className="tile__value">{tile.value}</span>
          </span>
        </a>
      ))}
    </nav>
  );
}

interface FanControlsProps {
  compact?: boolean;
}

export function FanControls({ compact = false }: FanControlsProps) {
  const { clim } = useApp();
  const controller = useController();
  const { fan } = clim.settings;
  const barMax = compact ? 40 : 36;
  const heights = [0.375, 0.58, 0.79, 1].map((ratio) => Math.round(barMax * ratio));
  const pill = compact ? 'pill pill--40' : 'pill';
  const pick = (next: FanSpeed) => () => controller.command({ type: 'fan', fan: next });

  return (
    <>
      <div className="grid-2">
        <button type="button" className={pill} aria-pressed={fan === 'auto'} onClick={pick('auto')}>
          Auto
        </button>
        <button type="button" className={pill} aria-pressed={fan === 'quiet'} onClick={pick('quiet')}>
          Silencieux
        </button>
      </div>
      <div className="grid-4">
        {([1, 2, 3, 4] as const).map((speed) => {
          const lit = typeof fan === 'number' && speed <= fan;
          return (
            <button
              key={speed}
              type="button"
              className={lit ? 'fan-bar fan-bar--lit' : 'fan-bar'}
              style={{ height: barMax + 22 }}
              aria-label={`Vitesse ${speed}`}
              aria-pressed={fan === speed}
              onClick={pick(speed)}
            >
              <span className="fan-bar__fill" style={{ height: heights[speed - 1] }} />
              <span className="fan-bar__number">{speed}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

export function AimChips() {
  const { clim } = useApp();
  const controller = useController();
  const { vaneV, vaneH, lastRow, lastCol } = clim.settings;
  const chips: { icon: IconName; text: string; label: string; pressed: boolean; command: ClimCommand }[] = [
    {
      icon: 'auto',
      text: 'Auto',
      label: 'Hauteur automatique',
      pressed: vaneV === 'auto',
      command: { type: 'vanes', v: vaneV === 'auto' ? lastRow : 'auto' },
    },
    {
      icon: 'swingv',
      text: 'Oscillation',
      label: 'Oscillation verticale',
      pressed: vaneV === 'swing',
      command: { type: 'vanes', v: vaneV === 'swing' ? lastRow : 'swing' },
    },
    {
      icon: 'swingh',
      text: 'Balayage',
      label: 'Balayage horizontal',
      pressed: vaneH === 'swing',
      command: { type: 'vanes', h: vaneH === 'swing' ? lastCol : 'swing' },
    },
    {
      icon: 'hsplit',
      text: 'Large',
      label: 'Souffle des deux côtés',
      pressed: vaneH === 'split',
      command: { type: 'vanes', h: vaneH === 'split' ? lastCol : 'split' },
    },
  ];
  return (
    <div className="grid-4">
      {chips.map((chip) => (
        <button
          key={chip.text}
          type="button"
          className="chip"
          aria-label={chip.label}
          aria-pressed={chip.pressed}
          onClick={() => controller.command(chip.command)}
        >
          <Icon name={chip.icon} size={20} strokeWidth={1.8} />
          <span>{chip.text}</span>
        </button>
      ))}
    </div>
  );
}

export function AimText() {
  const { settings } = useApp().clim;
  return <>{settings.power ? aimLabel(settings.vaneV, settings.vaneH) : 'Éteinte'}</>;
}

export function ModeList({ compact = false }: { compact?: boolean }) {
  const { clim } = useApp();
  const controller = useController();
  return (
    <div className="rows">
      {MODE_LIST.map((item) => {
        const on = item.mode === clim.settings.mode;
        return (
          <button
            key={item.mode}
            type="button"
            className={compact ? 'row row--compact' : 'row'}
            aria-pressed={on}
            onClick={() => controller.command({ type: 'mode', mode: item.mode })}
          >
            {compact ? (
              <>
                <span className={on ? 'row__icon row__icon--on' : 'row__icon'}>
                  <Icon name={item.icon} size={20} />
                </span>
                <span className="row__title row__title--compact">{item.name}</span>
              </>
            ) : (
              <>
                <span className={on ? 'row__lead row__lead--on' : 'row__lead'}>
                  <Icon name={item.icon} size={20} strokeWidth={on ? 1.8 : 1.6} />
                </span>
                <span className="row__text">
                  <span className="row__title">{item.name}</span>
                  <span className="row__sub">{item.sub}</span>
                </span>
              </>
            )}
            <Radio on={on} />
          </button>
        );
      })}
    </div>
  );
}

export function OptionList({ compact = false }: { compact?: boolean }) {
  const { clim, now } = useApp();
  const controller = useController();
  const { settings } = clim;

  const needsPower = settings.power ? null : 'Clim éteinte';
  const powerful = isPowerful(settings, now);
  const setpoint = currentSetpoint(settings);
  const econo = settings.econoCool || canEconoCool(settings);
  const isave = settings.isave || canISave(settings);
  const softened = (degrees: number): string => {
    if (settings.mode === 'heat') return `${degrees}° de moins, souffle silencieux`;
    if (settings.mode === 'cool') return `${degrees}° de plus, souffle silencieux`;
    return 'Souffle silencieux';
  };
  const options: {
    icon: IconName;
    name: string;
    on: boolean;
    available: boolean;
    sub: string;
    toggle: (on: boolean) => ClimCommand;
  }[] = [
    {
      icon: 'bolt',
      name: 'Powerful',
      on: powerful,
      available: canPowerful(settings),
      sub: canPowerful(settings)
        ? powerful && setpoint !== null
          ? `Plein régime jusqu’à ${formatTemp(setpoint)}°`
          : 'Plein régime jusqu’à la consigne'
        : (needsPower ?? 'Disponible en Froid et en Chaud'),
      toggle: (on) => ({ type: 'powerful', on }),
    },
    {
      icon: 'leaf',
      name: 'Econo Cool',
      on: settings.econoCool,
      available: econo,
      sub: econo ? softened(ECONO_OFFSET) : (needsPower ?? 'Disponible en Froid et en Chaud'),
      toggle: (on) => ({ type: 'econoCool', on }),
    },
    {
      icon: 'bookmark',
      name: 'i-save',
      on: settings.isave,
      available: isave,
      sub: isave ? 'Rappelle ton réglage favori' : (needsPower ?? 'Disponible en Froid et en Chaud'),
      toggle: (on) => ({ type: 'isave', on }),
    },
    {
      icon: 'moon',
      name: 'Mode nuit',
      on: settings.nightMode,
      available: true,
      sub: softened(NIGHT_OFFSET),
      toggle: (on) => ({ type: 'nightMode', on }),
    },
  ];
  return (
    <div className="rows">
      {options.map((option) => {
        const muted = option.available ? '' : ' row--muted';
        return (
          <div key={option.name} className={`row ${compact ? 'row--compact' : 'row--option'}${muted}`}>
            {compact ? (
              <>
                <span className="row__icon">
                  <Icon name={option.icon} size={20} />
                </span>
                <span className="row__title row__title--compact">{option.name}</span>
              </>
            ) : (
              <>
                <span className="row__lead">
                  <Icon name={option.icon} size={20} />
                </span>
                <span className="row__text">
                  <span className="row__title">{option.name}</span>
                  <span className="row__sub">{option.sub}</span>
                </span>
              </>
            )}
            <Switch
              label={option.name}
              checked={option.on}
              disabled={!option.available}
              onChange={(on) => controller.command(option.toggle(on))}
            />
          </div>
        );
      })}
    </div>
  );
}

interface DayBarProps {
  segments: Segment[];
  small?: boolean;
}

export function DayBar({ segments, small = false }: DayBarProps) {
  return (
    <>
      <div aria-hidden="true" className={small ? 'daybar daybar--sm' : 'daybar'}>
        {segments.map((segment) => (
          <span
            key={segment.start}
            className="daybar__on"
            style={{
              left: `${((segment.start / 1440) * 100).toFixed(2)}%`,
              width: `${(((segment.end - segment.start) / 1440) * 100).toFixed(2)}%`,
            }}
          />
        ))}
      </div>
      <div aria-hidden="true" className="dayscale">
        <span>0 h</span>
        <span>6 h</span>
        <span>12 h</span>
        <span>18 h</span>
        <span>24 h</span>
      </div>
    </>
  );
}
