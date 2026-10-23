import { useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Smartphone, Monitor, Layers } from "lucide-react";
import type { Project } from "./types";
function Artwork({ p, i }: { p: Project; i: number }) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const poster = p.poster && p.poster !== p.image ? p.poster : "";
  return (                              <div className={`project-art art-${i % 3}${poster ? " has-poster" : ""}${ready ? " is-ready" : ""}`}>
                                {p.image && !failed ? (
                                  <>
                                    {poster && <img className="project-poster" src={poster} decoding="async" alt="" aria-hidden="true" />}
                                    <img
                                      className="project-cover"
                                      src={p.image}
                                      decoding="async"
                                      alt={`${p.title} preview`}
                                      onLoad={() => setReady(true)}
                                      onError={() => setFailed(true)}
                                    />
                                  </>
                                ) : (
                                  <>
                                    <div className="project-visual">
                                      <span className="mock-top">
                                        {p.title.split(" ")[0].toLowerCase()}
                                        <i />
                                      </span>
                                      {i % 3 === 0 ? (
                                        <div className="phone-mock">
                                          <div className="phone-notch" />
                                          <small>
                                            Book. Pay.
                                            <br />
                                            Get on with your day.
                                          </small>
                                          <div className="mock-square">↗</div>
                                          <div className="mock-lines" />
                                        </div>
                                      ) : i % 3 === 1 ? (
                                        <div className="dashboard-mock">
                                          <div className="mock-sidebar" />
                                          <div className="mock-chart">
                                            <i />
                                            <i />
                                            <i />
                                            <i />
                                            <i />
                                          </div>
                                          <div className="mock-lines" />
                                        </div>
                                      ) : (
                                        <div className="shop-mock">
                                          <span>
                                            BROWSE.
                                            <br />
                                            <span className="heading-accent">FIND YOUR FIT.</span>
                                          </span>
                                          <div className="mock-shirt" />
                                        </div>
                                      )}
                                    </div>
                                    <span className="concept-label">
                                      ILLUSTRATIVE PROJECT COVER
                                    </span>
                                  </>
                                )}
                              </div>
);
}
export default function Projects({ projects, onContact }: { projects: Project[]; onContact: () => void }) {
  const [filter, setFilter] = useState("All"), [selected, setSelected] = useState<string | null>(null);
  const kind = (p: Project) => /mobile|flutter|react native/i.test(p.category + " " + p.stack.join(" ")) ? "Mobile" : "Web";
  const sorted = [...projects].sort((a, b) => Number(b.featured) - Number(a.featured));
  const filtered = sorted.filter(p => filter === "All" || kind(p) === filter);
  const index = Math.max(0, filtered.findIndex(p => p.id === selected));
  const project = filtered[index];
  return <div className="project-gallery">
    <div className="gallery-heading"><div><p className="eyebrow">Selected projects</p><h2>Ideas made real.<br /><span className="heading-accent">Built with purpose.</span></h2></div></div>
    <p className="panel-intro">Different businesses need different solutions. Explore my work across mobile apps, business platforms, and online stores, then let’s talk about what yours could become.</p>
    <div className="gallery-filters" aria-label="Filter projects">{["All", "Web", "Mobile"].map(f => <button key={f} aria-pressed={filter === f} onClick={() => {setFilter(f); setSelected(null);}}>{f === "Mobile" ? <Smartphone size={14}/> : f === "Web" ? <Monitor size={14}/> : <Layers size={14}/>} {f} <span>{sorted.filter(p => f === "All" || kind(p) === f).length}</span></button>)}</div>
    {project ? <>
      <article className="project-feature" key={project.id}>
        <Artwork key={project.image} p={project} i={sorted.findIndex(p => p.id === project.id)}/>
        <div className="project-story"><div className="project-meta"><p className="eyebrow">{project.category}</p>{project.featured && <span>SELECTED</span>}</div><h3>{project.title}</h3><p>{project.description}</p><p className="eyebrow stack-label">Built with</p><div className="tags">{project.stack.map(s => <span key={s}>{s}</span>)}</div><div className="project-actions">{project.url ? <a href={project.url} target="_blank" rel="noreferrer" className="primary-button">Visit live project <ArrowUpRight size={17}/></a> : <button className="primary-button" onClick={onContact}>Ask about this project <ArrowUpRight size={17}/></button>}<small>{project.url ? "Opens in a new tab" : "Contact me for more details"}</small></div></div>
      </article>
      <div className="gallery-pagination"><span>Browse projects</span><div><button className="round-button" aria-label="Previous project" disabled={filtered.length < 2} onClick={() => setSelected(filtered[(index-1+filtered.length)%filtered.length].id)}><ChevronLeft size={18}/></button><button className="round-button" aria-label="Next project" disabled={filtered.length < 2} onClick={() => setSelected(filtered[(index+1)%filtered.length].id)}><ChevronRight size={18}/></button></div></div>
      <div className="project-selector" aria-label="Choose project">{filtered.map((p) => <button key={p.id} aria-pressed={p.id === project.id} onClick={() => setSelected(p.id)}><strong>{p.title}<small>{p.category}</small></strong><ArrowUpRight size={17}/></button>)}</div>
      <div className="gallery-contact"><p>Have an idea of your own? Let’s bring it to life.</p><button className="text-button" onClick={onContact}>Start your project <ArrowUpRight size={16}/></button></div>
    </> : <p className="ranking-empty">No projects in this category yet.</p>}
  </div>;
}
