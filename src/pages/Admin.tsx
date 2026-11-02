import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { note, NOTE_BY_ID } from "../../shared/data/notes";
import { normalise } from "../../shared/engine/formula";
import { api, useSession } from "../lib";

type UserRow = { id: string; email: string; name: string; role: string; disabled: number; email_verified: number; created_at: number; last_login_at: number | null; formulas: number };
type FormulaRow = { id: string; name: string; score: number; noteCount: number; ideas: string; updatedAt: number; userEmail: string; concentration: string };

const when = (t: number | null) => (t ? new Date(t).toLocaleDateString() : "Never");

function Overview() {
  const [s, setS] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => { api("/admin/stats").then(setS).catch((e) => setError(e.message)); }, []);
  if (error) return <p className="warn-text" role="alert">{error}</p>;
  if (!s) return <p className="muted" role="status">Loading…</p>;
  const stats: [string, number][] = [["Users", s.users], ["Active this week", s.activeUsers], ["Formulas", s.formulas], ["New this week", s.newFormulas], ["Average score", s.averageScore]];
  return (
    <>
      <div className="stat-row">{stats.map(([k, v]) => <div className="panel stat" key={k}><b>{v}</b><span>{k}</span></div>)}</div>
      <section className="panel"><div className="panel-head"><h3>Recent admin activity</h3><a className="btn small" href="/api/admin/export.csv">Export all formulas (CSV)</a></div>
        {s.audit.length ? <div className="table-wrap"><table className="formula compact"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th></tr></thead><tbody>{s.audit.map((a: any, i: number) => <tr key={i}><td>{new Date(a.at).toLocaleString()}</td><td>{a.email}</td><td>{a.action}</td><td>{a.target}</td></tr>)}</tbody></table></div> : <p className="muted">No activity yet.</p>}
      </section>
    </>
  );
}

function Users({ self, onViewFormulas }: { self: string; onViewFormulas: (email: string) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => { api(`/admin/users?q=${encodeURIComponent(q)}`).then((r) => setRows(r.users)).catch((e) => setMsg(e.message)); }, [q]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  const patch = async (u: UserRow, body: object, confirmText: string) => {
    if (!confirm(confirmText)) return;
    try { await api(`/admin/users/${u.id}`, { method: "PATCH", body }); load(); } catch (e) { setMsg((e as Error).message); }
  };
  const resetLink = async (u: UserRow) => {
    try {
      const r = await api(`/admin/users/${u.id}/reset-link`, { body: {} });
      await navigator.clipboard.writeText(r.url).catch(() => {});
      setMsg(`One-hour reset link for ${u.email}: ${r.url}`);
    } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <section className="panel">
      <input type="search" aria-label="Search users" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
      {msg && <p className="notice break" role="status">{msg}</p>}
      <div className="table-wrap"><table className="formula compact">
        <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Joined</th><th>Last seen</th><th className="num">Formulas</th><th>Actions</th></tr></thead>
        <tbody>{rows.map((u) => (
          <tr key={u.id}>
            <td><b>{u.name || "No name"}</b><br /><small className="muted">{u.email}</small></td>
            <td className="cap">{u.role}</td>
            <td>{u.disabled ? "Disabled" : u.email_verified ? "Verified" : "Unverified"}</td>
            <td>{when(u.created_at)}</td><td>{when(u.last_login_at)}</td><td className="num">{u.formulas}</td>
            <td className="row-actions">
              <button className="link-btn" onClick={() => onViewFormulas(u.email)}>Formulas</button>
              {u.id !== self && <>
                <button className="link-btn" onClick={() => patch(u, { disabled: !u.disabled }, `${u.disabled ? "Enable" : "Disable"} ${u.email}?`)}>{u.disabled ? "Enable" : "Disable"}</button>
                <button className="link-btn" onClick={() => patch(u, { role: u.role === "admin" ? "user" : "admin" }, `${u.role === "admin" ? "Remove admin from" : "Make admin:"} ${u.email}?`)}>{u.role === "admin" ? "Remove admin" : "Make admin"}</button>
                {u.role !== "admin" && <button className="link-btn" onClick={() => resetLink(u)}>Reset link</button>}
              </>}
            </td>
          </tr>
        ))}</tbody>
      </table></div>
      {!rows.length && <p className="muted center">No users found.</p>}
    </section>
  );
}

function Formulas({ initial }: { initial: string }) {
  const [q, setQ] = useState(initial);
  const [rows, setRows] = useState<FormulaRow[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => { api(`/admin/formulas?q=${encodeURIComponent(q)}`).then((r) => setRows(r.formulas)).catch((e) => setMsg(e.message)); }, [q]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  const del = async (r: FormulaRow) => {
    if (!confirm(`Delete "${r.name}" by ${r.userEmail}? This cannot be undone.`)) return;
    try { await api(`/admin/formulas/${r.id}`, { method: "DELETE" }); setDetail(null); load(); } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <div className="admin-split">
      <section className="panel">
        <input type="search" aria-label="Search formulas" placeholder="Search name, email or ideas" value={q} onChange={(e) => setQ(e.target.value)} />
        {msg && <p className="warn-text" role="alert">{msg}</p>}
        <div className="table-wrap"><table className="formula compact">
          <thead><tr><th>Formula</th><th>Author</th><th className="num">Score</th><th>Updated</th><th /></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td><button className="link-btn" onClick={() => api(`/admin/formulas/${r.id}`).then((x) => setDetail(x.formula)).catch((e) => setMsg(e.message))}>{r.name}</button></td>
              <td>{r.userEmail}</td><td className="num">{r.score}</td><td>{when(r.updatedAt)}</td>
              <td><button className="icon-btn" aria-label={`Delete ${r.name}`} onClick={() => del(r)}>×</button></td>
            </tr>
          ))}</tbody>
        </table></div>
        {!rows.length && <p className="muted center">No formulas found.</p>}
      </section>
      {detail && (
        <aside className="panel">
          <h3>{detail.name}</h3>
          <p className="muted">{detail.userEmail} · {detail.concentration} · score {detail.score}</p>
          <table className="formula compact"><tbody>{normalise(detail.data.items).map((i: any) => <tr key={i.noteId}><td>{NOTE_BY_ID.has(i.noteId) ? note(i.noteId).name : i.noteId}</td><td className="num">{i.parts.toFixed(2)}%</td></tr>)}</tbody></table>
          {detail.ideas && <><h4>Ideas</h4><p className="pre">{detail.ideas}</p></>}
          {detail.data.branding?.tagline && <><h4>Tagline</h4><p>{detail.data.branding.tagline}</p></>}
          <Link className="btn small space-top" to={`/create?admin=${detail.id}`}>Review a copy in Studio</Link>
        </aside>
      )}
    </div>
  );
}

function Import() {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async () => {
    let body: unknown;
    try { body = JSON.parse(text); } catch { setMsg({ ok: false, text: "That isn't valid JSON." }); return; }
    const res = await fetch("/api/admin/catalog/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data: any = await res.json();
    setMsg(res.ok ? { ok: true, text: `Imported ${data.notes} notes and ${data.accords} accords. They appear after the next page load.` } : { ok: false, text: [data.error, ...(data.details ?? [])].join(". ") });
  };
  return (
    <section className="panel">
      <h3>Import catalogue data</h3>
      <p className="muted">Paste JSON with <code>notes</code> and <code>accords</code> arrays. Matching ids replace bundled entries. Import only data you have the right to use, such as licensed data or your own IFRA-verified values.</p>
      <textarea rows={10} className="mono" aria-label="Catalogue JSON" value={text} onChange={(e) => setText(e.target.value)} placeholder='{ "notes": [], "accords": [] }' />
      <div className="actions"><button className="btn primary" disabled={!text.trim()} onClick={run}>Import</button></div>
      {msg && <p className={msg.ok ? "good-text" : "warn-text"} role="status">{msg.text}</p>}
    </section>
  );
}

export default function Admin() {
  const { user, ready } = useSession();
  const [tab, setTab] = useState<"overview" | "users" | "formulas" | "import">("overview");
  const [filter, setFilter] = useState("");
  if (!ready) return <div className="page-loading" role="status">Loading…</div>;
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  const tabs: [typeof tab, string][] = [["overview", "Overview"], ["users", "Users"], ["formulas", "Formulas and ideas"], ["import", "Catalogue"]];
  return (
    <div className="admin">
      <h1>Admin</h1>
      <div className="tabs" role="tablist">{tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => { setTab(id); if (id === "formulas") setFilter(""); }}>{label}</button>)}</div>
      {tab === "overview" && <Overview />}
      {tab === "users" && <Users self={user.id} onViewFormulas={(email) => { setFilter(email); setTab("formulas"); }} />}
      {tab === "formulas" && <Formulas key={filter} initial={filter} />}
      {tab === "import" && <Import />}
    </div>
  );
}
