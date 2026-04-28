import { useEffect, useRef, useState } from "react";

import { W } from "../theme";
import { TapTarget } from "../components/TapTarget";
import { API } from "../lib/api";
import { checkProfanity } from "../lib/profanity";
import { TAKEN_USERNAMES } from "../lib/usernames";

// USERNAME SCREEN — checks server for availability, falls back to local set.
//
// Two-step onboarding:
//   step="name"     → user enters their display name, taps Continue
//   step="username" → user picks their @handle (with name shown small at top)
// Splitting these reduces cognitive load — one decision at a time, standard
// onboarding pattern across modern social apps.

export const UsernameScreen = ({ provider, session, onComplete }) => {
  const [step, setStep] = useState("name");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const [checking, setChecking] = useState(false);
  const [serverAvailable, setServerAvailable] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  const timerRef = useRef(null);
  // Cancel any pending username-availability check on unmount.
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const localError = (v) => {
    const val = v !== undefined ? v : value;
    if (!val) return null;
    if (val.length < 4) return "At least 4 characters";
    if (val.length > 20) return "Max 20 characters";
    if (!/^[a-z0-9_]+$/.test(val)) return "Only lowercase letters, numbers, and _";
    if (checkProfanity(val)) return "Username contains inappropriate language";
    if (TAKEN_USERNAMES.has(val)) return "Username already taken";
    return null;
  };

  const handleChange = (e) => {
    const raw = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setValue(raw); setTouched(true); setServerAvailable(null); setError("");
    clearTimeout(timerRef.current);
    if (raw.length >= 4) {
      setChecking(true);
      timerRef.current = setTimeout(async () => {
        if (localError(raw)) { setChecking(false); return; }
        const res = await API.checkUsername(raw);
        setServerAvailable(res ? res.available : !TAKEN_USERNAMES.has(raw));
        setChecking(false);
      }, 500);
    } else { setChecking(false); }
  };

  const localErr = touched ? localError(value) : null;
  const nameHasProfanity = !!(name && checkProfanity(name));
  const isAvailable = !localErr && serverAvailable === true && !checking && !nameHasProfanity;
  const showError = localErr || (touched && serverAvailable === false && !checking);
  const errorMsg = localErr || (serverAvailable === false ? "Username already taken" : "");

  const handleContinueFromName = () => {
    const trimmed = name.trim();
    if (!trimmed) { setNameError("Please enter your name"); return; }
    if (trimmed.length < 2) { setNameError("Name must be at least 2 characters"); return; }
    if (checkProfanity(trimmed)) { setNameError("Name contains inappropriate language"); return; }
    setNameError("");
    setStep("username");
  };

  const handleSubmit = async () => {
    if (!isAvailable) return;
    if (session) {
      try { await API.setUsername(value, session); }
      catch (e) { setError(e.message || "Could not claim username"); return; }
    }
    TAKEN_USERNAMES.add(value);
    setConfirmed(true);
    setTimeout(() => onComplete(value, name.trim()), 900);
  };

  if (confirmed) return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 12 }}>
      <div style={{ fontSize: 48 }}>🎬</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: W.accent, fontFamily: "monospace" }}>@{value}</div>
      <div style={{ fontSize: 12, color: W.dim, fontFamily: "monospace" }}>Welcome to RATED</div>
    </div>
  );

  // ───── STEP 1: Name ─────
  if (step === "name") {
    const nameValid = name.trim().length >= 2 && !checkProfanity(name);
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 28px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: W.accent, fontFamily: "monospace", letterSpacing: -1, marginBottom: 16 }}>RATED</div>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: W.card, border: `2px solid ${W.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, margin: "0 auto 14px" }}>👋</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: W.text, fontFamily: "monospace" }}>What's your name?</div>
          <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", marginTop: 8, lineHeight: 1.6 }}>Signed in with {provider === "apple" ? "Apple" : "Google"}.<br />This is how you'll appear on your profile.</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace" }}>YOUR NAME</div>
            <div style={{ fontSize: 9, color: name.length >= 27 ? W.accent : W.dim, fontFamily: "monospace" }}>{name.length} / 30</div>
          </div>
          <input value={name} onChange={(e) => { setName(e.target.value); setNameError(""); }} placeholder="e.g. Stephanie" maxLength={30}
            autoFocus enterKeyHint="next"
            onKeyDown={(e) => { if (e.key === "Enter" && nameValid) { e.preventDefault(); handleContinueFromName(); } }}
            style={{ width: "100%", background: W.card, border: `1px solid ${nameError || (name && checkProfanity(name)) ? W.accent : W.border}`, borderRadius: 12, padding: "13px 14px", fontSize: 14, color: W.text, fontFamily: "monospace", outline: "none", boxSizing: "border-box", transition: "border-color 0.15s" }} />
          <div style={{ fontSize: 9, fontFamily: "monospace", marginTop: 6, color: nameError || (name && checkProfanity(name)) ? W.accent : W.dim, lineHeight: 1.5 }}>
            {nameError ? `✗ ${nameError}` : (name && checkProfanity(name)) ? "✗ Name contains inappropriate language" : "Can be your real name or a nickname · changeable later"}
          </div>
        </div>
        <TapTarget onClick={handleContinueFromName} label="Continue to username" minTap={false}
          style={{ background: nameValid ? W.accent : W.card, border: nameValid ? "none" : `1px solid ${W.border}`, color: nameValid ? "#fff" : W.dim, borderRadius: 12, padding: "13px", textAlign: "center", fontSize: 13, fontWeight: 700, fontFamily: "monospace", opacity: nameValid ? 1 : 0.5, transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 48 }}>
          CONTINUE →
        </TapTarget>
      </div>
    );
  }

  // ───── STEP 2: Username ─────
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 28px" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: W.accent, fontFamily: "monospace", letterSpacing: -1, marginBottom: 12 }}>RATED</div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: W.card, border: `1px solid ${W.border}`, marginBottom: 14 }}>
          <span style={{ fontSize: 11, color: W.dim, fontFamily: "monospace" }}>Hi,</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>{name.trim()}</span>
          <TapTarget onClick={() => setStep("name")} label="Edit name" minTap={false}
            style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", padding: "2px 4px", borderRadius: 4 }}>
            <span aria-hidden="true">✎</span>
          </TapTarget>
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: W.text, fontFamily: "monospace" }}>Now pick a username</div>
        <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", marginTop: 8, lineHeight: 1.6 }}>This is your unique @handle on RATED.</div>
      </div>
      <div style={{ position: "relative", marginBottom: 8 }}>
        <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: W.dim, fontFamily: "monospace", pointerEvents: "none" }}>@</div>
        <input value={value} onChange={handleChange} onBlur={() => setTouched(true)} placeholder="username" maxLength={20} autoFocus
          enterKeyHint="go"
          onKeyDown={(e) => { if (e.key === "Enter" && isAvailable) { e.preventDefault(); handleSubmit(); } }}
          style={{ width: "100%", background: W.card, border: `1.5px solid ${showError ? W.accent : isAvailable ? W.green : W.border}`, borderRadius: 12, padding: "13px 42px 13px 30px", fontSize: 14, color: W.text, fontFamily: "monospace", outline: "none", letterSpacing: 0.5, transition: "border-color 0.15s", boxSizing: "border-box" }} />
        <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 14 }}>
          {checking && <span style={{ color: W.dim, fontSize: 11, fontFamily: "monospace" }}>...</span>}
          {!checking && isAvailable && <span style={{ color: W.green }}>✓</span>}
          {!checking && showError && value.length > 0 && <span style={{ color: W.accent }}>✗</span>}
        </div>
      </div>
      <div style={{ marginBottom: 16, paddingLeft: 2, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", lineHeight: 1.5 }}>4–20 chars · lowercase letters, numbers, underscore only</div>
        {!checking && showError && <div style={{ fontSize: 10, color: W.accent, fontFamily: "monospace" }}>✗ {errorMsg}</div>}
        {!checking && isAvailable && <div style={{ fontSize: 10, color: W.green, fontFamily: "monospace" }}>@{value} is available ✓</div>}
        {error && <div style={{ fontSize: 10, color: W.accent, fontFamily: "monospace" }}>{error}</div>}
      </div>
      {!checking && errorMsg === "Username already taken" && value.length >= 4 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", letterSpacing: 1, marginBottom: 6 }}>TRY ONE OF THESE</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[`${value}_`, `${value}1`, `${value}42`, `the_${value}`].filter((s) => !TAKEN_USERNAMES.has(s) && s.length <= 20).slice(0, 4).map((s) => (
              <div key={s} onClick={() => { setValue(s); setTouched(true); setChecking(true); setServerAvailable(null); setTimeout(async () => { const r = await API.checkUsername(s); setServerAvailable(r ? r.available : true); setChecking(false); }, 400); }}
                style={{ padding: "5px 12px", borderRadius: 10, background: W.card, border: `1px solid ${W.border}`, fontSize: 10, fontFamily: "monospace", color: W.dim, cursor: "pointer" }}>@{s}</div>
            ))}
          </div>
        </div>
      )}
      <TapTarget onClick={handleSubmit} label={`Claim @${value || "username"}`} minTap={false}
        style={{ background: isAvailable ? W.accent : W.card, border: isAvailable ? "none" : `1px solid ${W.border}`, color: isAvailable ? "#fff" : W.dim, borderRadius: 12, padding: "13px", textAlign: "center", fontSize: 13, fontWeight: 700, fontFamily: "monospace", opacity: isAvailable ? 1 : 0.5, transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 48 }}>
        CLAIM @{value || "username"} →
      </TapTarget>
      <div style={{ textAlign: "center", marginTop: 14, fontSize: 9, color: W.dim, fontFamily: "monospace", lineHeight: 1.6 }}>Your username is public · You can change it once every 30 days</div>
    </div>
  );
};
