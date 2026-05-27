export default function Page() {
  return (
    <main style={{ padding: "3rem", maxWidth: 720 }}>
      <h1 style={{ margin: 0, fontSize: "2.5rem", letterSpacing: "-0.02em" }}>
        tent
      </h1>
      <p style={{ color: "#8a857f", marginTop: "0.5rem" }}>
        control plane initialising. web UI lands in Phase 3.
      </p>
      <pre
        style={{
          background: "#181513",
          padding: "1rem",
          marginTop: "2rem",
          border: "1px solid #2b0000",
          color: "#b87a7a",
        }}
      >
        {`status: phase 0 — repo scaffolded\nnext:   phase 1 — core engine`}
      </pre>
    </main>
  );
}
