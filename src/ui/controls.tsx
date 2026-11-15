import { useRef, type ReactNode } from 'react';
import { formatMinute, parseMinute } from '../domain/format';
import { attempt } from '../lib/attempt';
import { Icon, type IconName } from './icons';

interface SwitchProps {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function Switch({ label, checked, disabled = false, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
    >
      <span className="switch__track">
        <span className="switch__knob" />
      </span>
    </button>
  );
}

export function Radio({ on }: { on: boolean }) {
  return on ? (
    <span className="radio radio--on">
      <span className="radio__dot" />
    </span>
  ) : (
    <span className="radio" />
  );
}

interface SectionProps {
  label: string;
  right?: ReactNode;
  children: ReactNode;
}

export function Section({ label, right, children }: SectionProps) {
  const heading = <h2 className="eyebrow eyebrow--muted">{label}</h2>;
  return (
    <section className="section">
      {right ? (
        <div className="section__head">
          {heading}
          {right}
        </div>
      ) : (
        heading
      )}
      {children}
    </section>
  );
}

interface RoundLinkProps {
  href: string;
  label: string;
  icon: IconName;
}

export function RoundLink({ href, label, icon }: RoundLinkProps) {
  return (
    <a className="round" href={href} aria-label={label}>
      <Icon name={icon} />
    </a>
  );
}

interface SubHeaderProps {
  title: string;
  back: string;
  backLabel: string;
  right?: ReactNode;
}

export function SubHeader({ title, back, backLabel, right }: SubHeaderProps) {
  return (
    <header className="sub-head">
      <RoundLink href={back} label={backLabel} icon="left" />
      <h1 className="title title--sub title--grow">{title}</h1>
      {right}
    </header>
  );
}

export function StatusLine({ text, online = true }: { text: string; online?: boolean }) {
  return (
    <div className="status">
      <span className={online ? 'status__dot' : 'status__dot status__dot--off'} />
      <span className="status__text">{text}</span>
    </div>
  );
}

interface LinkRowProps {
  href: string;
  icon: IconName;
  title: string;
  sub: string;
}

export function LinkRow({ href, icon, title, sub }: LinkRowProps) {
  return (
    <a className="link-row" href={href}>
      <span className="row__lead row__lead--sm">
        <Icon name={icon} size={20} />
      </span>
      <span className="row__text">
        <span className="row__title">{title}</span>
        <span className="row__sub">{sub}</span>
      </span>
      <span className="row__chevron">
        <Icon name="right" size={18} strokeWidth={1.8} />
      </span>
    </a>
  );
}

interface StepperProps {
  label: string;
  value: string;
  canDecrease: boolean;
  canIncrease: boolean;
  onStep: (delta: 1 | -1) => void;
}

export function Stepper({ label, value, canDecrease, canIncrease, onStep }: StepperProps) {
  return (
    <div className="stepper">
      <div className="stepper__label">{label}</div>
      <div className="stepper__row">
        <button
          type="button"
          className="round round--soft"
          aria-label={`${label} : baisser`}
          style={{ opacity: canDecrease ? 1 : 0.35 }}
          onClick={() => {
            if (canDecrease) onStep(-1);
          }}
        >
          <Icon name="minus" size={20} strokeWidth={2} />
        </button>
        <span className="stepper__value">{value}°</span>
        <button
          type="button"
          className="round round--soft"
          aria-label={`${label} : monter`}
          style={{ opacity: canIncrease ? 1 : 0.35 }}
          onClick={() => {
            if (canIncrease) onStep(1);
          }}
        >
          <Icon name="plus" size={20} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

interface TimeFieldProps {
  label: string;
  minute: number;
  active?: boolean;
  onChange: (minute: number) => void;
}

export function TimeField({ label, minute, active = true, onChange }: TimeFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <span className="time-field">
      <span className={active ? 'time-field__button time-field__button--on' : 'time-field__button'} aria-hidden="true">
        {formatMinute(minute)}
      </span>
      <input
        ref={input}
        className="time-field__input"
        type="time"
        aria-label={label}
        value={formatMinute(minute)}
        onChange={(event) => {
          const next = parseMinute(event.target.value);
          if (next !== null) onChange(next);
        }}
        onClick={() => attempt(() => input.current?.showPicker())}
      />
    </span>
  );
}
