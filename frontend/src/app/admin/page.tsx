"use client";

/* ktayl Access Governance — admin catalog (S002). Lists governed applications + their roles
   and registers new ones via the same-origin API (/api/applications). Admin session required
   (the backend's global guard); a 401 sends the operator back through SSO. */

import { useCallback, useEffect, useState } from "react";

const NAVY = "#00375A";
const ORANGE = "#E8690B";
const TIERS = ["public", "internal", "restricted"] as const;

type Role = {
  id: string;
  name: string;
  owner: string;
  authentikGroupRef: string;
  description: string | null;
};
type Application = {
  id: string;
  name: string;
  tier: string;
  authentikAppRef: string;
  description: string | null;
  roles: Role[];
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

export default function AdminCatalog() {
  const [apps, setApps] = useState<Application[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [unauth, setUnauth] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setApps(await api("/applications"));
      setError(null);
    } catch (e) {
      if ((e as Error).message === "UNAUTHORISED") setUnauth(true);
      else setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api("/applications")
      .then((data) => active && (setApps(data), setError(null)))
      .catch((e: Error) => active && (e.message === "UNAUTHORISED" ? setUnauth(true) : setError(e.message)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  if (unauth) {
    return (
      <Shell>
        <Card>
          <p style={{ margin: 0, color: "#3b4a55" }}>Your session has expired.</p>
          <a href="/api/auth/login" style={btn}>Sign in with Authentik →</a>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 style={{ fontSize: 30, fontWeight: 800, color: NAVY, margin: "0 0 4px" }}>Application &amp; role catalog</h1>
      <p style={{ color: "#3b4a55", marginTop: 0 }}>
        The source of truth for what applications exist, what roles they have, and who owns each role.
      </p>

      {error && <div style={{ ...card, borderColor: "#d33", color: "#a11" }}>Error: {error}</div>}

      <NewApplicationForm onCreated={reload} onError={setError} />

      {loading ? (
        <p style={{ color: "#3b4a55" }}>Loading…</p>
      ) : apps.length === 0 ? (
        <p style={{ color: "#3b4a55" }}>No applications yet — register the first one above.</p>
      ) : (
        apps.map((app) => <AppCard key={app.id} app={app} onChange={reload} onError={setError} />)
      )}
    </Shell>
  );
}

function AppCard({ app, onChange, onError }: { app: Application; onChange: () => void; onError: (m: string) => void }) {
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 18, color: NAVY }}>{app.name}</strong>
        <span style={tierPill(app.tier)}>{app.tier}</span>
        <code style={{ color: "#5a6b76", fontSize: 13 }}>{app.authentikAppRef}</code>
      </div>
      {app.description && <p style={{ color: "#3b4a55", margin: "6px 0 0" }}>{app.description}</p>}

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#5a6b76" }}>
            <th style={th}>Role</th>
            <th style={th}>Owner</th>
            <th style={th}>Authentik group</th>
          </tr>
        </thead>
        <tbody>
          {app.roles?.length ? (
            app.roles.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid #eef2f5" }}>
                <td style={td}>{r.name}</td>
                <td style={td}>{r.owner}</td>
                <td style={td}><code>{r.authentikGroupRef}</code></td>
              </tr>
            ))
          ) : (
            <tr><td style={{ ...td, color: "#8a97a0" }} colSpan={3}>No roles yet.</td></tr>
          )}
        </tbody>
      </table>

      <NewRoleForm appId={app.id} onCreated={onChange} onError={onError} />
    </div>
  );
}

function NewApplicationForm({ onCreated, onError }: { onCreated: () => void; onError: (m: string) => void }) {
  const [f, setF] = useState({ name: "", tier: "internal", authentikAppRef: "", description: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/applications", { method: "POST", body: JSON.stringify({ ...f, description: f.description || undefined }) });
      setF({ name: "", tier: "internal", authentikAppRef: "", description: "" });
      onCreated();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} style={{ ...card, background: "#f6f9fb" }}>
      <strong style={{ color: NAVY }}>Register an application</strong>
      <div style={row}>
        <input required placeholder="Name (e.g. Grafana)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={input} />
        <select value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value })} style={input}>
          {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input required placeholder="Authentik app slug (e.g. grafana)" value={f.authentikAppRef} onChange={(e) => setF({ ...f, authentikAppRef: e.target.value })} style={input} />
      </div>
      <input placeholder="Description (optional)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} style={{ ...input, width: "100%" }} />
      <button type="submit" disabled={busy} style={btn}>{busy ? "Saving…" : "Add application"}</button>
    </form>
  );
}

function NewRoleForm({ appId, onCreated, onError }: { appId: string; onCreated: () => void; onError: (m: string) => void }) {
  const [f, setF] = useState({ name: "", owner: "", authentikGroupRef: "", description: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/applications/${appId}/roles`, { method: "POST", body: JSON.stringify({ ...f, description: f.description || undefined }) });
      setF({ name: "", owner: "", authentikGroupRef: "", description: "" });
      onCreated();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
      <input required placeholder="Role name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ ...input, flex: "1 1 130px" }} />
      <input required placeholder="Owner (matricule)" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} style={{ ...input, flex: "1 1 130px" }} />
      <input required placeholder="Authentik group" value={f.authentikGroupRef} onChange={(e) => setF({ ...f, authentikGroupRef: e.target.value })} style={{ ...input, flex: "1 1 160px" }} />
      <button type="submit" disabled={busy} style={{ ...btn, background: NAVY, marginTop: 0, padding: "8px 14px" }}>{busy ? "…" : "+ role"}</button>
    </form>
  );
}

/* ---------- presentational helpers ---------- */
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

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e3e9ee", borderRadius: 12, padding: 18 };
const row: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" };
const input: React.CSSProperties = { padding: "8px 10px", border: "1px solid #cdd7de", borderRadius: 8, fontSize: 14, flex: "1 1 160px" };
const btn: React.CSSProperties = { marginTop: 10, background: ORANGE, color: "#fff", border: 0, borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "inline-block" };
const th: React.CSSProperties = { padding: "4px 6px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "6px 6px", color: "#2b3942" };
function tierPill(tier: string): React.CSSProperties {
  const c = tier === "restricted" ? "#a11" : tier === "internal" ? "#0a6" : "#468";
  return { fontSize: 12, fontWeight: 700, color: c, border: `1px solid ${c}`, borderRadius: 999, padding: "1px 8px", textTransform: "uppercase" };
}
