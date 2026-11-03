import { useEffect, useState } from "react";
import { Search, Trash2 } from "lucide-react";

type Row = { id: string; username: string; scores?: number };

/** Find a player by username and remove them (their scores leave every leaderboard). */
export default function PlayerModeration() {
  const [q, setQ] = useState(""),
    [rows, setRows] = useState<Row[] | null>(null),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  async function load(query = q) {
    setError("");
    try {
      const r = await fetch(`/api/admin/players?q=${encodeURIComponent(query.trim())}`);
      const data = (r.headers.get("content-type") || "").includes("json") ? await r.json() : {};
      if (!r.ok) throw new Error(data.error || "Couldn’t load players.");
      setRows(data.players);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load("");
  }, []);
  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/players/remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = (r.headers.get("content-type") || "").includes("json") ? await r.json() : {};
      if (!r.ok) throw new Error(data.error || "Couldn’t remove that player.");
      setRows((list) => list?.filter((p) => p.id !== id) ?? null);
      setConfirm(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="moderation">
      <p className="admin-hint">Remove offensive or spam usernames. Their scores disappear from every leaderboard. This can’t be undone.</p>
      <div className="moderation-search">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void load();
            }
          }}
          placeholder="Search usernames"
          maxLength={24}
          aria-label="Search usernames"
        />
        <button type="button" className="text-button" onClick={() => void load()}>
          <Search size={15} /> Search
        </button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {rows && !rows.length && <p className="admin-hint">No players found.</p>}
      <ul className="moderation-list">
        {rows?.map((p) => (
          <li key={p.id}>
            <strong>{p.username}</strong>
            {p.scores !== undefined && <small>{p.scores} saved results</small>}
            {confirm === p.id ? (
              <span>
                <button type="button" className="danger-button" disabled={busy} onClick={() => void remove(p.id)}>Remove for good</button>
                <button type="button" className="text-button" onClick={() => setConfirm(null)}>Cancel</button>
              </span>
            ) : (
              <button type="button" className="text-button" onClick={() => setConfirm(p.id)}>
                <Trash2 size={14} /> Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
