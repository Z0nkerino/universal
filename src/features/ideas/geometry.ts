export type Box = { x: number; y: number; w: number; h: number };
/** Connects two cards edge to edge (sides when they're side by side, top/bottom when stacked). */
export function linkPath(a: Box, b: Box) {
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;
  const dx = bcx - acx;
  const dy = bcy - acy;
  if (Math.abs(dx) > Math.abs(dy) * 1.2) {
    const s = Math.sign(dx);
    const ax = acx + (s * a.w) / 2;
    const bx = bcx - (s * b.w) / 2;
    const mx = (ax + bx) / 2;
    return { d: `M ${ax} ${acy} C ${mx} ${acy}, ${mx} ${bcy}, ${bx} ${bcy}`, mid: { x: mx, y: (acy + bcy) / 2 } };
  }
  const s = Math.sign(dy) || 1;
  const ay = acy + (s * a.h) / 2;
  const by = bcy - (s * b.h) / 2;
  const my = (ay + by) / 2;
  return { d: `M ${acx} ${ay} C ${acx} ${my}, ${bcx} ${my}, ${bcx} ${by}`, mid: { x: (acx + bcx) / 2, y: my } };
}
