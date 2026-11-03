/** Controls the static loader shipped in index.html so it appears before any JavaScript runs. */
const el = () => document.getElementById("boot");
const shownAt = performance.now();
let finished = false;

export function bootProgress(p: number, label?: string) {
  const boot = el();
  if (!boot || finished) return;
  const v = Math.max(0, Math.min(1, p));
  boot.style.setProperty("--p", String(v));
  const pct = document.getElementById("boot-pct");
  if (pct) pct.textContent = `${Math.round(v * 100)}%`;
  const text = document.getElementById("boot-label");
  if (text && label) text.textContent = label;
}

/** Plays the exit (curtain opens) and calls back once the page underneath should animate in. */
export function bootFinish(onReveal: () => void) {
  if (finished) return;
  finished = true;
  const boot = el();
  if (!boot) return onReveal();
  const wait = Math.max(0, 900 - (performance.now() - shownAt));
  setTimeout(() => {
    boot.style.setProperty("--p", "1");
    const pct = document.getElementById("boot-pct");
    if (pct) pct.textContent = "100%";
    setTimeout(() => {
      boot.classList.add("is-done");
      boot.setAttribute("aria-busy", "false");
      setTimeout(onReveal, 280);
      setTimeout(() => boot.remove(), 1100);
    }, 260);
  }, wait);
}

export function bootRemove() {
  finished = true;
  el()?.remove();
}
