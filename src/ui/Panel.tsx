// Operator-side UI: pushbuttons, pilot lamps, alarm list, fault injection, sim controls.
import { useRef } from 'react';
import type { Sim } from '../plant/sim';
import type { AlarmDef, Control, FaultDef, Indicator } from '../scenarios/types';

const MIN_PRESS_MS = 150;

/** Press-and-hold button: pointer, touch and keyboard (Space/Enter). */
function Momentary({ sim, c }: { sim: Sim; c: Extract<Control, { kind: 'momentary' }> }) {
  const down = Boolean(sim.field[c.field]);
  const pressedAt = useRef(0);
  // A quick click can be shorter than a frame; hold for at least a few scans so the PLC sees it.
  const set = (v: boolean) => {
    if (v) {
      pressedAt.current = performance.now();
      sim.setField(c.field, true);
    } else {
      const wait = Math.max(0, MIN_PRESS_MS - (performance.now() - pressedAt.current));
      setTimeout(() => sim.setField(c.field, false), wait);
    }
  };
  return (
    <div className="device">
      <button
        type="button"
        className={`pb tone-${c.tone ?? 'neutral'} ${down ? 'down' : ''}`}
        aria-pressed={down}
        aria-label={`${c.label} (hold)`}
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture(e.pointerId); // keep receiving pointerup if the finger slides off
          } catch {
            // synthetic or already-released pointer
          }
          set(true);
        }}
        onPointerUp={() => set(false)}
        onPointerCancel={() => set(false)}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
            e.preventDefault();
            set(true);
          }
        }}
        onKeyUp={(e) => {
          if (e.key === ' ' || e.key === 'Enter') set(false);
        }}
        onBlur={() => down && set(false)}
      />
      <span className="legend">{c.label}</span>
    </div>
  );
}

function Toggle({ sim, c }: { sim: Sim; c: Extract<Control, { kind: 'toggle' }> }) {
  const on = Boolean(sim.field[c.field]);
  return (
    <div className="device">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${c.label}: ${on ? c.on : c.off}`}
        className={`selector ${on ? 'on' : ''}`}
        onClick={() => sim.setField(c.field, !on)}
      >
        <span className="selector-knob" />
      </button>
      <span className="legend">
        {c.off} / {c.on}
      </span>
    </div>
  );
}

function EStop({ sim, c }: { sim: Sim; c: Extract<Control, { kind: 'estop' }> }) {
  const pressed = Boolean(sim.field[c.field]);
  return (
    <div className="device">
      <button
        type="button"
        className={`estop ${pressed ? 'down' : ''}`}
        aria-pressed={pressed}
        aria-label={pressed ? 'E-stop pressed: click to twist and release' : 'Press E-stop'}
        onClick={() => sim.setField(c.field, !pressed)}
      >
        <span className="estop-cap" />
      </button>
      <span className="legend">{pressed ? 'Twist to release' : c.label}</span>
    </div>
  );
}

function Slider({ sim, c }: { sim: Sim; c: Extract<Control, { kind: 'slider' }> }) {
  const v = Number(sim.field[c.field]);
  return (
    <label className="device slider">
      <span className="legend">
        {c.label} {Math.round(v)} {c.unit}
      </span>
      <input type="range" min={c.min} max={c.max} value={v} onChange={(e) => sim.setField(c.field, Number(e.target.value))} />
    </label>
  );
}

export function ControlStation({ sim, controls, indicators }: { sim: Sim; controls: Control[]; indicators: Indicator[] }) {
  return (
    <div className="station">
      <div className="station-row">
        {indicators.map((i) => {
          const on = sim.plc.mem.getBool(i.tag);
          return (
            <div className="device" key={i.tag}>
              <span className={`lamp tone-${i.tone} ${on ? 'on' : ''}`} role="img" aria-label={`${i.label} ${on ? 'on' : 'off'}`} />
              <span className="legend">{i.label}</span>
            </div>
          );
        })}
      </div>
      <div className="station-row">
        {controls.map((c) => {
          switch (c.kind) {
            case 'momentary': return <Momentary key={c.field} sim={sim} c={c} />;
            case 'toggle': return <Toggle key={c.field} sim={sim} c={c} />;
            case 'estop': return <EStop key={c.field} sim={sim} c={c} />;
            case 'slider': return <Slider key={c.field} sim={sim} c={c} />;
          }
        })}
      </div>
    </div>
  );
}

export function AlarmList({ sim, alarms }: { sim: Sim; alarms: AlarmDef[] }) {
  const active = alarms.filter((a) => sim.plc.mem.getBool(a.tag));
  return (
    <div className={`alarms ${active.length ? 'active' : ''}`} role="status" aria-live="polite">
      {active.length === 0 ? (
        <p className="alarms-none">No active alarms</p>
      ) : (
        <ul>
          {active.map((a) => (
            <li key={a.tag}>
              <span className="alarm-msg">{a.message}</span>
              <code>{a.tag}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FaultPanel({ sim, faults }: { sim: Sim; faults: FaultDef[] }) {
  return (
    <fieldset className="faults">
      <legend>Inject a fault</legend>
      {faults.map((f) => (
        <label key={f.id} className={`fault ${sim.faults.has(f.id) ? 'active' : ''}`}>
          <input type="checkbox" checked={sim.faults.has(f.id)} onChange={(e) => sim.setFault(f.id, e.target.checked)} />
          <span>
            <strong>{f.label}</strong>
            <small>{f.detail}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

const SPEEDS = [1, 2, 5, 10];

export function SimControls({ sim }: { sim: Sim }) {
  const secs = Math.floor(sim.time / 1000);
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  return (
    <div className="simbar">
      <div className="mode">
        <span className={`run-led ${sim.running ? 'on' : ''}`} />
        <span className="mode-text">{sim.running ? 'Run' : 'Program'}</span>
      </div>
      <button type="button" className="btn primary" onClick={() => (sim.running ? sim.stop() : sim.start())}>
        {sim.running ? 'Stop CPU' : 'Run CPU'}
      </button>
      <button type="button" className="btn" disabled={sim.running} onClick={() => sim.singleScan()} title="Execute one 10 ms scan">
        Single scan
      </button>
      <div className="speeds" role="group" aria-label="Simulation speed">
        {SPEEDS.map((s) => (
          <button key={s} type="button" className={`btn seg ${sim.speed === s ? 'active' : ''}`} aria-pressed={sim.speed === s} onClick={() => sim.setSpeed(s)}>
            x{s}
          </button>
        ))}
      </div>
      <button type="button" className="btn" onClick={() => sim.reset()} title="Clear memory and restart the machine">
        Reset
      </button>
      <span className="clock" title="Simulated time, scan count">
        {clock} <span className="muted">scan {sim.plc.scanCount}</span>
      </span>
    </div>
  );
}
