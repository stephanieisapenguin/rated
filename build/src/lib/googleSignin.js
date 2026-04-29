// Google Identity Services wrapper. Lazy-loads the GIS script the first time
// it's used, then asks Google for an ID token via the popup flow. Returns the
// real JWT credential — feed it straight to the backend's /auth/login.
//
// VITE_GOOGLE_CLIENT_ID must be set for production sign-in. When unset, the
// app falls back to the legacy stub flow (see App.jsx handleLogin) so dev
// against a backend without GOOGLE_CLIENT_ID still works.

const GIS_SRC = "https://accounts.google.com/gsi/client";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export const googleClientConfigured = () => !!CLIENT_ID;

let gisLoading = null;
const loadGis = () => {
  if (typeof window === "undefined") return Promise.reject(new Error("not in browser"));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", reject);
      return;
    }
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(s);
  });
  return gisLoading;
};

// Trigger the Google sign-in popup. Resolves with the JWT credential string,
// rejects if the user dismisses or the SDK fails. The popup flow uses the
// browser's user-activation token, so this MUST be called from a click
// handler — calling it from a useEffect won't work.
export const promptGoogleSignIn = async () => {
  if (!CLIENT_ID) throw new Error("VITE_GOOGLE_CLIENT_ID is not set");
  await loadGis();
  return new Promise((resolve, reject) => {
    try {
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (resp) => {
          if (resp?.credential) resolve(resp.credential);
          else reject(new Error("Google returned no credential"));
        },
        ux_mode: "popup",
        auto_select: false,
      });
      // The hidden-button trick: GIS only fires its callback in response to
      // either the rendered button being clicked or .prompt() being called.
      // We render an offscreen button and synthesize a click so the consumer
      // can keep its own custom-styled button while still using GIS.
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;top:-1000px;left:-1000px;opacity:0;pointer-events:none;";
      document.body.appendChild(host);
      window.google.accounts.id.renderButton(host, { type: "standard", theme: "outline" });
      // Find the underlying button and click it to start the popup.
      setTimeout(() => {
        const btn = host.querySelector('div[role="button"]');
        if (btn) btn.click();
        else reject(new Error("GIS button never rendered"));
        // Tear down the host shortly after — the popup is independent.
        setTimeout(() => host.remove(), 1500);
      }, 50);
    } catch (e) {
      reject(e);
    }
  });
};
