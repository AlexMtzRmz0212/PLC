import type { Sim } from '../../plant/sim';
import type { TankState } from './logic';

const TOP = 26;
const BOTTOM = 166;
const ly = (pct: number) => BOTTOM - ((BOTTOM - TOP) * pct) / 100;

function Pump({ x, run, label }: { x: number; run: number; label: string }) {
  return (
    <g transform={`translate(${x} 150)`}>
      <circle r="14" className={`p-body ${run > 0.5 ? 'on' : ''}`} />
      <path d="M-6 -7 L8 0 L-6 7 Z" className="p-arrow" transform="rotate(-90)" />
      <text y="30" textAnchor="middle" className="m-lbl">{label}</text>
    </g>
  );
}

export function TankMachine({ sim }: { sim: Sim }) {
  const s = sim.plant.state as TankState;
  const io = sim.plc.mem;
  const lt = io.getNum('Level_Raw');
  const ltBroken = lt > 29000;
  const inflow = Number(sim.field.inflow);
  return (
    <svg viewBox="0 0 360 200" className="machine" role="img" aria-label={`Sump level ${s.level.toFixed(0)} percent`}>
      {/* Inflow pipe */}
      <rect x="20" y="18" width="110" height="10" className="k-pipe" />
      {inflow > 0 && <rect x="122" y="28" width="8" height={BOTTOM - 28 - ((BOTTOM - TOP) * s.level) / 100} className="k-stream" opacity={0.3 + inflow / 140} />}
      <text x="20" y="12" className="m-lbl">Inflow {inflow} %</text>

      {/* Tank */}
      <rect x="110" y={TOP} width="120" height={BOTTOM - TOP} className="k-tank" />
      <rect x="111" y={ly(s.level)} width="118" height={BOTTOM - ly(s.level)} className="k-water" />
      {[30, 50, 70, 85].map((p) => (
        <g key={p}>
          <line x1="230" x2="238" y1={ly(p)} y2={ly(p)} className="k-tick" />
          <text x="241" y={ly(p) + 3} className="m-lbl">{p}</text>
        </g>
      ))}

      {/* Float switch */}
      <line x1="114" x2="124" y1={ly(92)} y2={ly(92)} className="k-tick" />
      <circle cx="128" cy={ly(92)} r="4" className={`k-float ${io.getBool('LSHH_Float') ? 'on' : ''}`} />
      <text x="106" y={ly(92) + 3} textAnchor="end" className="m-lbl">LSHH</text>

      {/* Level transmitter */}
      <g transform="translate(176 14)">
        <rect x="-18" y="-10" width="36" height="16" rx="3" className={`k-lt ${ltBroken ? 'bad' : ''}`} />
        <text y="2" textAnchor="middle" className="m-dev-t">LT</text>
      </g>
      <text x="300" y="40" textAnchor="middle" className="m-read">{ltBroken ? '----' : `${io.getNum('Level_Pct').toFixed(1)} %`}</text>
      <text x="300" y="56" textAnchor="middle" className="m-lbl">raw {lt}</text>

      {/* Pumps */}
      <Pump x={276} run={s.p1} label="P1" />
      <Pump x={326} run={s.p2} label="P2" />
      <path d={`M230 ${BOTTOM - 6} H326 V136`} className="k-pipe-line" />
      <path d="M276 136 V150" className="k-pipe-line" />
    </svg>
  );
}
