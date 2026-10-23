import { useEffect, useState } from "react";
export default function Celebration() {
  const [visible, setVisible] = useState(true);
  useEffect(() => { const timer = setTimeout(() => setVisible(false), 2400); return () => clearTimeout(timer); }, []);
  if (!visible) return null;
  return <div className="confetti" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ "--x": `${(i * 37 % 100)}%`, "--drift": `${(i % 2 ? 1 : -1) * (15 + i * 3)}px`, "--delay": `${i % 7 * 0.045}s`, "--turn": `${i * 63}deg`, background: ["#b4db73", "#cf9352", "#a79ecb", "#6ba899"][i % 4] } as React.CSSProperties} />)}</div>;
}
