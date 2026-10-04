"use client";

/* ktayl Access Governance — the role-aware user hub (S010 + S011). Every signed-in employee lands
   here. Three sections: Request access (self-service), My requests (status + cancel), My approvals
   (the four-eyes inbox — approve/deny the legs assigned to me; the approver IS me, no override).
   Admins also get a link to the full admin console. Same-origin /api with credentials; 401 → SSO. */

import { useCallback, useEffect, useState } from "react";

const NAVY = "#00375A";
const ORANGE = "#E8690B";

type Me = { username: string; email?: string; isAdmin: boolean };
type Role = { id: string; name: string };
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

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 401) throw new Error("UNAUTHORISED");
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(Array.isArray(b.message) ? b.message.join(", ") : b.message ?? `HTTP ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

/** The un-decided legs of a request that are assigned to `me` (the S011 inbox predicate). */
function myOpenLegs(r: AccessRequest, me: string): ("manager" | "owner")[] {
  if (r.status !== "pending") return [];
  const legs: ("manager" | "owner")[] = [];
  if (r.managerApprover === me && !r.managerDecision) legs.push("manager");
  if (r.ownerApprover === me && !r.ownerDecision) legs.push("owner");
  return legs;
}

export default function Hub() {
  const [me, setMe] = useState<Me | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [reqs, setReqs] = useState<AccessRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [unauth, setUnauth] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [m, a, r] = await Promise.all([api("/auth/me"), api("/applications"), api("/requests")]);
      setMe(m); setApps(a); setReqs(r); setError(null);
    } catch (e) {
      if ((e as Error).message === "UNAUTHORISED") setUnauth(true);
      else setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([api("/auth/me"), api("/applications"), api("/requests")])
      .then(([m, a, r]) => { if (active) { setMe(m); setApps(a); setReqs(r); setError(null); } })
      .catch((e: Error) => {
        if (!active) return;
        if (e.message === "UNAUTHORISED") setUnauth(true);
        else setError(e.message);
      });
    return () => { active = false; };
  }, []);

  if (unauth) {
    return (
      <Shell me={null}>
        <div style={card}>
          <p style={{ margin: 0, color: "#3b4a55" }}>Please sign in to continue.</p>
          <a href="/api/auth/login" style={btn}>Sign in with Authentik →</a>
        </div>
      </Shell>
    );
  }

  const myName = me?.username ?? "";
  const myRequests = reqs.filter((r) => r.requesterId === myName);
  const myApprovals = reqs.filter((r) => myOpenLegs(r, myName).length > 0);

  return (
    <Shell me={me}>
      {error && <div style={{ ...card, borderColor: "#d33", color: "#a11" }}>Error: {error}</div>}

      <RequestAccess apps={apps} onDone={reload} onError={setError} />

      <section style={card}>
        <strong style={{ color: NAVY, fontSize: 18 }}>My approvals</strong>
        <p style={{ color: "#6b7884", margin: "2px 0 8px", fontSize: 13 }}>Requests waiting for your decision (four-eyes).</p>
        {myApprovals.length === 0 ? (
          <p style={{ color: "#8a97a0", margin: 0 }}>Nothing awaiting your approval. 🎉</p>
        ) : (
          myApprovals.map((r) => <ApprovalCard key={r.id} req={r} me={myName} onDone={reload} onError={setError} />)
        )}
      </section>

      <section style={card}>
        <strong style={{ color: NAVY, fontSize: 18 }}>My requests</strong>
        {myRequests.length === 0 ? (
          <p style={{ color: "#8a97a0", margin: "8px 0 0" }}>You haven&apos;t requested any access yet.</p>
        ) : (
          myRequests.map((r) => <MyRequestCard key={r.id} req={r} onDone={reload} onError={setError} />)
        )}
      </section>
    </Shell>
  );
}

function RequestAccess({ apps, onDone, onError }: { apps: Application[]; onDone: () => void; onError: (m: string) => void }) {
  const [roleId, setRoleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const options = apps.flatMap((a) => a.roles.map((r) => ({ id: r.id, label: `${a.name} — ${r.name}` })));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleId) return;
    setBusy(true); setOk(false);
    try {
      await api("/requests", { method: "POST", body: JSON.stringify({ roleId }) }); // self (server-forced)
      setRoleId(""); setOk(true); onDone();
    } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} style={{ ...card, background: "#f6f9fb" }}>
      <strong style={{ color: NAVY, fontSize: 18 }}>Request access</strong>
      <p style={{ color: "#6b7884", margin: "2px 0 8px", fontSize: 13 }}>Pick a role — your manager and the role owner both approve before it&apos;s granted.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select required value={roleId} onChange={(e) => setRoleId(e.target.value)} style={{ ...input, flex: "2 1 280px" }}>
          <option value="">Select a role…</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <button type="submit" disabled={busy} style={{ ...btn, marginTop: 0 }}>{busy ? "…" : "Request"}</button>
      </div>
      {ok && <p style={{ color: "#064", margin: "8px 0 0", fontSize: 13 }}>Request submitted — track it under “My requests”.</p>}
    </form>
  );
}

function MyRequestCard({ req, onDone, onError }: { req: AccessRequest; onDone: () => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const cancel = async () => {
    setBusy(true);
    try { await api(`/requests/${req.id}/cancel`, { method: "POST" }); onDone(); }
    catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div style={{ ...card, marginTop: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <strong style={{ color: NAVY }}>{req.role?.application?.name} — {req.role?.name}</strong>
        <span style={statusPill(req.status)}>{req.status}</span>
        {req.status === "pending" && (
          <button onClick={cancel} disabled={busy} style={{ ...btnSmall, background: "#fff", color: "#a11", border: "1px solid #e0b4b4" }}>
            {busy ? "…" : "Cancel"}
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
        <Leg label="Manager" decision={req.managerDecision} />
        <Leg label="Role owner" decision={req.ownerDecision} />
      </div>
    </div>
  );
}

function ApprovalCard({ req, me, onDone, onError }: { req: AccessRequest; me: string; onDone: () => void; onError: (m: string) => void }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const legs = myOpenLegs(req, me);
  const decide = async (decision: "approved" | "denied") => {
    setBusy(true);
    try {
      await api(`/requests/${req.id}/decide`, { method: "POST", body: JSON.stringify({ decision, comment: comment || undefined }) });
      onDone();
    } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div style={{ ...card, marginTop: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <strong style={{ color: NAVY }}>{req.role?.application?.name} — {req.role?.name}</strong>
        <span style={{ color: "#5a6b76", fontSize: 13 }}>requester <code>{req.requesterId}</code></span>
        <span style={{ color: "#6b7884", fontSize: 12 }}>your leg: {legs.join(" + ")}</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
        <input placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} style={{ ...input, flex: "2 1 220px" }} />
        <button disabled={busy} onClick={() => decide("approved")} style={{ ...btnSmall, background: "#0a6" }}>Approve</button>
        <button disabled={busy} onClick={() => decide("denied")} style={{ ...btnSmall, background: "#a11" }}>Deny</button>
      </div>
    </div>
  );
}

function Leg({ label, decision }: { label: string; decision: Decision }) {
  const color = decision?.decision === "approved" ? "#0a6" : decision?.decision === "denied" ? "#a11" : "#8a97a0";
  return (
    <div style={{ fontSize: 13 }}>
      <span style={{ color: "#5a6b76" }}>{label}: </span>
      <span style={{ color, fontWeight: 600 }}>{decision ? `${decision.decision} by ${decision.approver}` : "pending"}</span>
    </div>
  );
}

function Shell({ me, children }: { me: Me | null; children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100dvh", background: "#f6f8fa", padding: "40px 20px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ktayl-logo.svg" alt="ktayl-solution" width={170} height={38} />
          <nav style={{ display: "flex", gap: 14, fontSize: 14, alignItems: "center" }}>
            {me && <span style={{ color: "#6b7884" }}>{me.username}{me.isAdmin ? " · admin" : ""}</span>}
            {me?.isAdmin && <a href="/admin" style={{ color: ORANGE, fontWeight: 600 }}>Admin console →</a>}
            <button
              onClick={() =>
                fetch("/api/auth/logout", { method: "POST", credentials: "include" }).then(() => {
                  // hard navigation on sign-out — fully resets client state (not a router.push)
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                  window.location.href = "/";
                })
              }
              style={{ color: "#6b7884", background: "none", border: 0, cursor: "pointer", fontSize: 14, padding: 0 }}
            >
              Sign out
            </button>
          </nav>
        </div>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: NAVY, margin: "0 0 2px" }}>Access</h1>
          <p style={{ color: "#3b4a55", margin: 0 }}>Request the access you need, track it, and approve what&apos;s assigned to you.</p>
        </div>
        {children}
      </div>
    </main>
  );
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e3e9ee", borderRadius: 12, padding: 18 };
const input: React.CSSProperties = { padding: "8px 10px", border: "1px solid #cdd7de", borderRadius: 8, fontSize: 14 };
const btn: React.CSSProperties = { marginTop: 10, background: ORANGE, color: "#fff", border: 0, borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "inline-block" };
const btnSmall: React.CSSProperties = { color: "#fff", border: 0, borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer" };
function statusPill(s: string): React.CSSProperties {
  const c = s === "approved" ? "#0a6" : s === "denied" ? "#a11" : s === "cancelled" ? "#889" : "#E8690B";
  return { fontSize: 12, fontWeight: 700, color: c, border: `1px solid ${c}`, borderRadius: 999, padding: "1px 8px", textTransform: "uppercase" };
}
