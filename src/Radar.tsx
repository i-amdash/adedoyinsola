import { useEffect, useRef } from "react";
import type { World } from "./world/World";
import { avenues, streets } from "./world/roads";
import { destinations } from "./types";

// A rotating, camera-aligned radar in the spirit of open-world games: roads, buildings,
// destination blips clamped to the edge, and the GPS route drawn on top.
export default function Radar({
  world,
  onOpen,
}: {
  world: React.RefObject<World | null>;
  onOpen: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    let zoom = 1.7;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvas.current,
        w = world.current;
      if (!c) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const dpr = Math.min(devicePixelRatio, 2);
      const W = c.clientWidth,
        H = c.clientHeight;
      if (c.width !== Math.round(W * dpr)) {
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#1a2520";
      ctx.fillRect(0, 0, W, H);
      const active = !!w?.active;
      const f = w ? (active ? w.focus : { x: 0, z: 40 }) : { x: 0, z: 40 };
      const view = w && active ? w.camHeading + w.orbit : 0;
      const speed = w && w.mode === "drive" ? w.velocity.length() : 0;
      zoom += ((active ? 1.85 - Math.min(0.75, speed * 0.025) : 0.9) - zoom) * 0.05;
      const cx = W / 2,
        cy = H * 0.62;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(view);
      ctx.scale(zoom, zoom);
      ctx.translate(-f.x, -f.z);
      // Ground and roads.
      ctx.fillStyle = "#2b3b31";
      ctx.fillRect(-140, -200, 260, 345);
      ctx.strokeStyle = "#6f7d73";
      ctx.lineCap = "butt";
      for (const a of avenues) {
        ctx.lineWidth = a.width;
        ctx.beginPath();
        ctx.moveTo(a.x, a.from);
        ctx.lineTo(a.x, a.to);
        ctx.stroke();
      }
      for (const s of streets) {
        ctx.lineWidth = s.width;
        ctx.beginPath();
        ctx.moveTo(s.from, s.z);
        ctx.lineTo(s.to, s.z);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 0.6;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(0, -185);
      ctx.lineTo(0, 135);
      ctx.stroke();
      ctx.setLineDash([]);
      if (w) {
        ctx.fillStyle = "#56645a";
        for (const b of w.colliders) {
          const bw = b.max.x - b.min.x,
            bd = b.max.z - b.min.z;
          if (bw < 1 || bd < 1) continue;
          ctx.fillRect(b.min.x, b.min.z, bw, bd);
        }
        // GPS route.
        if (w.routePoints.length > 1) {
          ctx.strokeStyle = "#b892ff";
          ctx.lineWidth = 3.4 / zoom + 2.2;
          ctx.lineJoin = "round";
          ctx.beginPath();
          w.routePoints.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)));
          ctx.stroke();
        }
        if ((w.race === "running" || w.race === "countdown")) {
          ctx.strokeStyle = "#e4ff9a";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(f.x, f.z);
          ctx.lineTo(w.gate.position.x, w.gate.position.z);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (w.mode === "walk") {
          ctx.save();
          ctx.translate(w.position.x, w.position.z);
          ctx.rotate(-w.yaw);
          ctx.fillStyle = "#9fd4ff";
          ctx.fillRect(-1.6, -2.6, 3.2, 5.2);
          ctx.restore();
        }
      }
      ctx.restore();
      // Destination blips, clamped to the radar edge.
      const rot = (x: number, z: number) => {
        const dx = (x - f.x) * zoom,
          dz = (z - f.z) * zoom;
        const c0 = Math.cos(view),
          s0 = Math.sin(view);
        return [cx + dx * c0 - dz * s0, cy + dx * s0 + dz * c0];
      };
      const pad = 11;
      for (const d of destinations) {
        let [x, y] = rot(d.x, d.z);
        const out = x < pad || x > W - pad || y < pad || y > H - pad;
        x = Math.min(W - pad, Math.max(pad, x));
        y = Math.min(H - pad, Math.max(pad, y));
        const target = w?.waypoint === d.id;
        ctx.beginPath();
        ctx.arc(x, y, out ? 6.5 : 8, 0, Math.PI * 2);
        ctx.fillStyle = d.color;
        ctx.fill();
        ctx.lineWidth = target ? 2.5 : 1.5;
        ctx.strokeStyle = target ? "#ffffff" : "#0e1612";
        ctx.stroke();
        ctx.fillStyle = "#0e1612";
        ctx.font = "700 8px 'DM Sans', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(d.symbol, x, y + 0.5);
      }
      // North marker on the rim.
      const nx = cx + Math.sin(-view) * -999,
        ny = cy - Math.cos(-view) * 999;
      const t = Math.min(
        Math.abs((nx > cx ? W - 10 - cx : 10 - cx) / (nx - cx || 1)),
        Math.abs((ny > cy ? H - 10 - cy : 10 - cy) / (ny - cy || 1)),
      );
      const north = [cx + (nx - cx) * t, cy + (ny - cy) * t];
      ctx.fillStyle = "rgba(10,16,13,0.85)";
      ctx.beginPath();
      ctx.arc(north[0], north[1], 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e9eedf";
      ctx.font = "700 8px 'DM Sans', sans-serif";
      ctx.fillText("N", north[0], north[1] + 0.5);
      // Player arrow.
      const heading = w && active ? (w.mode === "walk" ? w.walkYaw : w.yaw) : 0;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(view - heading);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#0e1612";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(6, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-6, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [world]);
  return (
    <button className="radar" onClick={onOpen} aria-label="Open the map">
      <canvas ref={canvas} />
    </button>
  );
}
