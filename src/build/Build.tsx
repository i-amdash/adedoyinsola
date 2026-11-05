import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, Download, Eye, Globe, LayoutDashboard, Loader2, Minus, Plus, ShoppingBag, Smartphone, Sparkles } from "lucide-react";
import { defaultAnswers, defaultBuilder, estimate, formatMoney, stepsFor, suggested, cleanAnswers, describe, type Answers, type Catalog, type Currency, type Option, type Question } from "../../shared/builder.mjs";
import { briefPdf } from "../../shared/brief.mjs";
import { seed as fallbackContent } from "../../server/seed.mjs";
import type { Content } from "../types";
import Preview from "./Preview";
import "./build.css";

type Contact = { name: string; email: string; phone: string; company: string; notes: string };
type Draft = { product: string | null; answers: Record<string, Answers>; contact: Contact; step: number; currency: Currency };
type Sent = { reference: string; createdAt: string; estimate: { low: number; high: number; total: number; weeks: [number, number]; monthly: number; lines: { label: string; amount: number }[] }; summary: [string, string][]; emailed: boolean };
const KEY = "build-draft-v1";
const emptyContact: Contact = { name: "", email: "", phone: "", company: "", notes: "" };
const ICONS: Record<string, React.ReactNode> = { website: <Globe size={22} />, store: <ShoppingBag size={22} />, platform: <LayoutDashboard size={22} />, mobile: <Smartphone size={22} /> };
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function loadDraft(): Draft {
  const fresh: Draft = { product: null, answers: {}, contact: emptyContact, step: 0, currency: "NGN" };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || typeof raw !== "object") return fresh;
    return {
      product: typeof raw.product === "string" ? raw.product : null,
      answers: raw.answers && typeof raw.answers === "object" ? raw.answers : {},
      contact: { ...emptyContact, ...(raw.contact && typeof raw.contact === "object" ? raw.contact : {}) },
      step: Number.isInteger(raw.step) ? raw.step : 0,
      currency: raw.currency === "USD" ? "USD" : "NGN",
    };
  } catch {
    return fresh;
  }
}

/** Smoothly count from the previous value to the new one. */
function useTween(value: number, ms = 520) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    if (reduced()) {
      current.current = value;
      setShown(value);
      return;
    }
    const from = current.current,
      start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms),
        e = 1 - Math.pow(1 - t, 3);
      current.current = from + (value - from) * e;
      setShown(current.current);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

function priceTag(o: Option, currency: Currency, rate: number) {
  const parts: string[] = [];
  if (o.price) parts.push("+" + formatMoney(o.price, currency, rate));
  if (o.monthly) parts.push(formatMoney(o.monthly, currency, rate) + "/mo");
  if (o.multiplier && o.multiplier !== 1) parts.push(`+${Math.round((o.multiplier - 1) * 100)}%`);
  return parts.join(" · ") || "Included";
}

function QuestionField({ q, value, onChange, currency, rate }: { q: Question; value: Answers[string]; onChange: (v: Answers[string]) => void; currency: Currency; rate: number }) {
  const options = (q.options || []).filter((o) => o.enabled !== false);
  if (q.type === "count") {
    const n = Number(value) || q.min || 1,
      min = q.min ?? 1,
      max = q.max ?? 99;
    const extra = Math.max(0, n - (q.included ?? 0));
    return (
      <fieldset className="bq">
        <legend>{q.label}</legend>
        {q.help && <p className="bq-help">{q.help}</p>}
        <div className="bq-count">
          <button type="button" aria-label="Fewer" disabled={n <= min} onClick={() => onChange(n - 1)}>
            <Minus size={16} />
          </button>
          <output aria-live="polite">
            <b>{n}</b> {q.unit || "item"}
            {n === 1 ? "" : "s"}
          </output>
          <button type="button" aria-label="More" disabled={n >= max} onClick={() => onChange(n + 1)}>
            <Plus size={16} />
          </button>
          <input type="range" min={min} max={Math.min(max, 30)} value={Math.min(n, 30)} aria-label={q.label} onChange={(e) => onChange(Number(e.target.value))} />
        </div>
        <p className="bq-note">
          {q.included ? `${q.included} included` : ""}
          {q.unitPrice ? ` · ${formatMoney(q.unitPrice, currency, rate)} per extra ${q.unit || "item"}` : ""}
          {extra > 0 && q.unitPrice ? <strong> · +{formatMoney(extra * q.unitPrice, currency, rate)}</strong> : null}
        </p>
      </fieldset>
    );
  }
  const multi = q.type === "multi";
  const chosen = multi ? (Array.isArray(value) ? value : []) : [value];
  return (
    <fieldset className="bq">
      <legend>
        {q.label}
        {multi && <small>Choose any</small>}
      </legend>
      {q.help && <p className="bq-help">{q.help}</p>}
      <div className={`bq-options${multi ? " is-multi" : ""}`} role={multi ? "group" : "radiogroup"} aria-label={q.label}>
        {options.map((o) => {
          const on = chosen.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              role={multi ? "checkbox" : "radio"}
              aria-checked={on}
              className={on ? "is-on" : ""}
              onClick={() => {
                if (!multi) return onChange(o.id);
                const list = chosen as string[];
                onChange(on ? list.filter((x) => x !== o.id) : [...list, o.id]);
              }}
            >
              <i className="bq-mark">{on && <Check size={12} strokeWidth={3} />}</i>
              <span>{o.label}</span>
              <small>{priceTag(o, currency, rate)}</small>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function downloadBrief(content: Content, catalog: Catalog, product: string, answers: Answers, contact: Contact, sent: Sent | null) {
  const p = catalog.products.find((x) => x.id === product);
  const e = sent?.estimate || estimate(catalog, product, answers);
  if (!p || !e) return;
  const bytes = briefPdf({
    reference: sent?.reference || "DRAFT",
    createdAt: sent?.createdAt || new Date().toISOString(),
    productName: p.name,
    tagline: p.tagline,
    estimate: e,
    summary: sent?.summary || describe(catalog, product, cleanAnswers(catalog, product, answers)),
    contact,
    usdRate: catalog.usdRate,
    owner: { name: content.profile.name, email: content.profile.email },
  });
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `project-brief-${sent?.reference || p.id}.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default function Build() {
  const [content, setContent] = useState<Content | null>(null);
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);
  const [sheet, setSheet] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const top = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement>(null);
  const stageVisible = useRef(true);
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    document.title = "Build your project — Adedoyinsola";
    let alive = true;
    fetch("/api/content", { signal: AbortSignal.timeout?.(8000) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((c: Content) => alive && setContent(c))
      .catch(() => alive && setContent(fallbackContent));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(draft));
    } catch {
      /* private mode: the draft just isn't remembered */
    }
  }, [draft]);

  const catalog: Catalog = content?.builder?.products?.length ? content.builder : defaultBuilder;
  const products = catalog.products.filter((p) => p.enabled);
  const product = products.find((p) => p.id === draft.product) || null;
  const steps = product ? stepsFor(catalog, product.id) : [];
  const stepCount = steps.length + 2;
  const step = Math.min(draft.step, product ? stepCount - 1 : 0);
  const answers = useMemo(() => (product ? cleanAnswers(catalog, product.id, draft.answers[product.id] || defaultAnswers(catalog, product.id)) : {}), [catalog, product, draft.answers]);
  const quote = product ? estimate(catalog, product.id, answers) : null;
  const answerKey = JSON.stringify(answers);
  // On phones the preview scrolls out of sight; a dot on the "preview" button says it changed.
  useEffect(() => {
    if (!stageVisible.current) setFresh(true);
  }, [answerKey]);
  useEffect(() => {
    const el = stage.current;
    if (!el || typeof IntersectionObserver !== "function") return;
    const io = new IntersectionObserver(([e]) => {
      stageVisible.current = e.isIntersecting;
      if (e.isIntersecting) setFresh(false);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [product?.id, sent]);
  const low = useTween(quote?.low || 0),
    high = useTween(quote?.high || 0);
  const rate = catalog.usdRate;
  const money = (n: number) => formatMoney(n, draft.currency, rate);
  const fromPrice = (id: string) => estimate(catalog, id, {})?.low || 0;

  const go = (n: number) => {
    setDraft((d) => ({ ...d, step: n }));
    setError("");
    requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" }));
  };
  const setAnswer = (id: string, value: Answers[string]) => {
    if (!product) return;
    setDraft((d) => {
      const current = { ...(d.answers[product.id] || defaultAnswers(catalog, product.id)), [id]: value };
      // Picking an app type pre-fills a typical setup the first time, e.g. a restaurant gets
      // a POS, rider app and kitchen screen. Everything stays editable.
      const preset = suggested[`${product.id}:${id}=${value}`];
      const untouched = !Array.isArray(current.pieces) || (current.pieces as string[]).length === 0;
      if (preset && untouched && (!Array.isArray(current.features) || (current.features as string[]).length === 0)) Object.assign(current, structuredClone(preset));
      return { ...d, answers: { ...d.answers, [product.id]: current } };
    });
  };
  const preset = product ? suggested[`${product.id}:type=${answers.type}`] : undefined;
  const presetApplied = preset && Object.entries(preset).every(([k, v]) => (v as string[]).every((x) => (answers[k] as string[] | undefined)?.includes(x)));
  const setContact = (k: keyof Contact, v: string) => setDraft((d) => ({ ...d, contact: { ...d.contact, [k]: v } }));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!product || sending) return;
    const form = new FormData(e.currentTarget);
    setSending(true);
    setError("");
    try {
      const r = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: product.id, answers, contact: draft.contact, website: String(form.get("website") || "") }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Couldn't send your request. Please try again.");
      setSent(body);
      requestAnimationFrame(() => top.current?.scrollIntoView({ block: "start" }));
    } catch (err) {
      setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "You seem to be offline. Your answers are saved, try again in a moment.");
    } finally {
      setSending(false);
    }
  }
  function startOver() {
    setSent(null);
    setDraft((d) => ({ ...d, product: null, step: 0, answers: {} }));
  }

  const estimateCard = quote && (
    <aside className={`b-estimate${sheet ? " is-open" : ""}`} aria-label="Your estimate">
      <div className="b-estimate-head">
        <small>Estimated investment</small>
        <div className="b-currency" role="group" aria-label="Currency">
          {(["NGN", "USD"] as Currency[]).map((c) => (
            <button key={c} type="button" aria-pressed={draft.currency === c} onClick={() => setDraft((d) => ({ ...d, currency: c }))}>
              {c === "NGN" ? "₦" : "$"}
            </button>
          ))}
        </div>
      </div>
      <p className="b-range" aria-live="polite">
        {money(low)} <span>–</span> {money(high)}
      </p>
      <div className="b-facts">
        <span>
          <b>
            {quote.weeks[0]}–{quote.weeks[1]}
          </b>{" "}
          weeks
        </span>
        {quote.monthly > 0 && (
          <span>
            <b>+{money(quote.monthly)}</b>/month after launch
          </span>
        )}
      </div>
      <button type="button" className="b-breakdown-toggle" aria-expanded={sheet} onClick={() => setSheet((s) => !s)}>
        {sheet ? "Hide" : "See"} the breakdown <ChevronDown size={14} />
      </button>
      <ul className="b-lines">
        {quote.lines.map((l, i) => (
          <li key={l.label + i}>
            <span>{l.label}</span>
            <b>{money(l.amount)}</b>
          </li>
        ))}
      </ul>
      <p className="b-fine">An estimate from your answers, not a fixed quote. {draft.currency === "USD" ? `Converted at ₦${rate.toLocaleString()}/$; I bill in naira.` : "I confirm the final price after a short call."}</p>
      <button type="button" className="b-pdf" onClick={() => content && product && downloadBrief(content, catalog, product.id, answers, draft.contact, sent)}>
        <Download size={14} /> Download PDF brief
      </button>
    </aside>
  );

  if (!content)
    return (
      <main className="b-page b-loading">
        <Loader2 className="b-spin" /> Loading the project builder…
      </main>
    );

  return (
    <main className={`b-page${product ? " has-product" : ""}`}>
      <header className="b-top" ref={top}>
        <a href="/" className="b-brand" aria-label="Back to the homepage">
          a<span>.</span>
        </a>
        <div className="b-title">
          <small>Project builder</small>
          <strong>{product ? product.name : "What are we building?"}</strong>
        </div>
        <a className="b-back" href="/">
          <ArrowLeft size={14} /> <span>Back to the world</span>
        </a>
      </header>

      {sent && product ? (
        <section className="b-done">
          <div className="b-done-mark">
            <Check size={28} strokeWidth={3} />
          </div>
          <p className="b-eyebrow">Request sent · {sent.reference}</p>
          <h1>
            Thank you, {draft.contact.name.split(" ")[0]}.
            <br />
            <span>Let’s build it.</span>
          </h1>
          <p className="b-lead">
            I’ve received your {product.name.toLowerCase()} brief. I’ll reply to <b>{draft.contact.email}</b> within one working day with questions and a fixed quote. Your estimate: <b>{formatMoney(sent.estimate.low, draft.currency, rate)} – {formatMoney(sent.estimate.high, draft.currency, rate)}</b>, about {sent.estimate.weeks[0]}–{sent.estimate.weeks[1]} weeks.
          </p>
          <div className="b-done-actions">
            <button className="b-primary" onClick={() => downloadBrief(content, catalog, product.id, answers, draft.contact, sent)}>
              <Download size={16} /> Download your PDF brief
            </button>
            <a className="b-secondary" href={`mailto:${content.profile.email}?subject=${encodeURIComponent(`Project ${sent.reference}`)}`}>
              Email me directly <ArrowUpRight size={15} />
            </a>
          </div>
          <div className="b-done-links">
            <a href="/">Back to the world</a>
            <button onClick={startOver}>Configure another project</button>
          </div>
        </section>
      ) : !product ? (
        <section className="b-intro">
          <p className="b-eyebrow">
            <Sparkles size={13} /> Shape it, see it, price it
          </p>
          <h1>
            Design your project.
            <br />
            <span>Watch it come together.</span>
          </h1>
          <p className="b-lead">Answer a few questions. The preview and the price update as you go, and you can send me the brief when it looks right.</p>
          <div className="b-products">
            {products.map((p, i) => (
              <button
                key={p.id}
                className="b-product"
                style={{ animationDelay: `${i * 70}ms` }}
                onClick={() => setDraft((d) => ({ ...d, product: p.id, step: 1 }))}
              >
                <span className="b-product-icon">{ICONS[p.id] || <Sparkles size={22} />}</span>
                <strong>{p.name}</strong>
                <span>{p.tagline}</span>
                <small>
                  From <b>{formatMoney(fromPrice(p.id), draft.currency, rate)}</b> · {p.weeks[0]}–{p.weeks[1]} weeks
                </small>
                <ul>
                  {p.includes.slice(0, 3).map((x) => (
                    <li key={x}>
                      <Check size={12} /> {x}
                    </li>
                  ))}
                </ul>
                <i className="b-product-go">
                  <ArrowRight size={16} />
                </i>
              </button>
            ))}
          </div>
          {draft.product && <p className="b-resume">Your earlier answers are saved on this device.</p>}
        </section>
      ) : (
        <div className="b-workspace">
          <section className="b-form">
            <ol className="b-progress" aria-label="Steps">
              <li>
                <button onClick={() => go(0)}>Type</button>
              </li>
              {steps.map((s, i) => (
                <li key={s.id} className={step === i + 1 ? "is-on" : step > i + 1 ? "is-done" : ""}>
                  <button onClick={() => go(i + 1)} aria-current={step === i + 1 ? "step" : undefined}>
                    {s.title}
                  </button>
                </li>
              ))}
              <li className={step === stepCount - 1 ? "is-on" : ""}>
                <button onClick={() => go(stepCount - 1)} aria-current={step === stepCount - 1 ? "step" : undefined}>
                  Send
                </button>
              </li>
            </ol>
            {step === 0 ? (
              <div className="b-step" key="type">
                <h2>Pick a different project type</h2>
                <div className="b-products is-compact">
                  {products.map((p) => (
                    <button key={p.id} className={`b-product${p.id === product.id ? " is-on" : ""}`} onClick={() => setDraft((d) => ({ ...d, product: p.id, step: 1 }))}>
                      <span className="b-product-icon">{ICONS[p.id] || <Sparkles size={22} />}</span>
                      <strong>{p.name}</strong>
                      <small>From {formatMoney(fromPrice(p.id), draft.currency, rate)}</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : step < stepCount - 1 ? (
              <div className="b-step" key={steps[step - 1].id}>
                <p className="b-step-count">
                  Step {step} of {stepCount - 1}
                </p>
                <h2>{steps[step - 1].title}</h2>
                {step === 1 && (
                  <p className="b-included">
                    Always included: {product.includes.join(" · ")}
                  </p>
                )}
                {steps[step - 1].questions.map((q) => (
                  <QuestionField key={q.id} q={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} currency={draft.currency} rate={rate} />
                ))}
                {preset && !presetApplied && steps[step - 1].questions.some((q) => q.id === "type" || q.id === "pieces") && (
                  <button
                    type="button"
                    className="b-suggest"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        answers: {
                          ...d.answers,
                          [product.id]: Object.fromEntries(
                            Object.entries({ ...answers, ...preset }).map(([k, v]) => [k, Array.isArray(v) ? [...new Set([...((answers[k] as string[]) || []), ...v])] : v]),
                          ) as Answers,
                        },
                      }))
                    }
                  >
                    <Sparkles size={14} /> Add the usual setup for this kind of app
                  </button>
                )}
                <div className="b-nav">
                  <button type="button" className="b-secondary" onClick={() => go(step - 1)}>
                    <ArrowLeft size={15} /> Back
                  </button>
                  <button type="button" className="b-primary" onClick={() => go(step + 1)}>
                    {step === stepCount - 2 ? "Review & send" : "Next"} <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            ) : (
              <form className="b-step b-details" key="send" onSubmit={submit}>
                <p className="b-step-count">Last step</p>
                <h2>Where should I send your quote?</h2>
                <p className="b-help">I’ll review your brief and reply within one working day. No spam, no obligation.</p>
                <div className="b-fields">
                  <label>
                    Your name
                    <input required minLength={2} maxLength={80} autoComplete="name" value={draft.contact.name} onChange={(e) => setContact("name", e.target.value)} />
                  </label>
                  <label>
                    Email
                    <input required type="email" maxLength={200} autoComplete="email" value={draft.contact.email} onChange={(e) => setContact("email", e.target.value)} />
                  </label>
                  <label>
                    Phone or WhatsApp <small>optional</small>
                    <input type="tel" maxLength={30} autoComplete="tel" value={draft.contact.phone} onChange={(e) => setContact("phone", e.target.value)} />
                  </label>
                  <label>
                    Business name <small>optional</small>
                    <input maxLength={100} autoComplete="organization" value={draft.contact.company} onChange={(e) => setContact("company", e.target.value)} />
                  </label>
                  <label className="is-wide">
                    Anything else I should know? <small>optional</small>
                    <textarea rows={4} maxLength={2000} placeholder="Your goals, examples you like, deadlines…" value={draft.contact.notes} onChange={(e) => setContact("notes", e.target.value)} />
                  </label>
                  <label className="b-trap" aria-hidden="true">
                    Website
                    <input name="website" tabIndex={-1} autoComplete="off" />
                  </label>
                </div>
                <div className="b-summary">
                  <p className="b-step-count">Your brief</p>
                  <dl>
                    {describe(catalog, product.id, answers).map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                {error && (
                  <p className="b-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="b-nav">
                  <button type="button" className="b-secondary" onClick={() => go(step - 1)}>
                    <ArrowLeft size={15} /> Back
                  </button>
                  <button type="submit" className="b-primary" disabled={sending}>
                    {sending ? <Loader2 size={15} className="b-spin" /> : null}
                    {sending ? "Sending…" : "Send my request"} {!sending && <ArrowUpRight size={15} />}
                  </button>
                </div>
              </form>
            )}
          </section>
          <section ref={stage} className={`b-stage${previewOpen ? "" : " is-closed"}`} aria-label="Live preview">
            <div className="b-stage-head">
              <span>
                <i className="b-live" /> Live preview
              </span>
              <button type="button" className="b-stage-toggle" aria-expanded={previewOpen} onClick={() => setPreviewOpen((v) => !v)}>
                {previewOpen ? "Hide" : "Show"}
              </button>
            </div>
            <div className="b-preview">
              <Preview product={product.id} kind={product.kind} answers={answers} />
            </div>
            {estimateCard}
          </section>
        </div>
      )}
      {product && !sent && quote && (
        <div className="b-mobilebar">
          <button
            type="button"
            className={`b-peek${fresh ? " is-fresh" : ""}`}
            aria-label="See the live preview"
            onClick={() => {
              setPreviewOpen(true);
              setSheet(false);
              top.current?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth" });
            }}
          >
            <Eye size={17} />
          </button>
          <button type="button" className="b-total" onClick={() => setSheet((s) => !s)} aria-expanded={sheet}>
            <small>Estimate · {quote.weeks[0]}–{quote.weeks[1]} weeks</small>
            <b>
              {money(low)} – {money(high)}
            </b>
          </button>
          <div className="b-currency" role="group" aria-label="Currency">
            {(["NGN", "USD"] as Currency[]).map((c) => (
              <button key={c} type="button" aria-pressed={draft.currency === c} onClick={() => setDraft((d) => ({ ...d, currency: c }))}>
                {c === "NGN" ? "₦" : "$"}
              </button>
            ))}
          </div>
        </div>
      )}
      {sheet && <button className="b-scrim" aria-label="Close the breakdown" onClick={() => setSheet(false)} />}
    </main>
  );
}
