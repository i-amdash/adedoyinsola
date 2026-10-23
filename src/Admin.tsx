import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Save,
  LogOut,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  LoaderCircle,
} from "lucide-react";
import ProjectCoverEditor from "./ProjectCoverEditor";
import type { Content, Project } from "./types";
async function request(url: string, options?: RequestInit) {
  const r = await fetch(url, options);
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.details?.join("; ") || data.error || "Request failed");
  return data;
}
export default function Admin() {
  const [loading, setLoading] = useState(true),
    [authenticated, setAuthenticated] = useState(false),
    [configured, setConfigured] = useState(true),
    [password, setPassword] = useState(""),
    [content, setContent] = useState<Content | null>(null),
    [tab, setTab] = useState("Profile"),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [dirty, setDirty] = useState(false),
    [remove, setRemove] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([request("/api/auth/session"), request("/api/content")])
      .then(([session, data]) => {
        setAuthenticated(session.authenticated);
        setConfigured(session.configured);
        setContent(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty || uploading) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, uploading]);
  const edit = (fn: (c: Content) => Content) => {
    setContent((c) => (c ? fn(c) : c));
    setDirty(true);
    setMessage("");
  };
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      setAuthenticated(true);
      setPassword("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (uploading || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await request("/api/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content),
      });
      setContent(data);
      setDirty(false);
      setMessage("Changes saved. Your portfolio is up to date.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (dirty) {
      setError(
        "Save your changes before signing out, or reload to discard them.",
      );
      return;
    }
    try {
      await request("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      setAuthenticated(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function field(
    label: string,
    value: string,
    onChange: (v: string) => void,
    multiline = false,
    type = "text",
  ) {
    return (
      <label className="admin-field">
        <span>{label}</span>
        {multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            required
          />
        ) : (
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={!["url"].includes(type)}
          />
        )}
      </label>
    );
  }
  function updateProject(id: string, key: keyof Project, value: unknown) {
    edit((c) => ({
      ...c,
      projects: c.projects.map((p) =>
        p.id === id ? { ...p, [key]: value } : p,
      ),
    }));
  }
  if (loading)
    return (
      <main className="admin-loading">
        <LoaderCircle className="spin" /> Opening the studio…
      </main>
    );
  return (
    <main className="admin-app">
      <header className="admin-header">
        <a className="brand" href="/">
          <span className="brand-mark">
            a<span>.</span>
          </span>
          <span className="brand-name">
            CONTENT STUDIO<span>ADEDOYINSOLA’S WORLD</span>
          </span>
        </a>
        <a href="/" target="_blank" rel="noreferrer">
          View portfolio
          <ArrowUpRight size={16} />
        </a>
      </header>
      {!authenticated ? (
        <section className="login-card">
          <p className="eyebrow">Portfolio admin</p>
          <h1>
            Behind
            <br />
            <span className="heading-accent">the scenes.</span>
          </h1>
          <p>
            Manage your projects, profile, and the details that make this world
            yours.
          </p>
          {!configured ? (
            <div className="setup-note">
              <h3>Set up your admin account</h3>
              <p>Open a terminal in the portfolio folder and run:</p>
              <code>npm run admin:setup</code>
              <p>
                Choose a password, restart the server, then reload this page.
              </p>
              <button
                className="secondary-button"
                onClick={() => location.reload()}
              >
                Reload
              </button>
            </div>
          ) : (
            <form onSubmit={login}>
              <label className="admin-field">
                <span>Admin password</span>
                <input
                  autoFocus
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <button className="primary-button" disabled={busy}>
                {busy ? "Signing in…" : "Enter the studio"}
                <ArrowUpRight size={18} />
              </button>
            </form>
          )}
          {error && (
            <p className="admin-alert error" role="alert">
              <AlertCircle size={18} />
              {error}
            </p>
          )}
        </section>
      ) : (
        <div className="admin-layout">
          <aside className="admin-sidebar">
            <p className="eyebrow">YOUR CONTENT</p>
            {["Profile", "Projects", "World", "Services"].map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
                <ArrowUpRight size={15} />
              </button>
            ))}
            <div className="admin-sidebar-bottom">
              <span className="live-dot" /> All content saved on your server.
              <button onClick={logout} disabled={uploading}>
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          </aside>
          {content && (
            <form className="admin-editor" onSubmit={save}>
              <div className="editor-heading">
                <div>
                  <p className="eyebrow">MAKE IT YOURS</p>
                  <h1>
                    {tab}
                    <span>.</span>
                  </h1>
                </div>
                <button className="primary-button" disabled={busy || uploading || !dirty}>
                  <Save size={16} />
                  {busy ? "Saving…" : dirty ? "Save changes" : "Up to date"}
                </button>
              </div>
              {error && (
                <div className="admin-alert error" role="alert">
                  <AlertCircle size={18} />
                  <span>{error}</span>
                </div>
              )}
              {message && (
                <div className="admin-alert success" role="status">
                  <Check size={18} />
                  {message}
                </div>
              )}
              {tab === "Profile" && (
                <>
                  <p className="editor-description">
                    Your public profile. These details appear in your
                    studio, contact panel, and homepage.
                  </p>
                  <div className="admin-grid">
                    {field("Full name", content.profile.name, (v) =>
                      edit((c) => ({
                        ...c,
                        profile: { ...c.profile, name: v },
                      })),
                    )}
                    {field("Role", content.profile.role, (v) =>
                      edit((c) => ({
                        ...c,
                        profile: { ...c.profile, role: v },
                      })),
                    )}
                    {field(
                      "Email",
                      content.profile.email,
                      (v) =>
                        edit((c) => ({
                          ...c,
                          profile: { ...c.profile, email: v },
                        })),
                      false,
                      "email",
                    )}
                    {field("Availability", content.profile.availability, (v) =>
                      edit((c) => ({
                        ...c,
                        profile: { ...c.profile, availability: v },
                      })),
                    )}
                  </div>
                  {field("Tagline", content.profile.tagline, (v) =>
                    edit((c) => ({
                      ...c,
                      profile: { ...c.profile, tagline: v },
                    })),
                  )}
                  {field(
                    "About you",
                    content.profile.bio,
                    (v) =>
                      edit((c) => ({
                        ...c,
                        profile: { ...c.profile, bio: v },
                      })),
                    true,
                  )}
                  {field(
                    "Skills (comma separated)",
                    content.profile.skills.join(", "),
                    (v) =>
                      edit((c) => ({
                        ...c,
                        profile: {
                          ...c.profile,
                          skills: v.split(",").map((s) => s.trim()),
                        },
                      })),
                  )}
                  <div className="admin-grid">
                    {field(
                      "GitHub URL",
                      content.profile.github,
                      (v) =>
                        edit((c) => ({
                          ...c,
                          profile: { ...c.profile, github: v },
                        })),
                      false,
                      "url",
                    )}
                    {field(
                      "LinkedIn URL",
                      content.profile.linkedin,
                      (v) =>
                        edit((c) => ({
                          ...c,
                          profile: { ...c.profile, linkedin: v },
                        })),
                      false,
                      "url",
                    )}
                  </div>
                </>
              )}
              {tab === "Projects" && (
                <>
                  <p className="editor-description">
                    Show your work at its best. Upload project screenshots or animated
                    GIFs, then save your changes. Featured projects appear first.
                  </p>
                  {content.projects.map((p) => (
                    <section className="admin-project" key={p.id}>
                      <div className="admin-project-heading">
                        <span>{p.title || "Untitled project"}</span>
                        {remove === p.id ? (
                          <div className="delete-confirm">
                            <span>Remove this project?</span>
                            <button
                              type="button"
                              disabled={uploading}
                              onClick={() => {
                                edit((c) => ({
                                  ...c,
                                  projects: c.projects.filter(
                                    (x) => x.id !== p.id,
                                  ),
                                }));
                                setRemove(null);
                              }}
                            >
                              Remove
                            </button>
                            <button
                              type="button"
                              onClick={() => setRemove(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={uploading}
                            className="delete-button"
                            aria-label={`Remove ${p.title}`}
                            onClick={() => setRemove(p.id)}
                          >
                            <Trash2 size={17} />
                          </button>
                        )}
                      </div>
                      <div className="admin-grid">
                        {field("Title", p.title, (v) =>
                          updateProject(p.id, "title", v),
                        )}
                        {field("Category", p.category, (v) =>
                          updateProject(p.id, "category", v),
                        )}
                      </div>
                      {field(
                        "Description",
                        p.description,
                        (v) => updateProject(p.id, "description", v),
                        true,
                      )}
                      {field(
                        "Technologies (comma separated)",
                        p.stack.join(", "),
                        (v) =>
                          updateProject(
                            p.id,
                            "stack",
                            v.split(",").map((s) => s.trim()),
                          ),
                      )}
                      {field("Live URL (optional)", p.url, (v) => updateProject(p.id, "url", v), false, "url")}
                      <ProjectCoverEditor key={`${p.id}-${content.revision}`} title={p.title || "Untitled project"} image={p.image} disabled={busy || uploading} onBusy={setUploading} onChange={(url) => updateProject(p.id, "image", url)}/>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={p.featured}
                          onChange={(e) =>
                            updateProject(p.id, "featured", e.target.checked)
                          }
                        />
                        Feature this project
                      </label>
                    </section>
                  ))}
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      edit((c) => ({
                        ...c,
                        projects: [
                          ...c.projects,
                          {
                            id: crypto.randomUUID(),
                            title: "New project",
                            category: "Web application",
                            description: "Describe your project.",
                            stack: ["React"],
                            url: "",
                            image: "",
                            featured: false,
                          },
                        ],
                      }))
                    }
                  >
                    <Plus size={17} />
                    Add project
                  </button>
                </>
              )}
              {tab === "World" && (
                <>
                  <p className="editor-description">
                    The welcome screen and identity of your city. Use a line
                    break to split the headline across two lines.
                  </p>
                  {field("Welcome label", content.world.welcome, (v) =>
                    edit((c) => ({ ...c, world: { ...c.world, welcome: v } })),
                  )}
                  {field(
                    "Main headline",
                    content.world.title,
                    (v) =>
                      edit((c) => ({ ...c, world: { ...c.world, title: v } })),
                    true,
                  )}
                  {field(
                    "Introduction",
                    content.world.subtitle,
                    (v) =>
                      edit((c) => ({
                        ...c,
                        world: { ...c.world, subtitle: v },
                      })),
                    true,
                  )}
                  {field("District name", content.world.district, (v) =>
                    edit((c) => ({ ...c, world: { ...c.world, district: v } })),
                  )}
                  {field(
                    "Accent color",
                    content.world.accent,
                    (v) =>
                      edit((c) => ({ ...c, world: { ...c.world, accent: v } })),
                    false,
                    "color",
                  )}
                </>
              )}
              {tab === "Services" && (
                <>
                  <p className="editor-description">
                    Help clients find the right service for their idea. These appear in About me.
                  </p>
                  {content.services.map((s, i) => (
                    <section className="admin-project" key={i}>
                      {field("Service title", s.title, (v) =>
                        edit((c) => ({
                          ...c,
                          services: c.services.map((x, j) =>
                            j === i ? { ...x, title: v } : x,
                          ),
                        })),
                      )}
                      {field(
                        "Description",
                        s.description,
                        (v) =>
                          edit((c) => ({
                            ...c,
                            services: c.services.map((x, j) =>
                              j === i ? { ...x, description: v } : x,
                            ),
                          })),
                        true,
                      )}
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          edit((c) => ({
                            ...c,
                            services: c.services.filter((_, j) => j !== i),
                          }))
                        }
                      >
                        <Trash2 size={15} />
                        Remove service
                      </button>
                    </section>
                  ))}
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      edit((c) => ({
                        ...c,
                        services: [
                          ...c.services,
                          {
                            title: "New service",
                            description: "Describe your service.",
                          },
                        ],
                      }))
                    }
                  >
                    <Plus size={17} />
                    Add service
                  </button>
                </>
              )}
              <p className="editor-footnote">
                {dirty ? "You have unsaved changes." : "All changes saved."} ·
                Content revision {content.revision}
              </p>
            </form>
          )}
        </div>
      )}
    </main>
  );
}
