import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api, CREATE_NEW, SessionProvider, useSession, useTheme, type Theme } from "./lib";
import { Home } from "./pages/Home";

/**
 * Loads a page's code, retrying once and giving up after 20 s, so a stalled or missing chunk shows
 * the error screen with a reload button instead of "Loading…" forever.
 */
function page<P extends object>(load: () => Promise<{ default: React.ComponentType<P> }>) {
  const within = () => Promise.race([load(), new Promise<never>((_, no) => setTimeout(() => no(new Error("Page load timed out")), 20000))]);
  return lazy(() => within().catch(() => within()));
}
const Create = page(() => import("./pages/Create"));
const Catalog = page(() => import("./pages/Catalog"));
const Auth = page(() => import("./pages/Auth"));
const Account = page(() => import("./pages/Account"));
const Admin = page(() => import("./pages/Admin"));
const Terms = page(() => import("./pages/Terms"));
const Dilutions = page(() => import("./pages/Dilutions"));

const THEMES: { id: Theme; icon: string; label: string }[] = [
  { id: "light", icon: "☀", label: "Light theme" },
  { id: "system", icon: "◐", label: "Match my device" },
  { id: "dark", icon: "☾", label: "Dark theme" },
];

function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Colour theme">
      {THEMES.map((t) => <button key={t.id} type="button" role="radio" aria-checked={theme === t.id} className={theme === t.id ? "on" : ""} title={t.label} aria-label={t.label} onClick={() => setTheme(t.id)}>{t.icon}</button>)}
    </div>
  );
}

function Header() {
  const { user, setUser } = useSession();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  const logout = async () => {
    await api("/auth/logout", { body: {} }).catch(() => {});
    setUser(null);
    nav("/");
  };
  return (
    <header className="site-header">
      <Link to="/" className="brand" aria-label="Rhythm home">
        <svg viewBox="0 0 64 40" width="34" height="22" aria-hidden="true"><path d="M2 20c6 0 6-14 12-14s6 28 12 28 6-32 12-32 6 20 12 20 6-4 12-4" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /></svg>
        Rhythm
      </Link>
      <button className="menu-toggle" aria-expanded={open} aria-label="Menu" onClick={() => setOpen(!open)}>☰</button>
      <nav className={open ? "open" : ""}>
        <NavLink to="/create" state={CREATE_NEW}>Create</NavLink>
        <NavLink to="/notes">Notes</NavLink>
        <NavLink to="/accords">Accords</NavLink>
        {user && <NavLink to="/account">My formulas</NavLink>}
        {user && <NavLink to="/dilutions">My dilutions</NavLink>}
        {user?.role === "admin" && <NavLink to="/admin">Admin</NavLink>}
        {user ? <button className="link-btn" onClick={logout}>Sign out</button> : <NavLink to="/login" className="nav-cta">Sign in</NavLink>}
        <ThemeToggle />
      </nav>
    </header>
  );
}

const ACK_KEY = "rhythm.disclaimer.ack";
const readAck = () => { try { return localStorage.getItem(ACK_KEY) === "1"; } catch { return false; } };

/** The full disclaimer shows until acknowledged; the choice is saved to the account, or this browser before sign-in. */
function Footer() {
  const { user, setUser } = useSession();
  const [local, setLocal] = useState(readAck);
  const acked = local || !!user?.disclaimerAck;
  // An acknowledgement made before signing in carries over to the account.
  useEffect(() => {
    if (user && !user.disclaimerAck && local) api("/me/acknowledge-disclaimer", { body: {} }).then((r) => setUser(r.user)).catch(() => {});
  }, [user, local, setUser]);
  const acknowledge = () => {
    try { localStorage.setItem(ACK_KEY, "1"); } catch { /* Storage can be blocked; the account still records it. */ }
    setLocal(true);
  };
  if (acked) {
    return <footer className="site-footer compact"><p>© Rhythm · Formulas are owned by Rhythm · <Link to="/terms">Terms and disclaimer</Link></p></footer>;
  }
  return (
    <footer className="site-footer">
      <p><strong>All formulas created on Rhythm are owned by Rhythm and its owners.</strong> No user may claim any trademark, copyright or other right in them. <Link to="/terms">Read the terms and disclaimer</Link>.</p>
      <p>Performance figures are modelled estimates and IFRA values are indicative. Have any formula reviewed by a qualified professional before making or wearing it.</p>
      <button className="btn small" onClick={acknowledge}>I understand</button>
    </footer>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="narrow"><h1>Something went wrong</h1><p>Your draft is saved in this browser. Reload the page to continue; if a new version of Rhythm was just published, the reload picks it up.</p><button className="btn primary" onClick={() => location.reload()}>Reload</button></div>;
  }
}

export function App() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <SessionProvider>
      <Header />
      <main>
        <ErrorBoundary key={pathname}>
        <Suspense fallback={<div className="page-loading" role="status">Loading…</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/create" element={<Create />} />
            <Route path="/notes" element={<Catalog kind="notes" />} />
            <Route path="/notes/:id" element={<Catalog kind="notes" />} />
            <Route path="/accords" element={<Catalog kind="accords" />} />
            <Route path="/accords/:id" element={<Catalog kind="accords" />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/account" element={<Account />} />
            <Route path="/dilutions" element={<Dilutions />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="*" element={<div className="narrow"><h1>Page not found</h1><p><Link to="/">Back to Rhythm</Link></p></div>} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
    </SessionProvider>
  );
}
