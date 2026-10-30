"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#F7F8FA", color: "#172033" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>M Garage couldn&apos;t load</h1>
          <p style={{ color: "#667085", fontSize: 14 }}>Your data is stored safely in this browser. Please try again.</p>
          <button onClick={reset} style={{ marginTop: 12, background: "#1E3A8A", color: "#fff", border: 0, borderRadius: 8, padding: "8px 16px", fontSize: 14, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
