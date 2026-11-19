"use client";

/* ktayl Access Governance — governed service accounts (IGA-06, S021–S024). List the non-human
   identities, file a request (dual-approved: a Security approver + the owner — four-eyes), decide a
   leg, (re)provision to Authentik + Vault, and recertify. Admin-only (the backend's global guard +
   the per-action checks); a 401 sends the operator back through SSO. Same-origin /api BFF. */

import { useCallback, useEffect, useState } from "react";

const NAVY = "#00375A";
const ORANGE = "#E8690B";
const TYPES = ["qa", "m2m", "automation"] as const;

type Decision = { approver: string; decision: string; at: string; comment?: string } | null;
type ServiceAccount = {
  id: string;
  name: string;
  displayName: string;
  type: string;
  ownerMatricule: string;
  groupRefs: string[];
  status: "requested" | "active" | "disabled";
  authentikUsername: string | null;
  vaultSecretRef: string | null;
  lastRecertifiedAt: string | null;
};
type SaRequest = {
  id: string;
  requesterId: string;
  serviceAccountId: string;
  justification: string;
  securityApprover: string | null;
  ownerApprover: string | null;
  status: "pending" | "approved" | "denied" | "cancelled";
  securityDecision: Decision;
  ownerDecision: Decision;
};

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

export default function ServiceAccountsConsole() {
  const [accounts, setAccounts] = useState<ServiceAccount[]>([]);
  const [requests, setRequests] = useState<SaRequest[]>([]);
  const [due, setDue] = useState<ServiceAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [unauth, setUnauth] = useState(false);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);

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
      const [a, r, d] = await Promise.all([
        api("/service-accounts"),
        api("/service-accounts/requests"),
        api("/service-accounts/due?days=90"),
      ]);
      setAccounts(a); setRequests(r); setDue(d); setError(null);
    } catch (e) {
      if ((e as Error).message === "UNAUTHORISED") setUnauth(true);
      else setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); await reload(); setError(null); }
    catch (e) { setError((e as Error).message); }
  };

  const dueIds = new Set(due.map((d) => d.id));

  if (denied) return (
    <Shell><Card>
      <p style={{ margin: 0, color: "#3b4a55" }}>The service-accounts console requires the Access Governance admin role.</p>
      <a href="/me" style={btn}>Go to your console →</a>
    </Card></Shell>
  );
  if (unauth) return (
    <Shell><Card>
      <p style={{ margin: 0, color: "#3b4a55" }}>Your session has expired.</p>
      <a href="/api/auth/login" style={btn}>Sign in with Authentik →</a>
    </Card></Shell>
  );

  return (
    <Shell>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: NAVY, margin: "0 0 4px" }}>Service accounts</h1>
        <a href="/admin" style={{ color: ORANGE, fontWeight: 600, fontSize: 14 }}>← Catalog</a>
      </div>
      <p style={{ color: "#3b4a55", marginTop: 0 }}>
        Governed non-human identities. A request is <strong>dual-approved</strong> (a Security approver <em>and</em> the
        owner — four-eyes, no self-approval) before it is provisioned to Authentik and its credential minted into Vault.
        Owners <strong>recertify</strong> them periodically.
      </p>

      {error && <div style={{ ...card, borderColor: "#d33", color: "#a11" }}>Error: {error}</div>}

      <NewRequestForm onDone={reload} onError={setError} />

      {loading ? <p style={{ color: "#3b4a55" }}>Loading…</p> : (
        <>
          {/* Pending requests */}
          <section style={card}>
            <h2 style={h2}>Requests</h2>
            {requests.length === 0 ? <p style={muted}>No requests yet.</p> : requests.map((r) => {
              const sa = accounts.find((a) => a.id === r.serviceAccountId);
              return (
                <div key={r.id} style={{ borderTop: "1px solid #eef2f5", padding: "10px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <strong style={{ color: NAVY }}>{sa?.name ?? r.serviceAccountId}</strong>
                    <span style={statusPill(r.status)}>{r.status}</span>
                  </div>
                  <p style={{ ...muted, margin: "4px 0" }}>“{r.justification}” — by {r.requesterId}</p>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <Leg label="Security" approver={r.securityApprover} decision={r.securityDecision} />
                    <Leg label="Owner" approver={r.ownerApprover} decision={r.ownerDecision} />
                  </div>
                  {r.status === "pending" && (
                    <DecideBar onApprove={(approver) => act(() => api(`/service-accounts/requests/${r.id}/decide`, { method: "POST", body: JSON.stringify({ decision: "approved", approver }) }))}
                               onDeny={(approver, comment) => act(() => api(`/service-accounts/requests/${r.id}/decide`, { method: "POST", body: JSON.stringify({ decision: "denied", approver, comment }) }))} />
                  )}
                </div>
              );
            })}
          </section>

          {/* Accounts */}
          <section style={card}>
            <h2 style={h2}>Accounts</h2>
            {accounts.length === 0 ? <p style={muted}>No service accounts yet.</p> : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead><tr style={{ textAlign: "left", color: "#6b7a84" }}>
                  <th style={th}>Name</th><th style={th}>Type</th><th style={th}>Owner</th><th style={th}>Status</th><th style={th}>Groups</th><th style={th}>Recertified</th><th style={th} />
                </tr></thead>
                <tbody>{accounts.map((a) => (
                  <tr key={a.id} style={{ borderTop: "1px solid #eef2f5" }}>
                    <td style={td}><strong>{a.name}</strong><div style={muted}>{a.displayName}</div></td>
                    <td style={td}>{a.type}</td>
                    <td style={td}>{a.ownerMatricule}</td>
                    <td style={td}><span style={statusPill(a.status)}>{a.status}</span></td>
                    <td style={td}>{a.groupRefs.join(", ")}</td>
                    <td style={td}>{a.lastRecertifiedAt ? new Date(a.lastRecertifiedAt).toLocaleDateString() : <span style={{ color: "#a11" }}>{dueIds.has(a.id) ? "due" : "never"}</span>}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {a.status === "active" && <button style={smallBtn} onClick={() => act(() => api(`/service-accounts/${a.id}/recertify`, { method: "POST" }))}>Recertify</button>}
                      {a.status !== "disabled" && <button style={smallBtnGhost} onClick={() => act(() => api(`/service-accounts/${a.id}/provision`, { method: "POST" }))}>Provision</button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {due.length > 0 && <p style={{ ...muted, marginTop: 8 }}>{due.length} account(s) due for recertification (never attested or &gt; 90 days).</p>}
          </section>
        </>
      )}
    </Shell>
  );
}

function NewRequestForm({ onDone, onError }: { onDone: () => void; onError: (m: string) => void }) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("qa");
  const [owner, setOwner] = useState("");
  const [groups, setGroups] = useState("");
  const [justification, setJustification] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api("/service-accounts/requests", {
        method: "POST",
        body: JSON.stringify({
          name, displayName, type, ownerMatricule: owner,
          groupRefs: groups.split(",").map((g) => g.trim()).filter(Boolean),
          justification,
        }),
      });
      setName(""); setDisplayName(""); setOwner(""); setGroups(""); setJustification("");
      onDone();
    } catch (e) { onError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <section style={card}>
      <h2 style={h2}>File a request</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input style={input} placeholder="name (ktayl-qa-finance)" value={name} onChange={(e) => setName(e.target.value)} />
        <input style={input} placeholder="display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <select style={input} value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input style={input} placeholder="owner matricule (100001)" value={owner} onChange={(e) => setOwner(e.target.value)} />
        <input style={input} placeholder="groups (comma-sep, e.g. GROUP_Finance)" value={groups} onChange={(e) => setGroups(e.target.value)} />
      </div>
      <textarea style={{ ...input, minHeight: 54, width: "100%", flex: "unset" }} placeholder="justification (mandatory audit reason)" value={justification} onChange={(e) => setJustification(e.target.value)} />
      <button style={btn} disabled={busy} onClick={submit}>{busy ? "Filing…" : "File request"}</button>
    </section>
  );
}

function DecideBar({ onApprove, onDeny }: { onApprove: (a: string) => void; onDeny: (a: string, c: string) => void }) {
  const [approver, setApprover] = useState("");
  const [comment, setComment] = useState("");
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
      <input style={{ ...input, flex: "0 0 150px" }} placeholder="your matricule" value={approver} onChange={(e) => setApprover(e.target.value)} />
      <input style={{ ...input, flex: "1 1 160px" }} placeholder="comment (deny)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <button style={smallBtn} onClick={() => onApprove(approver)}>Approve leg</button>
      <button style={smallBtnDeny} onClick={() => onDeny(approver, comment)}>Deny</button>
    </div>
  );
}

function Leg({ label, approver, decision }: { label: string; approver: string | null; decision: Decision }) {
  const color = decision?.decision === "approved" ? "#0a6" : decision?.decision === "denied" ? "#a11" : "#8a97a0";
  return (
    <div style={{ fontSize: 13 }}>
      <span style={{ color: "#6b7a84" }}>{label}:</span>{" "}
      <strong style={{ color: NAVY }}>{approver ?? "—"}</strong>{" "}
      <span style={{ color, fontWeight: 700 }}>{decision ? decision.decision : "pending"}</span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100dvh", background: "#f6f8fa", padding: "40px 20px" }}>
      <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ktayl-logo.svg" alt="ktayl-solution" width={180} height={40} />
        {children}
      </div>
    </main>
  );
}
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>{children}</div>;
}
function statusPill(s: string): React.CSSProperties {
  const c = s === "active" || s === "approved" ? "#0a6" : s === "denied" || s === "disabled" ? "#a11" : "#468";
  return { fontSize: 12, fontWeight: 700, color: c, border: `1px solid ${c}`, borderRadius: 999, padding: "1px 8px", textTransform: "uppercase" };
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e3e9ee", borderRadius: 12, padding: 18, width: "100%", boxSizing: "border-box" };
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: NAVY, margin: "0 0 8px" };
const muted: React.CSSProperties = { color: "#6b7a84", fontSize: 13 };
const input: React.CSSProperties = { padding: "8px 10px", border: "1px solid #cdd7de", borderRadius: 8, fontSize: 14, flex: "1 1 160px" };
const btn: React.CSSProperties = { marginTop: 10, background: ORANGE, color: "#fff", border: 0, borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "inline-block" };
const smallBtn: React.CSSProperties = { background: "#0a6", color: "#fff", border: 0, borderRadius: 7, padding: "5px 10px", fontWeight: 700, cursor: "pointer", fontSize: 13, marginRight: 6 };
const smallBtnDeny: React.CSSProperties = { ...smallBtn, background: "#a11" };
const smallBtnGhost: React.CSSProperties = { ...smallBtn, background: "#fff", color: NAVY, border: `1px solid ${NAVY}` };
const th: React.CSSProperties = { padding: "4px 6px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "6px 6px", color: "#2b3942", verticalAlign: "top" };
