import { W } from "../theme";

// Login screen with two stub-OAuth buttons. The actual id_token construction
// lives in App.jsx's handleLogin — this component is render-only.
export const LoginScreen = ({ onLogin }) => (
  <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 28px" }}>
    <div style={{ textAlign: "center", marginBottom: 40 }}>
      <div style={{ fontSize: 42, fontWeight: 900, color: W.accent, fontFamily: "monospace", letterSpacing: -2 }}>RATED</div>
      <div style={{ fontSize: 10, color: W.dim, marginTop: 8, fontFamily: "monospace", letterSpacing: 3 }}>YOUR TASTE. RANKED.</div>
    </div>
    {/* Apple sign-in is gated on an Apple Developer Program subscription
        ($99/yr) — until then we visibly disable the button so users
        don't get a misleading auth error. */}
    <div aria-disabled="true"
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "#fff", borderRadius: 12, padding: "13px 20px", cursor: "not-allowed", marginBottom: 10, opacity: 0.5, position: "relative" }}>
      <span style={{ fontSize: 18, color: "#000" }}></span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#000" }}>Continue with Apple</span>
      <span style={{ position: "absolute", top: 6, right: 10, fontSize: 8, fontWeight: 700, color: "#666", letterSpacing: 1, fontFamily: "monospace" }}>SOON</span>
    </div>
    <div onClick={() => onLogin("google")} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: "13px 20px", cursor: "pointer" }}>
      <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
      <span style={{ fontSize: 13, fontWeight: 600, color: W.text }}>Continue with Google</span>
    </div>
    <div style={{ textAlign: "center", marginTop: 28 }}>
      <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", lineHeight: 1.6 }}>By continuing you agree to Rated's <span style={{ color: W.accent }}>Terms</span> & <span style={{ color: W.accent }}>Privacy</span></div>
    </div>
  </div>
);
