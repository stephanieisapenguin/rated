import { useEffect, useState } from "react";

import { PullIndicator } from "../components/PullIndicator";
import { ScreenWithNav } from "../components/ScreenWithNav";
import { TapTarget } from "../components/TapTarget";
import { useConfirm } from "../components/useConfirm";
import { API } from "../lib/api";
import { haptic } from "../lib/haptic";
import { usePullToRefresh } from "../lib/hooks";
import { MOCK_NOTIFICATIONS } from "../lib/mockData";
import { formatRelativeTime, parseRelativeToTs } from "../lib/time";
import { W } from "../theme";

// Map a backend notification row to the shape this screen renders.
// Backend types: "follow" | "follow_request" | "review" | "rank"
// Frontend types: "follow" | "follow_req" | "watchlist" (the existing UI
// expects these). Other backend events fall through to a generic "follow"
// renderer to keep the UI from breaking on unknown types.
const adaptBackend = (row) => {
  const handle = row.actor?.username ? `@${row.actor.username}` : null;
  const initial = (row.actor?.username || row.actor?.name || "?")[0]?.toUpperCase() || "?";
  let type = "follow";
  let text = row.body || "";
  if (row.type === "follow") { type = "follow"; text = text || "started following you"; }
  else if (row.type === "follow_request") { type = "follow_req"; text = text || "requested to follow you"; }
  else if (row.type === "review") { type = "follow"; text = text || "wrote a review"; }
  else if (row.type === "rank") { type = "follow"; text = text || "ranked a movie"; }
  return {
    id: row.id,
    type,
    read: row.read,
    user: handle,
    avatar: initial,
    text,
    ts: row.created_at ? row.created_at * 1000 : Date.now(),
    time: "",
  };
};

export const NotificationsScreen = ({
  onNav, userId, isPrivate, onMarkAllRead,
  blockedUsers = new Set(), toggleFollowHandle, followingHandles = new Set(),
  approveFollower, onSelectUser, rateLimitedFollow,
}) => {
  const [notifications, setNotifications] = useState(() => MOCK_NOTIFICATIONS.map((n) => ({ ...n, ts: parseRelativeToTs(n.time) })));
  const [tab, setTab] = useState("all");
  const { confirm, ConfirmDialog } = useConfirm();

  // Fetch from backend on mount + on every pull-to-refresh. Falls back to
  // the mock seed if the API is unreachable so the screen still demos.
  const fetchFromBackend = async () => {
    if (!userId) return;
    const res = await API.getNotifications(userId);
    if (res?.items) setNotifications(res.items.map(adaptBackend));
  };

  useEffect(() => {
    fetchFromBackend();
    // Mark everything read in one shot — backend writes + local state mirrors.
    if (userId) API.markAllNotificationsRead(userId).catch(() => { /* best-effort */ });
    setNotifications((p) => p.map((n) => ({ ...n, read: true })));
    onMarkAllRead && onMarkAllRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const markRead = (id) => {
    setNotifications((p) => p.map((n) => (n.id === id ? { ...n, read: true } : n)));
    if (userId) API.markNotificationRead(userId, id).catch(() => { /* swallow */ });
  };

  const approveRequest = (id) => {
    const notif = notifications.find((n) => n.id === id);
    setNotifications((p) => p.map((n) => (n.id === id ? { ...n, type: "follow", read: true, text: "is now following you" } : n)));
    if (notif?.user && approveFollower) approveFollower(notif.user);
  };
  const declineRequest = (id) => {
    const notif = notifications.find((n) => n.id === id);
    confirm({
      icon: "✕",
      title: "Decline follow request?",
      message: notif?.user
        ? `${notif.user} won't be notified, but they can send another request.`
        : "This person will be able to send another follow request.",
      confirmLabel: "Decline",
      onConfirm: () => {
        setNotifications((p) => p.filter((n) => n.id !== id));
        if (userId) API.deleteNotification(userId, id).catch(() => { /* swallow */ });
      },
    });
  };

  const notBlocked = (n) => !n.user || !blockedUsers.has(n.user);
  const filtered = (tab === "all" ? notifications
    : tab === "followers" ? notifications.filter((n) => n.type === "follow" || n.type === "follow_req")
    : notifications.filter((n) => n.type === "watchlist")).filter(notBlocked);

  const unread = notifications.filter((n) => !n.read).length;
  const pendingRequests = notifications.filter((n) => n.type === "follow_req" && notBlocked(n));

  // Pull-to-refresh re-fetches from backend.
  const handleRefresh = async () => {
    await fetchFromBackend();
  };
  const { pullDist, isRefreshing, pullHandlers } = usePullToRefresh(handleRefresh);

  return (
    <ScreenWithNav active="notifications" onNav={onNav}
      scrollHandlers={pullHandlers}
      pullIndicator={<PullIndicator pullDist={pullDist} isRefreshing={isRefreshing}/>}>
      <div style={{ padding: "8px 22px 6px", display: "flex", alignItems: "center", gap: 10 }}>
        <TapTarget onClick={() => onNav("home")} label="Go back to home" minTap={false}
          style={{ fontSize: 11, color: W.dim, fontFamily: "monospace", flexShrink: 0, padding: "8px 4px", minHeight: 36, display: "flex", alignItems: "center" }}>
          ← Back
        </TapTarget>
        <h1 style={{ fontSize: 13, fontWeight: 800, color: W.text, fontFamily: "monospace", margin: 0 }}>🔔 NOTIFICATIONS</h1>
      </div>

      {/* Top banner — only when private and there are pending requests. */}
      {isPrivate && pendingRequests.length > 0 && <div style={{ margin: "0 22px 8px", background: W.purpleDim, border: `1px solid ${W.purple}44`, borderRadius: 12, padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span aria-hidden="true" style={{ fontSize: 14 }}>⏳</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: W.purple, fontFamily: "monospace" }}>Follow Requests</div>
            <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 1 }}>{pendingRequests.length} people waiting for approval</div>
          </div>
        </div>
        {pendingRequests.map((n) => (
          <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 6, borderTop: `1px solid ${W.purple}22` }}>
            <div aria-hidden="true" style={{ width: 28, height: 28, borderRadius: "50%", background: W.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: W.text, fontFamily: "monospace", flexShrink: 0 }}>{n.avatar}</div>
            <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: W.accent, fontFamily: "monospace" }}>{n.user}</span>
            <TapTarget onClick={() => approveRequest(n.id)} label={`Approve follow request from ${n.user}`} minTap={false}
              style={{ padding: "8px 12px", borderRadius: 8, background: W.accent, fontSize: 9, fontWeight: 700, color: "#fff", fontFamily: "monospace", minWidth: 40, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span aria-hidden="true">✓</span>
            </TapTarget>
            <TapTarget onClick={() => declineRequest(n.id)} label={`Decline follow request from ${n.user}`} minTap={false}
              style={{ padding: "8px 12px", borderRadius: 8, background: W.card, border: `1px solid ${W.border}`, fontSize: 9, fontWeight: 700, color: W.dim, fontFamily: "monospace", minWidth: 40, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span aria-hidden="true">✕</span>
            </TapTarget>
          </div>
        ))}
      </div>}

      {/* Tabs */}
      <div role="tablist" aria-label="Notification categories" style={{ display: "flex", borderBottom: `1px solid ${W.border}`, margin: "0 22px" }}>
        {[{ key: "all", label: "All" }, { key: "followers", label: "Followers" }, { key: "watchlist", label: "Watchlist" }].map((t) => {
          const isActive = tab === t.key;
          const unreadCountForTab =
            t.key === "all" ? unread :
            t.key === "followers" ? notifications.filter((n) => !n.read && (n.type === "follow" || n.type === "follow_req")).length :
            notifications.filter((n) => !n.read && n.type === "watchlist").length;
          const tabLabel = unreadCountForTab > 0 ? `${t.label}, ${unreadCountForTab} unread` : t.label;
          return (
            <TapTarget key={t.key} role="tab" aria-selected={isActive} onClick={() => setTab(t.key)} label={tabLabel} minTap={false}
              style={{ flex: 1, textAlign: "center", padding: "9px 0", fontSize: 9, fontFamily: "monospace", fontWeight: 600, color: isActive ? W.accent : W.dim, borderBottom: `2px solid ${isActive ? W.accent : "transparent"}`, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 36 }}>
              {t.label}
              {t.key === "all" && unread > 0 && <span aria-hidden="true" style={{ marginLeft: 4, background: W.accent, color: "#fff", borderRadius: 10, padding: "1px 5px", fontSize: 7, fontWeight: 900 }}>{unread}</span>}
              {t.key === "followers" && unreadCountForTab > 0 && <span aria-hidden="true" style={{ marginLeft: 4, background: W.accent, color: "#fff", borderRadius: 10, padding: "1px 5px", fontSize: 7, fontWeight: 900 }}>{unreadCountForTab}</span>}
              {t.key === "watchlist" && unreadCountForTab > 0 && <span aria-hidden="true" style={{ marginLeft: 4, background: W.blue, color: "#fff", borderRadius: 10, padding: "1px 5px", fontSize: 7, fontWeight: 900 }}>{unreadCountForTab}</span>}
            </TapTarget>
          );
        })}
      </div>

      <div role="tabpanel" aria-label={`${tab} notifications`} style={{ padding: "6px 22px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
        {tab === "followers" && pendingRequests.length > 0 && <div style={{ background: W.purpleDim, border: `1px solid ${W.purple}44`, borderRadius: 12, padding: "10px 14px", marginBottom: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: W.purple, fontFamily: "monospace", marginBottom: 8 }}>⏳ PENDING REQUESTS · {pendingRequests.length}</div>
          {pendingRequests.map((n) => (
            <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 6, borderTop: `1px solid ${W.purple}22` }}>
              <div aria-hidden="true" style={{ width: 28, height: 28, borderRadius: "50%", background: W.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: W.text, fontFamily: "monospace", flexShrink: 0 }}>{n.avatar}</div>
              <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: W.accent, fontFamily: "monospace" }}>{n.user}</span>
              <TapTarget onClick={() => approveRequest(n.id)} label={`Approve follow request from ${n.user}`} minTap={false}
                style={{ width: 40, height: 40, borderRadius: "50%", background: W.greenDim, border: `1px solid ${W.green}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                <span aria-hidden="true">✓</span>
              </TapTarget>
              <TapTarget onClick={() => declineRequest(n.id)} label={`Decline follow request from ${n.user}`} minTap={false}
                style={{ width: 40, height: 40, borderRadius: "50%", background: W.accentDim, border: `1px solid ${W.accent}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                <span aria-hidden="true">✕</span>
              </TapTarget>
            </div>
          ))}
        </div>}
        {filtered.length === 0 && !(tab === "followers" && pendingRequests.length > 0) && <div role="status" style={{ textAlign: "center", padding: "32px 0" }}>
          <div aria-hidden="true" style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>All caught up</div>
          <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", marginTop: 6 }}>No notifications in this category</div>
        </div>}

        {filtered.map((n) => {
          const notifText = `${n.user || n.movie || ""} ${n.text}${n.read ? "" : ", unread"}`.trim();
          return (
            <TapTarget key={n.id} onClick={() => { markRead(n.id); if (n.type === "follow_req") setTab("followers"); }} label={notifText} minTap={false}
              style={{ background: n.read ? W.card : `${W.accent}08`, border: `1px solid ${n.read ? W.border : W.accent + "33"}`, borderRadius: 12, padding: 12, display: "block", textAlign: "left" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                {n.avatar ? (
                  <TapTarget onClick={(e) => { if (n.user) { e.stopPropagation(); haptic("light"); onSelectUser && onSelectUser(n.user); } }}
                    label={n.user ? `View ${n.user}'s profile` : undefined} minTap={false}
                    style={{ width: 36, height: 36, borderRadius: "50%", background: W.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: W.text, fontFamily: "monospace", flexShrink: 0, position: "relative" }}>
                    <span aria-hidden="true">{n.avatar}</span>
                    <div aria-hidden="true" style={{ position: "absolute", bottom: -2, right: -2, fontSize: 12, lineHeight: 1 }}>
                      {n.type === "follow" ? "👤" : n.type === "follow_req" ? "⏳" : ""}
                    </div>
                  </TapTarget>
                ) : (
                  <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 10, background: W.blueDim, border: `1px solid ${W.blue}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{n.icon}</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: W.text, fontFamily: "monospace", lineHeight: 1.5 }}>
                    {n.user && <span onClick={(e) => { e.stopPropagation(); haptic("light"); onSelectUser && onSelectUser(n.user); }} style={{ fontWeight: 700, color: W.accent, cursor: onSelectUser ? "pointer" : "default" }}>{n.user} </span>}
                    {n.movie && <span style={{ fontWeight: 700, color: W.gold }}>{n.movie} </span>}
                    <span style={{ color: W.dim }}>{n.text}</span>
                  </div>
                  <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 3 }}>{n.ts ? formatRelativeTime(n.ts) : n.time}</div>
                  {n.type === "follow_req" && isPrivate && <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <TapTarget onClick={(e) => { e.stopPropagation(); approveRequest(n.id); }} label={`Approve ${n.user}`} minTap={false}
                      style={{ flex: 1, background: W.accent, borderRadius: 8, padding: "9px 0", textAlign: "center", fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 36 }}>
                      <span aria-hidden="true">✓ </span>Approve
                    </TapTarget>
                    <TapTarget onClick={(e) => { e.stopPropagation(); declineRequest(n.id); }} label={`Decline ${n.user}`} minTap={false}
                      style={{ flex: 1, background: W.card, border: `1px solid ${W.border}`, borderRadius: 8, padding: "9px 0", textAlign: "center", fontSize: 10, fontWeight: 700, color: W.dim, fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 36 }}>
                      <span aria-hidden="true">✕ </span>Decline
                    </TapTarget>
                  </div>}
                  {/* Single unified Follow Back / Following — follow path is rate-limited
                      to match Everyone tab + Search; unfollow is intentionally instant. */}
                  {n.type === "follow" && n.user && (() => {
                    const following = followingHandles.has(n.user);
                    const onClick = (e) => {
                      e.stopPropagation();
                      if (following) {
                        toggleFollowHandle && toggleFollowHandle(n.user);
                      } else if (rateLimitedFollow) {
                        rateLimitedFollow(() => toggleFollowHandle && toggleFollowHandle(n.user));
                      } else {
                        toggleFollowHandle && toggleFollowHandle(n.user);
                      }
                    };
                    return (
                      <TapTarget onClick={onClick}
                        label={following ? `Unfollow ${n.user}` : `Follow ${n.user} back`}
                        minTap={false}
                        style={{ marginTop: 6, background: following ? W.accentDim : W.accent, border: following ? `1px solid ${W.accent}` : "none", borderRadius: 6, padding: following ? "5px 10px" : "6px 10px", fontSize: 9, fontWeight: 700, color: following ? W.accent : "#fff", fontFamily: "monospace", display: "inline-flex", alignItems: "center", minHeight: 28, width: "auto" }}>
                        {following ? "✓ Following" : "+ Follow Back"}
                      </TapTarget>
                    );
                  })()}
                </div>
                {!n.read && <div aria-label="Unread" role="img" style={{ width: 8, height: 8, borderRadius: "50%", background: W.accent, flexShrink: 0, marginTop: 4 }}/>}
              </div>
            </TapTarget>
          );
        })}
      </div>
      <ConfirmDialog/>
    </ScreenWithNav>
  );
};
