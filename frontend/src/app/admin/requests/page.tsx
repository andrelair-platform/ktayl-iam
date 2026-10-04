"use client";

/* ktayl Access Governance — the workflow console (S004/S005/S006). Request a role, decide the two
   approval legs (four-eyes), see who-has-what, trigger a reconcile, and export the audit. Admin
   session required (backend global guard); a 401 sends the operator back through SSO.
   Same-origin /api calls with credentials. */

import { useCallback, useEffect, useState } from "react";

const NAVY = "#00375A";
const ORANGE = "#E8690B";

type Role = { id: string; name: string; owner: string; authentikGroupRef: string };
type Application = { id: string; name: string; roles: Role[] };
type Decision = { approver: string; decision: string; at: string; comment?: string } | null;
type AccessRequest = {
  id: string;
  requesterId: string;
  status: "pending" | "approved" | "denied" | "cancelled";
  managerApprover: string | null;
  ownerApprover: string | null;
  managerDecision: Decision;
  ownerDecision: Decision;
  role?: { name: string; application?: { name: string } };
};
type MatrixRow = { user: string; application: string; role: string; synced: boolean };

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 401) throw new Error("UNAUTHORISED");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(Array.isArray(body.message) ? body.message.join(", ") : body.message ?? `HTTP ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

export default function WorkflowConsole() {
  const [apps, setApps] = useState<Application[]>([]);
  const [reqs, setReqs] = useState<AccessRequest[]>([]);
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [unauth, setUnauth] = useState(false);
  const [denied, setDenied] = useState(false);

  // S009/S010: admin-only console — a non-admin is sent to their hub (this page calls admin-only APIs).
  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => { if (active && m && !m.isAdmin) setDenied(true); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const reload = useCallback(async () => {
    try {
      const [a, r, m] = await Promise.all([api("/applications"), api("/requests"), api("/access/matrix")]);
      setApps(a); setReqs(r); setMatrix(m); setError(null);
    } catch (e) {
      if ((e as Error).message === "UNAUTHORISED") setUnauth(true);
      else setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([api("/applications"), api("/requests"), api("/access/matrix")])
      .then(([a, r, m]) => {
        if (!active) return;
        setApps(a); setReqs(r); setMatrix(m); setError(null);
      })
      .catch((e: Error) => {
        if (!active) return;
        if (e.message === "UNAUTHORISED") setUnauth(true);
        else setError(e.message);
      });
    return () => { active = false; };
  }, []);

  const reconcile = async () => {
    try {
      const rep = await api("/sync/reconcile", { method: "POST" });
      setNote(`Reconcile: ${rep.driftCount} drift, ${rep.applied} healed${rep.skippedReason ? ` (${rep.skippedReason})` : ""}.`);
      void reload();
    } catch (e) { setError((e as Error).message); }
  };

  if (denied) {
    return (
      <Shell>
        <div style={card}>
          <p style={{ margin: 0, color: "#3b4a55" }}>This console requires the Access Governance admin role.</p>
          <a href="/me" style={btn}>Go to your console →</a>
        </div>
      </Shell>
    );
  }

  if (unauth) {
    return (
      <Shell>
        <div style={card}>
          <p style={{ margin: 0, color: "#3b4a55" }}>Your session has expired.</p>
          <a href="/api/auth/login" style={btn}>Sign in with Authentik →</a>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: NAVY, margin: 0 }}>Access workflow</h1>
        <nav style={{ display: "flex", gap: 14, fontSize: 14 }}>
          <a href="/admin" style={{ color: ORANGE, fontWeight: 600 }}>Catalog</a>
          <a href="/api/access/audit/export?format=csv" style={{ color: NAVY, fontWeight: 600 }}>Export audit (CSV)</a>
          <a href="/api/access/audit/export?format=json" style={{ color: NAVY, fontWeight: 600 }}>JSON</a>
        </nav>
      </div>
      <p style={{ color: "#3b4a55", marginTop: 0 }}>
        Request a role → <strong>both</strong> the manager and the role owner approve (four-eyes) → it provisions into Authentik.
      </p>

      {error && <div style={{ ...card, borderColor: "#d33", color: "#a11" }}>Error: {error}</div>}
      {note && <div style={{ ...card, borderColor: "#0a6", color: "#064" }}>{note}</div>}

      <NewRequestForm apps={apps} onCreated={reload} onError={setError} />

      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ color: NAVY, fontSize: 18 }}>Requests</strong>
          <button onClick={reconcile} style={{ ...btn, marginTop: 0, background: NAVY, padding: "8px 14px" }}>Run reconcile</button>
        </div>
        {reqs.length === 0 ? (
          <p style={{ color: "#8a97a0" }}>No requests yet.</p>
        ) : (
          reqs.map((r) => <RequestCard key={r.id} req={r} onChange={reload} onError={setError} />)
        )}
      </section>

      <section style={card}>
        <strong style={{ color: NAVY, fontSize: 18 }}>Who has what</strong>
        <table style={table}>
          <thead><tr style={{ textAlign: "left", color: "#5a6b76" }}>
            <th style={th}>User</th><th style={th}>Application</th><th style={th}>Role</th><th style={th}>Enforced</th>
          </tr></thead>
          <tbody>
            {matrix.length ? matrix.map((m, i) => (
              <tr key={i} style={{ borderTop: "1px solid #eef2f5" }}>
                <td style={td}>{m.user}</td><td style={td}>{m.application}</td><td style={td}>{m.role}</td>
                <td style={td}>{m.synced ? "✅ synced" : "⏳ pending"}</td>
              </tr>
            )) : <tr><td style={{ ...td, color: "#8a97a0" }} colSpan={4}>No active assignments.</td></tr>}
          </tbody>
        </table>
      </section>
    </Shell>
  );
}

function NewRequestForm({ apps, onCreated, onError }: { apps: Application[]; onCreated: () => void; onError: (m: string) => void }) {
  const [roleId, setRoleId] = useState("");
  const [requesterId, setRequesterId] = useState("");
  const [busy, setBusy] = useState(false);
  const options = apps.flatMap((a) => a.roles.map((r) => ({ id: r.id, label: `${a.name} — ${r.name}` })));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleId) return;
    setBusy(true);
    try {
      await api("/requests", { method: "POST", body: JSON.stringify({ roleId, requesterId: requesterId || undefined }) });
      setRoleId(""); setRequesterId("");
      onCreated();
    } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} style={{ ...card, background: "#f6f9fb" }}>
      <strong style={{ color: NAVY }}>Request a role</strong>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
        <select required value={roleId} onChange={(e) => setRoleId(e.target.value)} style={{ ...input, flex: "2 1 260px" }}>
          <option value="">Select a role…</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <input placeholder="Requester matricule (default: you)" value={requesterId} onChange={(e) => setRequesterId(e.target.value)} style={{ ...input, flex: "1 1 180px" }} />
        <button type="submit" disabled={busy} style={{ ...btn, marginTop: 0 }}>{busy ? "…" : "Submit request"}</button>
      </div>
    </form>
  );
}

function RequestCard({ req, onChange, onError }: { req: AccessRequest; onChange: () => void; onError: (m: string) => void }) {
  return (
    <div style={{ ...card, marginTop: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <strong style={{ color: NAVY }}>{req.role?.application?.name} — {req.role?.name}</strong>
        <span style={statusPill(req.status)}>{req.status}</span>
        <span style={{ color: "#5a6b76", fontSize: 13 }}>requester <code>{req.requesterId}</code></span>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
        <Leg label="Manager" approver={req.managerApprover} decision={req.managerDecision} />
        <Leg label="Role owner" approver={req.ownerApprover} decision={req.ownerDecision} />
      </div>
      {req.status === "pending" && <DecideForm req={req} onDone={onChange} onError={onError} />}
    </div>
  );
}

function Leg({ label, approver, decision }: { label: string; approver: string | null; decision: Decision }) {
  const color = decision?.decision === "approved" ? "#0a6" : decision?.decision === "denied" ? "#a11" : "#8a97a0";
  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ color: "#5a6b76" }}>{label}: <code>{approver ?? "—"}</code></div>
      <div style={{ color, fontWeight: 600 }}>{decision ? `${decision.decision} by ${decision.approver}` : "pending"}</div>
    </div>
  );
}

function DecideForm({ req, onDone, onError }: { req: AccessRequest; onDone: () => void; onError: (m: string) => void }) {
  const [approver, setApprover] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const decide = async (decision: "approved" | "denied") => {
    setBusy(true);
    try {
      await api(`/requests/${req.id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision, comment: comment || undefined, approver: approver || undefined }),
      });
      setApprover(""); setComment("");
      onDone();
    } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center", borderTop: "1px solid #eef2f5", paddingTop: 10 }}>
      <input placeholder="Acting approver (dev override)" value={approver} onChange={(e) => setApprover(e.target.value)} style={{ ...input, flex: "1 1 180px" }} />
      <input placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} style={{ ...input, flex: "2 1 200px" }} />
      <button disabled={busy} onClick={() => decide("approved")} style={{ ...btn, marginTop: 0, background: "#0a6", padding: "8px 14px" }}>Approve</button>
      <button disabled={busy} onClick={() => decide("denied")} style={{ ...btn, marginTop: 0, background: "#a11", padding: "8px 14px" }}>Deny</button>
    </div>
  );
}

/* ---------- presentational helpers ---------- */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100dvh", background: "#f6f8fa", padding: "40px 20px" }}>
      <div style={{ maxWidth: 920, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ktayl-logo.svg" alt="ktayl-solution" width={180} height={40} />
        {children}
      </div>
    </main>
  );
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e3e9ee", borderRadius: 12, padding: 18 };
const input: React.CSSProperties = { padding: "8px 10px", border: "1px solid #cdd7de", borderRadius: 8, fontSize: 14 };
const btn: React.CSSProperties = { marginTop: 10, background: ORANGE, color: "#fff", border: 0, borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "inline-block" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 14 };
const th: React.CSSProperties = { padding: "4px 6px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "6px 6px", color: "#2b3942" };
function statusPill(s: string): React.CSSProperties {
  const c = s === "approved" ? "#0a6" : s === "denied" ? "#a11" : s === "cancelled" ? "#889" : "#E8690B";
  return { fontSize: 12, fontWeight: 700, color: c, border: `1px solid ${c}`, borderRadius: 999, padding: "1px 8px", textTransform: "uppercase" };
}
