import { useEffect, useState } from "react";
import { ChevronDown, Download, Mail, MessageCircle, Phone, RefreshCw, Trash2 } from "lucide-react";
import { formatMoney } from "../shared/builder.mjs";
import { briefPdf } from "../shared/brief.mjs";
import type { Content } from "./types";

type Status = "new" | "contacted" | "won" | "lost" | "archived";
type Request = {
  id: string;
  reference: string;
  createdAt: string;
  status: Status;
  product: string;
  productName: string;
  estimate: { low: number; high: number; total: number; weeks: [number, number]; monthly: number; lines: { label: string; amount: number }[] };
  summary: [string, string][];
  contact: { name: string; email: string; phone?: string; company?: string; notes?: string };
};
const STATUSES: Status[] = ["new", "contacted", "won", "lost", "archived"];
const LABEL: Record<Status, string> = { new: "New", contacted: "Contacted", won: "Won", lost: "Lost", archived: "Archived" };

async function call(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = (r.headers.get("content-type") || "").includes("json") ? await r.json().catch(() => ({})) : {};
  if (!r.ok) throw new Error(data.error || "The server is busy. Please try again.");
  return data;
}

/** Project requests sent from /build: read them, track where each one stands, reply. */
export default function AdminRequests({ content }: { content: Content }) {
  const [rows, setRows] = useState<Request[] | null>(null),
    [filter, setFilter] = useState<Status | "open">("open"),
    [open, setOpen] = useState<string | null>(null),
    [confirm, setConfirm] = useState<string | null>(null),
    [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      setRows((await call("/api/admin/requests")).requests);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function setStatus(r: Request, status: Status) {
    const before = r.status;
    setRows((list) => list?.map((x) => (x.id === r.id ? { ...x, status } : x)) ?? null);
    try {
      await call("/api/admin/requests/status", { id: r.id, status });
    } catch (e) {
      setRows((list) => list?.map((x) => (x.id === r.id ? { ...x, status: before } : x)) ?? null);
      setError((e as Error).message);
    }
  }
  async function remove(id: string) {
    try {
      await call("/api/admin/requests/remove", { id });
      setRows((list) => list?.filter((x) => x.id !== id) ?? null);
      setConfirm(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function pdf(r: Request) {
    const product = content.builder.products.find((p) => p.id === r.product);
    const bytes = briefPdf({ ...r, tagline: product?.tagline, usdRate: content.builder.usdRate, owner: { name: content.profile.name, email: content.profile.email } });
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `brief-${r.reference}.pdf` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const shown = rows?.filter((r) => (filter === "open" ? r.status === "new" || r.status === "contacted" : r.status === filter)) ?? [];
  const count = (s: Status | "open") => rows?.filter((r) => (s === "open" ? r.status === "new" || r.status === "contacted" : r.status === s)).length ?? 0;
  const money = (n: number) => formatMoney(n, "NGN");
  return (
    <div className="requests">
      <p className="admin-hint">
        Briefs sent from your project builder at <a href="/build" target="_blank" rel="noreferrer">/build</a>. Prices were calculated on the server from your price list at the time of the request.
      </p>
      <div className="requests-filters" role="group" aria-label="Filter requests">
        {(["open", ...STATUSES] as (Status | "open")[]).map((s) => (
          <button key={s} type="button" className={filter === s ? "active" : ""} onClick={() => setFilter(s)}>
            {s === "open" ? "Open" : LABEL[s]} <small>{count(s)}</small>
          </button>
        ))}
        <button type="button" className="text-button" onClick={() => void load()} aria-label="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!rows && !error && <p className="admin-hint">Loading requests…</p>}
      {rows && !shown.length && <p className="admin-hint">{rows.length ? "Nothing in this list." : "No requests yet. Share yoursite/build with clients to start receiving briefs."}</p>}
      <ul className="requests-list">
        {shown.map((r) => {
          const c = r.contact;
          const phone = (c.phone || "").replace(/[^\d+]/g, "");
          const wa = phone.replace(/^\+/, "").replace(/^0/, "234");
          return (
            <li key={r.id} className={`request status-${r.status}`}>
              <button type="button" className="request-head" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                <span>
                  <strong>
                    {c.name}
                    {c.company ? ` · ${c.company}` : ""}
                  </strong>
                  <small>
                    {r.productName} · {r.reference} · {new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </small>
                </span>
                <b>
                  {money(r.estimate.low)} – {money(r.estimate.high)}
                </b>
                <em className={`request-status s-${r.status}`}>{LABEL[r.status]}</em>
                <ChevronDown size={16} />
              </button>
              {open === r.id && (
                <div className="request-body">
                  <div className="request-actions">
                    <a className="secondary-button" href={`mailto:${c.email}?subject=${encodeURIComponent(`Your ${r.productName.toLowerCase()} project (${r.reference})`)}`}>
                      <Mail size={15} /> {c.email}
                    </a>
                    {phone && (
                      <>
                        <a className="secondary-button" href={`tel:${phone}`}>
                          <Phone size={15} /> {c.phone}
                        </a>
                        <a className="secondary-button" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
                          <MessageCircle size={15} /> WhatsApp
                        </a>
                      </>
                    )}
                    <button type="button" className="secondary-button" onClick={() => pdf(r)}>
                      <Download size={15} /> PDF brief
                    </button>
                  </div>
                  <label className="request-status-select">
                    Status
                    <select value={r.status} onChange={(e) => void setStatus(r, e.target.value as Status)}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {c.notes && <blockquote>{c.notes}</blockquote>}
                  <dl>
                    {r.summary.map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                    <div>
                      <dt>Timeline</dt>
                      <dd>
                        {r.estimate.weeks[0]}–{r.estimate.weeks[1]} weeks{r.estimate.monthly ? ` · +${money(r.estimate.monthly)}/month` : ""}
                      </dd>
                    </div>
                  </dl>
                  {confirm === r.id ? (
                    <span className="request-delete">
                      <button type="button" className="danger-button" onClick={() => void remove(r.id)}>
                        Delete for good
                      </button>
                      <button type="button" className="text-button" onClick={() => setConfirm(null)}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="text-button request-delete" onClick={() => setConfirm(r.id)}>
                      <Trash2 size={14} /> Delete request
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
