import type { Sim } from '../../plant/sim';
import { type ConveyorState, LAYOUT } from './logic';

const X0 = 16;
const SPAN = 328; // px for 0..100
const BELT_Y = 104;
const px = (x: number) => X0 + (x / 100) * SPAN;

export function ConveyorMachine({ sim }: { sim: Sim }) {
  const s = sim.plant.state as ConveyorState;
  const io = sim.plc.mem;
  const eyes = [
    { at: LAYOUT.entry, tag: 'PE_Entry', label: 'Entry', high: false },
    { at: LAYOUT.height, tag: 'PE_Height', label: 'Height', high: true },
    { at: LAYOUT.divert, tag: 'PE_Divert', label: 'Divert', high: false },
  ];
  // Belt texture offset so motion is visible.
  const offset = ((sim.time / 1000) * 22 * s.speed * (SPAN / 100)) % 16;
  const pushX = px(LAYOUT.divert);
  return (
    <svg viewBox="0 0 360 190" className="machine" role="img" aria-label={`Conveyor, ${s.boxes.length} boxes on the belt`}>
      {/* Reject lane (above the belt, boxes are pushed up into it) */}
      <rect x={pushX - 22} y="14" width="44" height="54" className="c-lane" />
      <text x={pushX} y="10" textAnchor="middle" className="m-lbl">Reject {s.rejected}</text>

      {/* Belt */}
      <rect x={X0} y={BELT_Y} width={SPAN} height="16" rx="8" className="c-belt" />
      <line x1={X0 + 8} x2={X0 + SPAN - 8} y1={BELT_Y + 8} y2={BELT_Y + 8} className="c-belt-tex" strokeDashoffset={-offset} />
      <circle cx={X0 + 8} cy={BELT_Y + 8} r="6" className="c-roller" />
      <circle cx={X0 + SPAN - 8} cy={BELT_Y + 8} r="6" className="c-roller" />
      <text x={X0 + SPAN} y={BELT_Y + 34} textAnchor="end" className="m-lbl">Good {s.delivered}</text>

      {/* Photo-eyes: emitter post, beam, reflector */}
      {eyes.map((e) => {
        const x = px(e.at);
        const blocked = io.getBool(e.tag);
        const beamY = e.high ? BELT_Y - 24 : BELT_Y - 8;
        return (
          <g key={e.tag}>
            <line x1={x} x2={x} y1={beamY - 6} y2={beamY + 6} className={`c-beam ${blocked ? 'blocked' : ''}`} />
            <circle cx={x} cy={beamY} r="3.5" className={`c-eye ${blocked ? 'blocked' : ''}`} />
            <text x={x} y={beamY - 10} textAnchor="middle" className="m-lbl">{e.label}</text>
          </g>
        );
      })}

      {/* Pusher, below the belt, strokes upward */}
      <rect x={pushX - 16} y={BELT_Y + 18 - s.pusher * 20} width="32" height="8" className={`c-pusher ${io.getBool('Divert_Sol') ? 'on' : ''}`} />
      <rect x={pushX - 3} y={BELT_Y + 26 - s.pusher * 20} width="6" height={22} className="c-rod" />

      {/* Boxes */}
      {s.boxes.map((b) => {
        const h = b.tall ? 30 : 16;
        const w = (LAYOUT.boxHalf * 2 * SPAN) / 100 - 2;
        const y = BELT_Y - h - b.push * 50;
        return <rect key={b.id} x={px(b.x) - w / 2} y={y} width={w} height={h} rx="2" className={`c-box ${b.tall ? 'tall' : ''}`} />;
      })}

      <text x={X0} y="182" className="m-lbl">Batch {io.getNum('Batch_CTR.ACC')} / {io.getNum('Batch_CTR.PRE')}</text>
    </svg>
  );
}
