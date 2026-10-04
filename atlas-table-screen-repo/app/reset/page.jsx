"use client";
import { useState, useEffect, Suspense } from "react";

function ResetInner() {
  const [token, setToken] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") || "";
    setToken(t);
  }, []);

  const submit = async () => {
    if (pw.length < 6) { setErr("Password must be at least 6 characters."); return; }
    if (pw !== pw2) { setErr("Passwords don't match."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/reset-confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: pw }),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || "Reset failed."); setBusy(false); return; }
      setDone(true);
    } catch { setErr("Reset failed. Try again."); setBusy(false); }
  };

  const wrap = { minHeight: "100vh", background: "#0C141F", color: "#EDE4D0", fontFamily: "Georgia, serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
  const card = { maxWidth: 420, width: "100%", background: "#141d2b", border: "1px solid #26303f", borderRadius: 14, padding: 28 };
  const input = { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 8, border: "1px solid #26303f", background: "#0C141F", color: "#EDE4D0", fontSize: 15, fontFamily: "system-ui", margin: "6px 0 14px" };

  if (!token) return <div style={wrap}><div style={card}><h2>Reset password</h2><p style={{ color: "#9aa7b4" }}>This link is missing its token. Please use the link from your email.</p></div></div>;
  if (done) return <div style={wrap}><div style={card}><h2>Password updated ✓</h2><p style={{ color: "#9aa7b4" }}>You can now log in with your new password.</p><a href="/" style={{ display: "inline-block", marginTop: 12, background: "#7a5c3e", color: "#fff", textDecoration: "none", padding: "12px 20px", borderRadius: 8 }}>Back to Atlas</a></div></div>;

  return (
    <div style={wrap}>
      <div style={card}>
        <h2 style={{ margin: "0 0 4px" }}>Choose a new password</h2>
        <p style={{ color: "#9aa7b4", fontSize: 14, marginTop: 0 }}>Enter it twice to confirm.</p>
        <input style={input} type={show ? "text" : "password"} value={pw} onChange={e => setPw(e.target.value)} placeholder="New password" />
        <input style={input} type={show ? "text" : "password"} value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Confirm new password" />
        <label style={{ color: "#9aa7b4", fontSize: 13, display: "block", marginBottom: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} style={{ marginRight: 6 }} />Show passwords
        </label>
        {err && <p style={{ color: "#c9563f", fontSize: 13, margin: "0 0 10px" }}>{err}</p>}
        <button onClick={submit} disabled={busy} style={{ width: "100%", background: "#7a5c3e", color: "#fff", border: "none", padding: "12px", borderRadius: 8, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>{busy ? "Updating…" : "Update password"}</button>
      </div>
    </div>
  );
}

export default function ResetPage() {
  return <Suspense fallback={null}><ResetInner /></Suspense>;
}
