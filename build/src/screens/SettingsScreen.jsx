import { useEffect, useRef, useState } from "react";

import { Badge } from "../components/Badge";
import { CropperModal } from "../components/CropperModal";
import { TapTarget } from "../components/TapTarget";
import { API } from "../lib/api";
import { haptic } from "../lib/haptic";
import { useShareInvite } from "../lib/hooks";
import { USER_PROFILES } from "../lib/mockData";
import { checkProfanity } from "../lib/profanity";
import { TAKEN_USERNAMES } from "../lib/usernames";
import { W } from "../theme";
import { NotificationSettings } from "./NotificationSettings";

export const SettingsScreen = ({
  onBack,
  username, displayName, userBio, profilePic, isPrivate,
  onUpdateUsername, onUpdatePrivacy, onUpdateDisplayName, onUpdateBio, onUpdateProfilePic,
  initialSection = null,
  blockedUsers = new Set(), onUnblock,
  onSignOut, onDeleteAccount,
  themeMode = "dark", fontScale = 1.0, onSetThemeMode, onSetFontScale,
  lastUsernameChangeTs = null, onUsernameChanged,
  showToast,
}) => {
  const [section, setSection] = useState(initialSection);
  const [newUsername, setNewUsername] = useState(username);
  const [newDisplayName, setNewDisplayName] = useState(displayName || "");
  const [newBio, setNewBio] = useState(userBio || "");
  const [savedProfile, setSavedProfile] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState(null);
  const [savingUsername, setSavingUsername] = useState(false);
  const [savedUsername, setSavedUsername] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1); // 1=warning, 2=confirm text, 3=deleting
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const timerRef = useRef(null);
  // Cancel any pending username-availability check on unmount.
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const { inviteUrl, shareInvite, emailInvite, smsInvite } = useShareInvite(username, showToast);
  // Phone Contacts stub — real impl needs a native app (React Native +
  // hash-based matching). TODO: in React Native, use expo-contacts /
  // react-native-contacts. Hash each email/phone (SHA-256 with a per-user
  // salt) and POST hashes to /users/me/find_friends.
  const handleSyncContactsSettings = () => {
    haptic("light");
    showToast && showToast("Contact sync is available in the RATED mobile app", "ok");
  };

  // Profile-pic flow:
  //   1. User picks a file → set pendingCropSrc to the raw dataURL
  //   2. CropperModal renders → user crops, taps "Use Photo"
  //   3. Cropped dataURL → onUpdateProfilePic, modal closes
  const [pendingCropSrc, setPendingCropSrc] = useState(null);
  const handleProfilePicChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPendingCropSrc(ev.target.result);
    reader.readAsDataURL(file);
    // Reset the input so picking the same file again still triggers onChange.
    e.target.value = "";
  };

  const [profileError, setProfileError] = useState(null);

  const saveProfile = () => {
    if (checkProfanity(newDisplayName)) {
      setProfileError("Display name contains inappropriate language. Please revise it.");
      return;
    }
    if (checkProfanity(newBio)) {
      setProfileError("Bio contains inappropriate language. Please revise it.");
      return;
    }
    setProfileError(null);
    onUpdateDisplayName(newDisplayName.trim());
    onUpdateBio(newBio.trim());
    setSavedProfile(true);
    setTimeout(() => setSavedProfile(false), 2000);
  };

  const checkNew = (val) => {
    const raw = val.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setNewUsername(raw); setSavedUsername(false);
    clearTimeout(timerRef.current);
    if (raw === username) { setUsernameStatus("same"); return; }
    if (raw.length < 4)   { setUsernameStatus("invalid"); return; }
    if (checkProfanity(raw)) { setUsernameStatus("profane"); return; }
    setUsernameStatus("checking");
    timerRef.current = setTimeout(async () => {
      const res = await API.checkUsername(raw);
      setUsernameStatus((res ? res.available : !TAKEN_USERNAMES.has(raw)) ? "available" : "taken");
    }, 500);
  };

  // Username change rate limit: once per 30 days.
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const daysUntilNextChange = lastUsernameChangeTs
    ? Math.max(0, Math.ceil((lastUsernameChangeTs + THIRTY_DAYS_MS - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;
  const usernameLocked = daysUntilNextChange > 0;

  const saveUsername = async () => {
    if (usernameStatus !== "available") return;
    if (usernameLocked) return;
    setSavingUsername(true);
    TAKEN_USERNAMES.add(newUsername);
    await new Promise((r) => setTimeout(r, 600));
    onUpdateUsername(newUsername);
    onUsernameChanged && onUsernameChanged();
    setSavingUsername(false);
    setSavedUsername(true);
    setUsernameStatus("same");
  };

  const SECTIONS = [
    { key: "account",       icon: "👤", label: "Account",       sub: "Username, connected accounts" },
    { key: "privacy",       icon: "🔒", label: "Privacy",       sub: "Account visibility, follow requests" },
    { key: "find_friends",  icon: "👥", label: "Find Friends",  sub: "Sync contacts, invite friends" },
    { key: "notifications", icon: "🔔", label: "Notifications", sub: "Push, email, activity alerts" },
    { key: "appearance",    icon: "🎨", label: "Appearance",    sub: "Theme, text size" },
    { key: "about",         icon: "ℹ️", label: "About",         sub: "Version 1.0.0 · Terms · Privacy" },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "10px 22px 8px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${W.border}`, flexShrink: 0 }}>
        <div onClick={section ? () => setSection(null) : onBack}
          style={{ fontSize: 11, color: W.dim, fontFamily: "monospace", cursor: "pointer", flexShrink: 0, minWidth: 40 }}>← {section ? "Settings" : "Back"}</div>
        <div style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 800, color: W.text, fontFamily: "monospace" }}>{section ? SECTIONS.find((s) => s.key === section)?.label : "SETTINGS"}</div>
        <div style={{ minWidth: 40 }}/>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 22px 24px", display: "flex", flexDirection: "column", gap: section ? 10 : 6 }}>

        {!section && <>
          {SECTIONS.map((s) => (
            <div key={s.key} onClick={() => setSection(s.key)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: W.card, borderRadius: 12, border: `1px solid ${W.border}`, cursor: "pointer" }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{s.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>{s.label}</div>
                  {s.key === "privacy" && isPrivate && <Badge color="purple">PRIVATE</Badge>}
                </div>
                <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 2 }}>{s.sub}</div>
              </div>
              <span style={{ color: W.dim, fontSize: 16 }}>›</span>
            </div>
          ))}
          <div onClick={() => onSignOut && onSignOut()}
            style={{ marginTop: 8, padding: "12px 14px", background: W.accentDim, border: `1px solid ${W.accent}33`, borderRadius: 12, cursor: "pointer", textAlign: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: W.accent, fontFamily: "monospace" }}>Sign Out</div>
          </div>
          <div style={{ textAlign: "center", marginTop: 4, fontSize: 9, color: W.dim, fontFamily: "monospace" }}>RATED v1.0.0</div>
        </>}

        {section === "account" && <>
          {/* Unified Account card — profile pic, name, bio, username */}
          <div style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${W.border}`, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, fontSize: 10, fontWeight: 700, color: W.dim, fontFamily: "monospace", letterSpacing: 1 }}>EDIT PROFILE</div>
              <div onClick={saveProfile} style={{ background: W.accent, color: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 11, fontWeight: 700, fontFamily: "monospace", cursor: "pointer" }}>
                {savedProfile ? "✓ SAVED" : "SAVE"}
              </div>
            </div>

            {profileError && <div style={{ margin: "8px 14px 0", padding: "6px 10px", borderRadius: 8, background: W.accentDim, border: `1px solid ${W.accent}`, fontSize: 9, color: W.accent, fontFamily: "monospace", lineHeight: 1.4 }}>✗ {profileError}</div>}

            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${W.border}`, display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ cursor: "pointer", position: "relative", flexShrink: 0 }}>
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleProfilePicChange}/>
                <div style={{ width: 46, height: 46, borderRadius: "50%", background: W.bg, border: `2px solid ${W.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, overflow: "hidden", position: "relative" }}>
                  {profilePic ? <img src={profilePic} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : "👤"}
                  <div style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: W.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", border: `2px solid ${W.card}` }}>✎</div>
                </div>
              </label>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: W.dim, fontFamily: "monospace", letterSpacing: 1 }}>DISPLAY NAME</div>
                  <div style={{ fontSize: 8, color: newDisplayName.length >= 27 ? W.accent : W.dim, fontFamily: "monospace" }}>{newDisplayName.length}/30</div>
                </div>
                <input value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} maxLength={30}
                  placeholder="Your full name" enterKeyHint="done"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } }}
                  style={{ width: "100%", background: W.bg, border: `1px solid ${W.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, color: W.text, fontFamily: "monospace", outline: "none", boxSizing: "border-box" }}/>
              </div>
            </div>

            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${W.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: W.dim, fontFamily: "monospace", letterSpacing: 1 }}>BIO</div>
                <div style={{ fontSize: 8, color: newBio.length >= 130 ? W.accent : W.dim, fontFamily: "monospace" }}>{newBio.length}/130</div>
              </div>
              <textarea value={newBio} onChange={(e) => setNewBio(e.target.value)} maxLength={130}
                placeholder="Tell people about your taste in film..."
                style={{ width: "100%", background: W.bg, border: `1px solid ${W.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 11, color: W.text, fontFamily: "monospace", outline: "none", resize: "none", minHeight: 54, lineHeight: 1.5, boxSizing: "border-box" }}/>
            </div>

            {/* Username — inline, smaller. */}
            <div style={{ padding: "10px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: W.dim, fontFamily: "monospace", letterSpacing: 1 }}>CHANGE USERNAME</div>
                <div style={{ fontSize: 8, color: usernameLocked ? W.orange : usernameStatus === "available" ? W.green : (usernameStatus === "taken" || usernameStatus === "invalid" || usernameStatus === "profane") ? W.accent : W.dim, fontFamily: "monospace" }}>
                  {usernameLocked && `🔒 ${daysUntilNextChange}d left`}
                  {!usernameLocked && usernameStatus === "available" && "available ✓"}
                  {!usernameLocked && usernameStatus === "taken"     && "taken"}
                  {!usernameLocked && usernameStatus === "invalid"   && "too short"}
                  {!usernameLocked && usernameStatus === "profane"   && "blocked"}
                  {!usernameLocked && (!usernameStatus || usernameStatus === "same") && (savedUsername ? "updated ✓" : "")}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: W.dim, fontFamily: "monospace", pointerEvents: "none" }}>@</div>
                  <input value={newUsername} onChange={(e) => checkNew(e.target.value)} maxLength={20} disabled={usernameLocked}
                    enterKeyHint="go"
                    onKeyDown={(e) => { if (e.key === "Enter" && usernameStatus === "available" && !usernameLocked) { e.preventDefault(); saveUsername(); } }}
                    style={{
                      width: "100%", background: W.bg,
                      border: `1px solid ${usernameLocked ? W.border : usernameStatus === "available" ? W.green : (usernameStatus === "taken" || usernameStatus === "invalid" || usernameStatus === "profane") ? W.accent : W.border}`,
                      borderRadius: 8, padding: "6px 10px 6px 22px",
                      fontSize: 12, color: usernameLocked ? W.dim : W.text, fontFamily: "monospace", outline: "none",
                      boxSizing: "border-box", opacity: usernameLocked ? 0.6 : 1, cursor: usernameLocked ? "not-allowed" : "text",
                    }}/>
                </div>
                <div onClick={saveUsername}
                  style={{
                    background: (usernameStatus === "available" && !usernameLocked) ? W.accent : W.card,
                    color: (usernameStatus === "available" && !usernameLocked) ? "#fff" : W.dim,
                    border: `1px solid ${(usernameStatus === "available" && !usernameLocked) ? W.accent : W.border}`,
                    borderRadius: 8, padding: "6px 12px", fontSize: 10, fontWeight: 700, fontFamily: "monospace",
                    cursor: (usernameStatus === "available" && !usernameLocked) ? "pointer" : "default",
                    opacity: (usernameStatus === "available" && !usernameLocked) ? 1 : 0.5, whiteSpace: "nowrap",
                  }}>
                  {savingUsername ? "..." : "SAVE"}
                </div>
              </div>
              {/* Always-visible 30-day rate-limit notice. The second sentence
                  only appears when the user is currently locked out, so the
                  copy stays accurate. */}
              <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 6, lineHeight: 1.5, padding: "8px 10px", background: usernameLocked ? W.orangeDim : W.bg, border: `1px solid ${usernameLocked ? W.orange + "33" : W.border}`, borderRadius: 8 }}>
                🔒 Username can be changed once every 30 days.{usernameLocked ? ` You can change it again in ${daysUntilNextChange} ${daysUntilNextChange === 1 ? "day" : "days"}.` : ""}
              </div>
            </div>
          </div>

          {/* Connected account — collapsed, read-only */}
          <div style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: "8px 14px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: W.bg, border: `1px solid ${W.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: W.text }}>G</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>user@gmail.com</div>
              <div style={{ fontSize: 8, color: W.dim, fontFamily: "monospace" }}>Connected via Google</div>
            </div>
            <span style={{ fontSize: 8, color: W.green, fontFamily: "monospace", fontWeight: 700 }}>✓</span>
          </div>

          {/* Danger zone */}
          <div onClick={() => { setShowDeleteModal(true); setDeleteStep(1); setDeleteConfirmText(""); }}
            style={{ marginTop: 8, background: W.card, border: `1px solid ${W.accent}44`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: W.accent, fontFamily: "monospace" }}>Delete Account</div>
              <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 2 }}>Permanently erase your account and all data</div>
            </div>
            <span style={{ color: W.accent, fontSize: 14 }}>›</span>
          </div>
        </>}

        {/* Delete account modal */}
        {showDeleteModal && <div onClick={() => deleteStep !== 3 && setShowDeleteModal(false)}
          style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 22px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: W.card, border: `1px solid ${W.accent}44`, borderRadius: 18, padding: "20px 18px", width: "100%" }}>

            {deleteStep === 1 && <>
              <div style={{ textAlign: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 32, marginBottom: 6 }}>⚠️</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: W.accent, fontFamily: "monospace" }}>Delete Account?</div>
              </div>
              <div style={{ background: W.bg, borderRadius: 10, padding: "12px", marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: W.text, fontFamily: "monospace", marginBottom: 8 }}>This will permanently:</div>
                {[
                  "Erase all your rankings and reviews",
                  "Remove your profile and username",
                  "Delete your watchlist and saved films",
                  "Remove you from your followers' feeds",
                  "Cancel any active subscriptions",
                ].map((t) => (
                  <div key={t} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 4 }}>
                    <span style={{ color: W.accent, fontSize: 10, fontFamily: "monospace", flexShrink: 0 }}>✗</span>
                    <span style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", lineHeight: 1.5 }}>{t}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", lineHeight: 1.6, marginBottom: 14, textAlign: "center" }}>
                This cannot be undone. Your username will become available for someone else after 30 days.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div onClick={() => setShowDeleteModal(false)} style={{ flex: 1, padding: "11px", borderRadius: 10, background: W.bg, border: `1px solid ${W.border}`, textAlign: "center", fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace", cursor: "pointer" }}>Keep Account</div>
                <div onClick={() => setDeleteStep(2)}    style={{ flex: 1, padding: "11px", borderRadius: 10, background: W.accent,                                            textAlign: "center", fontSize: 11, fontWeight: 700, color: "#fff",  fontFamily: "monospace", cursor: "pointer" }}>Continue</div>
              </div>
            </>}

            {deleteStep === 2 && <>
              <div style={{ textAlign: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>🔒</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: W.text, fontFamily: "monospace" }}>Final Confirmation</div>
              </div>
              <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", lineHeight: 1.6, marginBottom: 12, textAlign: "center" }}>
                To confirm, type <span style={{ color: W.accent, fontWeight: 700 }}>DELETE</span> below. This cannot be undone.
              </div>
              <input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="Type DELETE to confirm"
                style={{ width: "100%", background: W.bg, border: `1.5px solid ${deleteConfirmText === "DELETE" ? W.accent : W.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 12, color: W.text, fontFamily: "monospace", outline: "none", boxSizing: "border-box", marginBottom: 14, textAlign: "center", letterSpacing: 1 }}/>
              <div style={{ display: "flex", gap: 8 }}>
                <div onClick={() => { setShowDeleteModal(false); setDeleteStep(1); setDeleteConfirmText(""); }}
                  style={{ flex: 1, padding: "11px", borderRadius: 10, background: W.bg, border: `1px solid ${W.border}`, textAlign: "center", fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace", cursor: "pointer" }}>Cancel</div>
                <div onClick={() => {
                    if (deleteConfirmText === "DELETE") {
                      setDeleteStep(3);
                      setTimeout(() => { onDeleteAccount && onDeleteAccount(); }, 1800);
                    }
                  }}
                  style={{
                    flex: 1, padding: "11px", borderRadius: 10,
                    background: deleteConfirmText === "DELETE" ? W.accent : W.card,
                    textAlign: "center", fontSize: 11, fontWeight: 700,
                    color: deleteConfirmText === "DELETE" ? "#fff" : W.dim,
                    fontFamily: "monospace",
                    cursor: deleteConfirmText === "DELETE" ? "pointer" : "default",
                    opacity: deleteConfirmText === "DELETE" ? 1 : 0.5,
                  }}>Delete Forever</div>
              </div>
            </>}

            {deleteStep === 3 && <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>👋</div>
              <div style={{ fontSize: 13, fontWeight: 900, color: W.text, fontFamily: "monospace", marginBottom: 6 }}>Account Deleted</div>
              <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", lineHeight: 1.5 }}>Your data is being erased. Signing you out...</div>
            </div>}

          </div>
        </div>}

        {section === "privacy" && <>
          <div style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "14px", borderBottom: `1px solid ${W.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>Private Account</span>
                    {isPrivate && <Badge color="purple">ON</Badge>}
                  </div>
                  <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", lineHeight: 1.6 }}>Only approved followers can see your rankings, reviews, and activity.</div>
                </div>
                <div onClick={() => onUpdatePrivacy(!isPrivate)}
                  style={{ width: 44, height: 26, borderRadius: 13, background: isPrivate ? W.accent : W.border, position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: isPrivate ? 21 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }}/>
                </div>
              </div>
              {isPrivate && <div style={{ marginTop: 12, padding: "10px 12px", background: W.purpleDim, border: `1px solid ${W.purple}33`, borderRadius: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: W.purple, fontFamily: "monospace", marginBottom: 4 }}>🔒 Private Mode Active</div>
                <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", lineHeight: 1.6 }}>New followers need your approval before they can see your content. Existing approved followers are unaffected.</div>
              </div>}
            </div>
          </div>
          <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", lineHeight: 1.7, padding: "0 4px" }}>Switching to private won't remove existing followers. To remove a follower, go to your Followers list.</div>

          {/* Blocked users — tappable row opens modal */}
          <div onClick={() => setShowBlockedModal(true)}
            style={{ marginTop: 14, background: W.card, border: `1px solid ${W.border}`, borderRadius: 14, padding: "14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 18 }}>🚫</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>Blocked Users</div>
              <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 2 }}>{blockedUsers.size === 0 ? "You haven't blocked anyone" : `${blockedUsers.size} blocked`}</div>
            </div>
            <span style={{ color: W.dim, fontSize: 16 }}>›</span>
          </div>
        </>}

        {showBlockedModal && <div onClick={() => setShowBlockedModal(false)}
          style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 60, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: W.bg, borderRadius: "20px 20px 0 0", padding: "18px 20px 24px", maxHeight: "75%", overflowY: "auto", borderTop: `1px solid ${W.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>🚫</span>
                <div style={{ fontSize: 13, fontWeight: 800, color: W.text, fontFamily: "monospace" }}>Blocked Users</div>
                <span style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", fontWeight: 700 }}>{blockedUsers.size}</span>
              </div>
              <div onClick={() => setShowBlockedModal(false)} style={{ fontSize: 16, color: W.dim, cursor: "pointer" }}>✕</div>
            </div>
            <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", lineHeight: 1.6, marginBottom: 14 }}>
              People you've blocked can't see your profile, posts, or reviews. They also can't follow you or send you notifications.
            </div>
            {blockedUsers.size === 0 ? (
              <div style={{ textAlign: "center", padding: "28px 0" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>🌿</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: W.text, fontFamily: "monospace", marginBottom: 4 }}>Nobody blocked</div>
                <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace" }}>You haven't blocked anyone yet.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {Array.from(blockedUsers).map((handle) => {
                  const prof = USER_PROFILES[handle];
                  const avatar = prof?.avatar || handle[1]?.toUpperCase() || "?";
                  return (
                    <div key={handle} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: W.card, border: `1px solid ${W.border}`, borderRadius: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: W.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: W.text, fontFamily: "monospace", flexShrink: 0 }}>{avatar}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: W.accent, fontFamily: "monospace" }}>{handle}</div>
                        {prof?.bio && <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{prof.bio}</div>}
                      </div>
                      <div onClick={() => onUnblock && onUnblock(handle)}
                        style={{ padding: "5px 12px", borderRadius: 8, background: W.card, border: `1px solid ${W.border}`, cursor: "pointer", fontSize: 10, fontWeight: 700, color: W.dim, fontFamily: "monospace", flexShrink: 0 }}>Unblock</div>
                    </div>
                  );
                })}
              </div>
            )}
            <div onClick={() => setShowBlockedModal(false)} style={{ marginTop: 14, padding: "11px", textAlign: "center", fontSize: 11, color: W.dim, fontFamily: "monospace", cursor: "pointer" }}>Close</div>
          </div>
        </div>}

        {section === "find_friends" && (
          <>
            <div style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 14, padding: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span aria-hidden="true" style={{ fontSize: 18 }}>👥</span>
                <div style={{ fontSize: 12, fontWeight: 800, color: W.text, fontFamily: "monospace" }}>Find People You Know</div>
              </div>
              <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", lineHeight: 1.6 }}>See which of your friends are already on RATED, or invite them to join. We never post on your behalf.</div>
            </div>

            <div style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 14, overflow: "hidden" }}>
              <TapTarget onClick={handleSyncContactsSettings} label="Sync phone contacts to find friends" minTap={false}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", minHeight: 60 }}>
                <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 10, background: W.bg, border: `1px solid ${W.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>📇</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>Phone Contacts</div>
                  <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 1 }}>Match emails and phone numbers privately</div>
                </div>
                <div aria-hidden="true" style={{ padding: "7px 12px", borderRadius: 8, background: W.accent, color: "#fff", fontSize: 10, fontWeight: 700, fontFamily: "monospace", flexShrink: 0 }}>Sync</div>
              </TapTarget>
            </div>

            <div style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 14, padding: "14px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: W.dim, fontFamily: "monospace", letterSpacing: 1, marginBottom: 10 }}>INVITE FRIENDS</div>
              <div style={{ display: "flex", gap: 8 }}>
                <TapTarget onClick={shareInvite} label="Share invite link" minTap={false}
                  style={{ flex: 1, padding: "10px", textAlign: "center", borderRadius: 10, background: W.bg, border: `1px solid ${W.border}`, fontSize: 10, fontWeight: 700, color: W.accent, fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 40 }}>
                  <span aria-hidden="true">🔗 </span>Share link
                </TapTarget>
                <TapTarget onClick={emailInvite} label="Invite via email" minTap={false}
                  style={{ flex: 1, padding: "10px", textAlign: "center", borderRadius: 10, background: W.bg, border: `1px solid ${W.border}`, fontSize: 10, fontWeight: 700, color: W.accent, fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 40 }}>
                  <span aria-hidden="true">✉️ </span>Email
                </TapTarget>
                <TapTarget onClick={smsInvite} label="Invite via SMS" minTap={false}
                  style={{ flex: 1, padding: "10px", textAlign: "center", borderRadius: 10, background: W.bg, border: `1px solid ${W.border}`, fontSize: 10, fontWeight: 700, color: W.accent, fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 40 }}>
                  <span aria-hidden="true">💬 </span>SMS
                </TapTarget>
              </div>
              <div style={{ fontSize: 8, color: W.dim, fontFamily: "monospace", marginTop: 10, textAlign: "center", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis" }}>Invite link: {inviteUrl}</div>
            </div>

            <div style={{ fontSize: 8, color: W.dim, fontFamily: "monospace", lineHeight: 1.7, padding: "0 4px", textAlign: "center" }}>RATED only uses contact info to match you with friends already on the app. Contact data stays private and is hashed before leaving your device. <span style={{ color: W.accent }}>Privacy Policy</span></div>
          </>
        )}

        {section === "notifications" && <NotificationSettings/>}

        {section === "appearance" && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: "14px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: W.dim, fontFamily: "monospace", letterSpacing: 1, marginBottom: 10 }}>THEME</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { key: "dark",   label: "🌙 Dark" },
                { key: "light",  label: "☀️ Light" },
                { key: "system", label: "⚙️ System" },
              ].map((t) => (
                <div key={t.key} onClick={() => onSetThemeMode && onSetThemeMode(t.key)}
                  style={{ flex: 1, padding: "9px 0", borderRadius: 8, textAlign: "center", fontSize: 10, fontWeight: 700, fontFamily: "monospace", cursor: "pointer", background: themeMode === t.key ? W.accentDim : W.bg, border: `1px solid ${themeMode === t.key ? W.accent : W.border}`, color: themeMode === t.key ? W.accent : W.dim }}>{t.label}</div>
              ))}
            </div>
            <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 10, lineHeight: 1.5 }}>System follows your device's iOS setting.</div>
          </div>
          <div style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: "14px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: W.dim, fontFamily: "monospace", letterSpacing: 1, marginBottom: 10 }}>TEXT SIZE</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { key: 0.9,  label: "A", fsize: 11 },
                { key: 1.0,  label: "A", fsize: 13 },
                { key: 1.15, label: "A", fsize: 15 },
                { key: 1.3,  label: "A", fsize: 17 },
              ].map((t) => (
                <div key={t.key} onClick={() => onSetFontScale && onSetFontScale(t.key)}
                  style={{ flex: 1, padding: "9px 0", borderRadius: 8, textAlign: "center", fontWeight: 700, fontFamily: "monospace", cursor: "pointer", background: fontScale === t.key ? W.accentDim : W.bg, border: `1px solid ${fontScale === t.key ? W.accent : W.border}`, color: fontScale === t.key ? W.accent : W.dim, fontSize: t.fsize }}>{t.label}</div>
              ))}
            </div>
            <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 10, lineHeight: 1.5 }}>Scales all text. Current: {Math.round(fontScale * 100)}%</div>
          </div>
        </div>}

        {section === "about" && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[["Version", "1.0.0"], ["Build", "prototype"], ["Terms of Service", "rated.app/terms"], ["Privacy Policy", "rated.app/privacy"]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: W.card, borderRadius: 10, border: `1px solid ${W.border}` }}>
              <span style={{ fontSize: 11, color: W.dim, fontFamily: "monospace" }}>{k}</span>
              <span style={{ fontSize: 11, color: W.text, fontFamily: "monospace" }}>{v}</span>
            </div>
          ))}
        </div>}
      </div>
      {/* Cropper modal — mounted when the user picks a file */}
      {pendingCropSrc && <CropperModal
        src={pendingCropSrc}
        onSave={(croppedDataUrl) => {
          onUpdateProfilePic(croppedDataUrl);
          setPendingCropSrc(null);
          showToast && showToast("Photo updated", "ok");
        }}
        onCancel={() => setPendingCropSrc(null)}/>}
    </div>
  );
};
