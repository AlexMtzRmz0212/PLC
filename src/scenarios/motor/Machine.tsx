import type { Sim } from '../../plant/sim';
import type { MotorState } from './logic';

export function MotorMachine({ sim }: { sim: Sim }) {
  const s = sim.plant.state as MotorState;
  const k1 = s.contactor;
  const blades = [0, 90, 180, 270];
  return (
    <svg viewBox="0 0 360 170" className="machine" role="img" aria-label={`Motor ${Math.round(s.speed * 100)} percent speed, ${s.current.toFixed(1)} amps`}>
      {/* Supply, contactor, overload, motor in one line diagram */}
      <text x="12" y="20" className="m-lbl">3~ 400 V</text>
      <line x1="40" y1="30" x2="40" y2="58" className={`m-line ${k1 ? 'live' : ''}`} />
      <g transform="translate(22 58)">
        <rect width="36" height="30" rx="3" className={`m-dev ${k1 ? 'on' : ''}`} />
        <text x="18" y="20" textAnchor="middle" className="m-dev-t">K1</text>
      </g>
      <line x1="40" y1="88" x2="40" y2="104" className={`m-line ${k1 ? 'live' : ''}`} />
      <g transform="translate(22 104)">
        <rect width="36" height="26" rx="3" className={`m-dev ${s.olTripped ? 'trip' : ''}`} />
        <text x="18" y="17" textAnchor="middle" className="m-dev-t">F1</text>
      </g>
      <rect x="66" y="108" width="40" height="6" rx="2" className="m-bar-bg" />
      <rect x="66" y="108" width={40 * s.olHeat} height="6" rx="2" className={`m-bar ${s.olHeat > 0.7 ? 'hot' : ''}`} />
      <text x="66" y="126" className="m-lbl">thermal</text>
      <line x1="40" y1="130" x2="40" y2="148" className={`m-line ${k1 && !s.olTripped ? 'live' : ''}`} />
      <line x1="40" y1="148" x2="150" y2="148" className={`m-line ${k1 && !s.olTripped ? 'live' : ''}`} />

      {/* Motor body with cooling fins and a fan you can see turning */}
      <g transform="translate(150 70)">
        <rect x="0" y="0" width="110" height="80" rx="8" className="m-body" />
        {[14, 30, 46, 62].map((y) => (
          <line key={y} x1="10" x2="100" y1={y} y2={y} className="m-fin" />
        ))}
        <rect x="110" y="34" width="34" height="12" className="m-shaft" />
        <g transform={`translate(176 40) rotate(${s.angle})`}>
          <circle r="30" className="m-fan-ring" />
          {blades.map((a) => (
            <path key={a} d="M0 0 L26 -6 A27 27 0 0 1 26 6 Z" transform={`rotate(${a})`} className="m-blade" />
          ))}
          <circle r="5" className="m-hub" />
        </g>
        <text x="55" y="100" textAnchor="middle" className="m-lbl">M1</text>
      </g>

      {/* Readouts */}
      <g transform="translate(150 14)">
        <text className="m-read-l">Speed</text>
        <text y="22" className="m-read">{Math.round(s.speed * 1480)} rpm</text>
        <text x="110" className="m-read-l">Current</text>
        <text x="110" y="22" className={`m-read ${s.current > 12 ? 'warn' : ''}`}>{s.current.toFixed(1)} A</text>
      </g>
    </svg>
  );
}
