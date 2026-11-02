import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Bottle } from "../components/Bottle";
import { api, useSession } from "../lib";

type Row = { id: string; name: string; score: number; noteCount: number; updatedAt: number; concentration: string; data: { branding?: { bottle: string; glass: string; accent: string; label: string; name: string } } };

export default function Account() {
  const { user, ready, setUser } = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();

  useEffect(() => {
    if (!user) return;
    api("/formulas").then((r) => setRows(r.formulas)).catch((e) => setError(e.message));
  }, [user]);

  useEffect(() => {
    const token = params.get("verify");
    if (!token) return;
    api("/auth/verify", { body: { token } }).then(() => setInfo("Your email is verified.")).catch((e) => setError(e.message)).finally(() => setParams({}, { replace: true }));
  }, [params, setParams]);

  if (!ready) return <div className="page-loading" role="status">Loading…</div>;
  if (!user) return <Navigate to="/login?next=/account" replace />;

  const del = async (r: Row) => {
    if (!confirm(`Delete "${r.name}"? This cannot be undone.`)) return;
    try {
      await api(`/formulas/${r.id}`, { method: "DELETE" });
      setRows((x) => x?.filter((y) => y.id !== r.id) ?? null);
    } catch (e) { setError((e as Error).message); }
  };
  const deleteAccount = async () => {
    if (!confirm("Delete your account and personal data? Saved formulas remain with Rhythm under the terms, with your identity removed. This cannot be undone.")) return;
    try {
      await api("/me/delete", { body: {} });
      setUser(null);
      nav("/");
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="account">
      <div className="catalog-head"><h1>My formulas</h1><p className="muted">{user.email}{!user.emailVerified && " · not verified"}</p>
        <Link to="/create" className="btn primary">New fragrance</Link></div>
      {error && <p className="warn-text" role="alert">{error}</p>}
      {info && <p className="good-text" role="status">{info}</p>}
      {rows === null && !error && <p className="muted" role="status">Loading your formulas…</p>}
      {rows?.length === 0 && <div className="panel center"><h3>Nothing saved yet</h3><p className="muted">Compose your first fragrance and it will live here.</p></div>}
      <div className="card-grid wide">
        {rows?.map((r) => (
          <article key={r.id} className="card formula-card">
            <div className="stage mini" style={{ "--glow": r.data.branding?.glass ?? "#d8a657" } as React.CSSProperties}><Bottle branding={{ bottle: "column", glass: "#d8a657", accent: "#f4e3bf", label: "#14101c", ...r.data.branding, name: r.name }} width={70} /></div>
            <div className="card-body">
              <h3>{r.name}</h3>
              <p className="muted">Score {r.score} · {r.noteCount} notes · {new Date(r.updatedAt).toLocaleDateString()}</p>
              <div className="actions"><Link className="btn small" to={`/create?formula=${r.id}`}>Open</Link><button className="btn ghost small" onClick={() => del(r)}>Delete</button></div>
            </div>
          </article>
        ))}
      </div>
      <details className="danger"><summary>Account settings</summary><button className="btn ghost small" onClick={deleteAccount}>Delete my account</button></details>
    </div>
  );
}
