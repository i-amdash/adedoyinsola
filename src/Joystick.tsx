import { useRef, useState } from "react";

/**
 * Floating analog stick for touch screens. Reports x (right) and y (down), each -1..1,
 * so a light push walks or drives gently and a full push runs or floors it.
 */
export default function Joystick({ onMove, label }: { onMove: (x: number, y: number) => void; label: string }) {
  const base = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  function update(clientX: number, clientY: number) {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const radius = r.width / 2;
    let x = (clientX - (r.left + radius)) / radius;
    let y = (clientY - (r.top + radius)) / radius;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    setKnob({ x, y });
    onMove(x, y);
  }
  function release() {
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  }

  return (
    <div
      ref={base}
      className={`joystick${pointer.current !== null ? " is-active" : ""}`}
      role="application"
      aria-label={label}
      onPointerDown={(e) => {
        if (pointer.current !== null) return;
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.pointerId === pointer.current) update(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => e.pointerId === pointer.current && release()}
      onPointerCancel={(e) => e.pointerId === pointer.current && release()}
      onLostPointerCapture={(e) => e.pointerId === pointer.current && release()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="joystick-ring" />
      <span
        className="joystick-knob"
        style={{ transform: `translate(calc(-50% + ${knob.x} * var(--travel)), calc(-50% + ${knob.y} * var(--travel)))` }}
      />
    </div>
  );
}
