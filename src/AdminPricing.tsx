import { RotateCcw } from "lucide-react";
import { defaultBuilder, estimate, defaultAnswers, formatMoney, type Catalog, type Option, type Question, type Step } from "../shared/builder.mjs";

const num = (v: string, int = true) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? (int ? Math.round(n) : n) : 0;
};

/**
 * The price list behind /build. Questions and options are fixed by the code; here you set
 * what each one costs, how long it adds, and whether visitors can pick it.
 */
export default function AdminPricing({ builder, onChange }: { builder: Catalog; onChange: (fn: (b: Catalog) => void) => void }) {
  const opt = (o: Option, path: (b: Catalog) => Option) => (
    <div className={`pricing-option${o.enabled === false ? " is-off" : ""}`} key={o.id}>
      <label className="pricing-check" title="Offer this option">
        <input type="checkbox" checked={o.enabled !== false} onChange={(e) => onChange((b) => void (path(b).enabled = e.target.checked))} />
      </label>
      <input aria-label="Option label" value={o.label} maxLength={140} onChange={(e) => onChange((b) => void (path(b).label = e.target.value))} />
      <label>
        <span>₦ price</span>
        <input type="number" min={0} step={5000} value={o.price} onChange={(e) => onChange((b) => void (path(b).price = num(e.target.value)))} />
      </label>
      <label>
        <span>+ weeks</span>
        <input type="number" min={0} max={52} step={0.5} value={o.weeks ?? 0} onChange={(e) => onChange((b) => void (path(b).weeks = num(e.target.value, false)))} />
      </label>
      <label>
        <span>₦ / month</span>
        <input type="number" min={0} step={5000} value={o.monthly ?? 0} onChange={(e) => onChange((b) => void (path(b).monthly = num(e.target.value)))} />
      </label>
    </div>
  );
  const question = (q: Question, path: (b: Catalog) => Question) => (
    <div className="pricing-question" key={q.id}>
      <p>{q.label}</p>
      {q.type === "count" ? (
        <div className="pricing-option">
          <span />
          <span className="pricing-unit">Per extra {q.unit || "item"}</span>
          <label>
            <span>Included</span>
            <input type="number" min={0} max={1000} value={q.included ?? 0} onChange={(e) => onChange((b) => void (path(b).included = num(e.target.value)))} />
          </label>
          <label>
            <span>₦ each</span>
            <input type="number" min={0} step={5000} value={q.unitPrice ?? 0} onChange={(e) => onChange((b) => void (path(b).unitPrice = num(e.target.value)))} />
          </label>
          <label>
            <span>+ weeks each</span>
            <input type="number" min={0} max={10} step={0.1} value={q.unitWeeks ?? 0} onChange={(e) => onChange((b) => void (path(b).unitWeeks = num(e.target.value, false)))} />
          </label>
        </div>
      ) : (
        q.options?.map((o, k) => opt(o, (b) => path(b).options![k]))
      )}
    </div>
  );
  const steps = (list: Step[], path: (b: Catalog) => Step[]) =>
    list.map((s, i) => (
      <div key={s.id} className="pricing-step">
        <h4>{s.title}</h4>
        {s.questions.map((q, j) => question(q, (b) => path(b)[i].questions[j]))}
      </div>
    ));
  return (
    <div className="pricing">
      <p className="admin-hint">
        Your draft prices are in naira. Visitors see a range of ±{Math.round(builder.spread * 100)}% around the total, and the $ toggle converts at your rate. Save changes to publish them to <a href="/build" target="_blank" rel="noreferrer">/build</a>.
      </p>
      <div className="pricing-globals">
        <label className="admin-field">
          <span>Naira per US dollar</span>
          <input type="number" min={1} max={100000} value={builder.usdRate} onChange={(e) => onChange((b) => void (b.usdRate = Math.max(1, num(e.target.value))))} />
        </label>
        <label className="admin-field">
          <span>Estimate range (± %)</span>
          <input type="number" min={0} max={50} value={Math.round(builder.spread * 100)} onChange={(e) => onChange((b) => void (b.spread = Math.min(50, num(e.target.value)) / 100))} />
        </label>
        <button type="button" className="text-button" onClick={() => confirm("Replace every price with the original draft list?") && onChange((b) => Object.assign(b, structuredClone(defaultBuilder)))}>
          <RotateCcw size={14} /> Reset to the draft list
        </button>
      </div>
      {builder.products.map((p, i) => {
        const e = estimate(builder, p.id, defaultAnswers(builder, p.id));
        return (
          <details key={p.id} className="admin-project pricing-product">
            <summary>
              <strong>{p.name}</strong>
              <small>
                {p.enabled ? `From ${e ? formatMoney(e.low) : "–"}` : "Hidden from visitors"}
              </small>
            </summary>
            <div className="pricing-head">
              <label className="admin-field pricing-toggle">
                <span>Offer this project type</span>
                <input type="checkbox" checked={p.enabled} onChange={(ev) => onChange((b) => void (b.products[i].enabled = ev.target.checked))} />
              </label>
              <label className="admin-field">
                <span>Name</span>
                <input value={p.name} maxLength={80} onChange={(ev) => onChange((b) => void (b.products[i].name = ev.target.value))} />
              </label>
              <label className="admin-field is-wide">
                <span>Short description</span>
                <input value={p.tagline} maxLength={200} onChange={(ev) => onChange((b) => void (b.products[i].tagline = ev.target.value))} />
              </label>
              <label className="admin-field">
                <span>Base price (₦)</span>
                <input type="number" min={0} step={10000} value={p.base} onChange={(ev) => onChange((b) => void (b.products[i].base = num(ev.target.value)))} />
              </label>
              <label className="admin-field">
                <span>Base timeline (weeks)</span>
                <span className="pricing-weeks">
                  <input type="number" min={0} max={104} aria-label="Minimum weeks" value={p.weeks[0]} onChange={(ev) => onChange((b) => void (b.products[i].weeks[0] = num(ev.target.value, false)))} />
                  <input type="number" min={0} max={104} aria-label="Maximum weeks" value={p.weeks[1]} onChange={(ev) => onChange((b) => void (b.products[i].weeks[1] = num(ev.target.value, false)))} />
                </span>
              </label>
              <label className="admin-field is-wide">
                <span>What’s always included (one per line)</span>
                <textarea rows={3} value={p.includes.join("\n")} onChange={(ev) => onChange((b) => void (b.products[i].includes = ev.target.value.split("\n").map((x) => x.trimStart()).filter((x, k, all) => x || k === all.length - 1).slice(0, 10)))} />
              </label>
            </div>
            {steps(p.steps, (b) => b.products[i].steps)}
          </details>
        );
      })}
      <details className="admin-project pricing-product">
        <summary>
          <strong>Every project</strong>
          <small>Brand, content, hosting, care plans, rush delivery</small>
        </summary>
        {steps(builder.finishing, (b) => b.finishing)}
      </details>
    </div>
  );
}
