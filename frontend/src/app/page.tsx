/* ktayl Access Governance — landing page. Static server component; the only action is
   "Sign in" → the backend OIDC entry (/api/auth/login), which redirects to Authentik. */

const NAVY = "#00375A";
const ORANGE = "#E8690B";

const features: { title: string; body: string }[] = [
  {
    title: "Per-application roles",
    body: "Every app declares its roles. Grant a person exactly the role they need — nothing more.",
  },
  {
    title: "Dual approval (four-eyes)",
    body: "A role request is validated by both the user's manager and the role owner before anything is granted.",
  },
  {
    title: "Provisioned automatically",
    body: "Approved access is synced into Authentik groups, so login enforces it. No secret handed out by hand.",
  },
  {
    title: "Fully auditable",
    body: "Who has what, who approved it, and when — an immutable trail for DORA / ISO-27001 access control.",
  },
];

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        background: "radial-gradient(1200px 600px at 50% -10%, #eaf1f6 0%, #f6f8fa 60%)",
        color: NAVY,
        textAlign: "center",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/ktayl-logo.svg" alt="ktayl-solution" width={260} height={58} />

      <h1 style={{ margin: "28px 0 8px", fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em" }}>
        Access Governance
      </h1>
      <p style={{ margin: 0, maxWidth: 640, fontSize: 18, lineHeight: 1.5, color: "#3b4a55" }}>
        The ktayl-solution platform for managing <strong>who can do what</strong> across every
        application. Request a role, get it double-validated, and it&apos;s provisioned into
        Authentik — governed, least-privilege, and auditable.
      </p>

      <a
        href="/api/auth/login"
        style={{
          marginTop: 28,
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          background: ORANGE,
          color: "#fff",
          fontWeight: 700,
          fontSize: 16,
          padding: "13px 26px",
          borderRadius: 10,
          textDecoration: "none",
          boxShadow: "0 6px 18px rgba(232,105,11,0.28)",
        }}
      >
        Sign in with Authentik →
      </a>
      <p style={{ marginTop: 10, fontSize: 13, color: "#7a8894" }}>
        Console access requires the <code>Platform Admins</code> role.
      </p>

      <section
        style={{
          marginTop: 48,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          maxWidth: 920,
          width: "100%",
        }}
      >
        {features.map((f) => (
          <div
            key={f.title}
            style={{
              background: "#fff",
              border: "1px solid #e3e9ee",
              borderRadius: 12,
              padding: "20px 18px",
              textAlign: "left",
            }}
          >
            <div style={{ height: 3, width: 34, background: ORANGE, borderRadius: 2, marginBottom: 12 }} />
            <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: NAVY }}>{f.title}</h3>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "#54636e" }}>{f.body}</p>
          </div>
        ))}
      </section>

      <footer style={{ marginTop: 48, fontSize: 13, color: "#8a97a2" }}>
        ktayl-solution · Information System · internal
      </footer>
    </main>
  );
}
