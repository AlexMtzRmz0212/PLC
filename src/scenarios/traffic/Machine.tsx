import type { Sim } from '../../plant/sim';
import type { TrafficState } from './logic';

function Lamp({ cx, cy, on, tone, broken }: { cx: number; cy: number; on: boolean; tone: string; broken?: boolean }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="15" className={`t-lamp ${tone} ${on ? 'on' : ''}`} />
      {broken && <path d={`M${cx - 7} ${cy - 7} l14 14 M${cx + 7} ${cy - 7} l-14 14`} className="t-broken" />}
    </g>
  );
}

export function TrafficMachine({ sim }: { sim: Sim }) {
  const s = sim.plant.state as TrafficState;
  return (
    <svg viewBox="0 0 360 180" className="machine" role="img" aria-label="Traffic signal and pedestrian signal">
      {/* Road with crossing */}
      <rect x="0" y="120" width="360" height="54" className="t-road" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={150 + i * 12} y="124" width="7" height="46" className="t-zebra" />
      ))}

      {/* Vehicle signal */}
      <rect x="40" y="10" width="44" height="110" rx="6" className="t-head" />
      <Lamp cx={62} cy={32} on={s.carRed} tone="red" broken={!s.redBulbOk} />
      <Lamp cx={62} cy={65} on={s.carAmber} tone="amber" />
      <Lamp cx={62} cy={98} on={s.carGreen} tone="green" />
      <text x="62" y="170" textAnchor="middle" className="m-lbl t-on-road">Vehicles</text>

      {/* Pedestrian signal */}
      <rect x="250" y="22" width="60" height="78" rx="6" className="t-head" />
      <g transform="translate(280 44)" className={`t-ped red ${s.dontWalk ? 'on' : ''}`}>
        <rect x="-10" y="-12" width="20" height="24" rx="3" />
        <text y="5" textAnchor="middle" className="t-ped-t">Stop</text>
      </g>
      <g transform="translate(280 78)" className={`t-ped green ${s.walk ? 'on' : ''}`}>
        <rect x="-10" y="-12" width="20" height="24" rx="3" />
        <text y="5" textAnchor="middle" className="t-ped-t">Walk</text>
      </g>
      <g transform="translate(322 66)">
        <rect x="-8" y="-14" width="22" height="34" rx="3" className="t-box" />
        <circle cx="3" cy="-3" r="5" className={`t-wait ${s.wait ? 'on' : ''}`} />
        <circle cx="3" cy="11" r="4" className="t-btn" />
      </g>
      <text x="290" y="114" textAnchor="middle" className="m-lbl">Pedestrians</text>
    </svg>
  );
}
