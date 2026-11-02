import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api, SessionProvider, useSession } from "./lib";
import { Home } from "./pages/Home";

const Create = lazy(() => import("./pages/Create"));
const Catalog = lazy(() => import("./pages/Catalog"));
const Auth = lazy(() => import("./pages/Auth"));
const Account = lazy(() => import("./pages/Account"));
const Admin = lazy(() => import("./pages/Admin"));
const Terms = lazy(() => import("./pages/Terms"));

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
        <NavLink to="/create">Create</NavLink>
        <NavLink to="/notes">Notes</NavLink>
        <NavLink to="/accords">Accords</NavLink>
        {user && <NavLink to="/account">My formulas</NavLink>}
        {user?.role === "admin" && <NavLink to="/admin">Admin</NavLink>}
        {user ? <button className="link-btn" onClick={logout}>Sign out</button> : <NavLink to="/login" className="nav-cta">Sign in</NavLink>}
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <p><strong>All formulas created on Rhythm are owned by Rhythm and its owners.</strong> No user may claim any trademark, copyright or other right in them. <Link to="/terms">Read the terms and disclaimer</Link>.</p>
      <p>Performance figures are modelled estimates and IFRA values are indicative. Have any formula reviewed by a qualified professional before making or wearing it.</p>
    </footer>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="narrow"><h1>Something went wrong</h1><p>Your draft is saved in this browser. Reload the page to continue.</p><button className="btn primary" onClick={() => location.reload()}>Reload</button></div>;
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
