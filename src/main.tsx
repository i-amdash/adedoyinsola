import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import { bootRemove } from "./boot";

// Visitors never download the admin studio; it loads only on /admin.
const Admin = lazy(() => import("./Admin"));
// The project builder is its own light page: no 3D world is loaded there.
const Build = lazy(() => import("./build/Build"));
const isAdmin = location.pathname.startsWith("/admin");
const isBuild = /^\/build\/?$/.test(location.pathname);
if (isAdmin || isBuild) bootRemove();

/** If anything throws while rendering, show a calm fallback instead of a blank page. */
class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("Page error", error);
    bootRemove();
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="error-screen">
        <h1>Something went wrong.</h1>
        <p>Please reload the page. If it keeps happening, you can still reach me at the email below.</p>
        <p>
          <a href="mailto:ashimidoyin@yahoo.com">ashimidoyin@yahoo.com</a>
        </p>
        <button onClick={() => location.reload()}>Reload</button>
      </main>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Boundary>
      {isAdmin ? (
        <Suspense fallback={<main className="admin-loading">Loading the studio…</main>}>
          <Admin />
        </Suspense>
      ) : isBuild ? (
        <Suspense fallback={<main className="admin-loading">Loading the project builder…</main>}>
          <Build />
        </Suspense>
      ) : (
        <App />
      )}
    </Boundary>
  </React.StrictMode>,
);
