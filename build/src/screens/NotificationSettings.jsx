import { useState } from "react";

import { Toggle } from "../components/Toggle";
import { W } from "../theme";

// Notification preferences. Three sections — push (in-app), email, and
// activity-derived alerts. State is local: persistence belongs to the parent
// SettingsScreen → backend pipeline once that wires up.
export const NotificationSettings = () => {
  const [push, setPush] = useState({
    new_follower: true, follow_req: true, watchlist_release: true,
    friend_ranked: true, friend_review: false, streak_reminder: true,
  });
  const [email, setEmail] = useState({
    weekly_digest: true, new_follower: false, watchlist_release: true, marketing: false,
  });
  const [activity, setActivity] = useState({
    likes: true, replies: true, rankings_milestone: true, streak_at_risk: true,
  });

  const Row = ({ label, sub, on, onToggle }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderBottom: `1px solid ${W.border}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: W.text, fontFamily: "monospace" }}>{label}</div>
        {sub && <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 2 }}>{sub}</div>}
      </div>
      <Toggle on={on} onToggle={onToggle}/>
    </div>
  );

  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: W.dim, fontFamily: "monospace", letterSpacing: 1, marginBottom: 6, paddingLeft: 2 }}>{title}</div>
      <div style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 14, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );

  return (
    <div>
      <Section title="PUSH NOTIFICATIONS">
        <Row label="New follower"          sub="When someone follows you"                   on={push.new_follower}      onToggle={() => setPush((p) => ({ ...p, new_follower: !p.new_follower }))}/>
        <Row label="Follow requests"       sub="When someone requests to follow you"        on={push.follow_req}        onToggle={() => setPush((p) => ({ ...p, follow_req: !p.follow_req }))}/>
        <Row label="Watchlist releases"    sub="When a saved upcoming movie is out"         on={push.watchlist_release} onToggle={() => setPush((p) => ({ ...p, watchlist_release: !p.watchlist_release }))}/>
        <Row label="Friend ranked a movie" sub="Activity from people you follow"            on={push.friend_ranked}     onToggle={() => setPush((p) => ({ ...p, friend_ranked: !p.friend_ranked }))}/>
        <Row label="Friend wrote a review" sub="When someone you follow posts a review"     on={push.friend_review}     onToggle={() => setPush((p) => ({ ...p, friend_review: !p.friend_review }))}/>
        <Row label="Streak reminder"       sub="Reminder to rank before your streak breaks" on={push.streak_reminder}   onToggle={() => setPush((p) => ({ ...p, streak_reminder: !p.streak_reminder }))}/>
      </Section>

      <Section title="EMAIL ALERTS">
        <Row label="Weekly digest"     sub="Your ranking activity summary every Monday" on={email.weekly_digest}      onToggle={() => setEmail((p) => ({ ...p, weekly_digest: !p.weekly_digest }))}/>
        <Row label="New follower"      sub="Email when someone follows you"             on={email.new_follower}       onToggle={() => setEmail((p) => ({ ...p, new_follower: !p.new_follower }))}/>
        <Row label="Watchlist release" sub="Email when a watchlist movie drops"         on={email.watchlist_release}  onToggle={() => setEmail((p) => ({ ...p, watchlist_release: !p.watchlist_release }))}/>
        <Row label="Product updates"   sub="News and feature announcements from Rated"  on={email.marketing}          onToggle={() => setEmail((p) => ({ ...p, marketing: !p.marketing }))}/>
      </Section>

      <Section title="ACTIVITY ALERTS">
        <Row label="Likes"              sub="When someone likes your review or ranking" on={activity.likes}              onToggle={() => setActivity((p) => ({ ...p, likes: !p.likes }))}/>
        <Row label="Replies"            sub="When someone replies to your activity"     on={activity.replies}            onToggle={() => setActivity((p) => ({ ...p, replies: !p.replies }))}/>
        <Row label="Ranking milestones" sub="When you hit 10, 50, 100 films ranked"     on={activity.rankings_milestone} onToggle={() => setActivity((p) => ({ ...p, rankings_milestone: !p.rankings_milestone }))}/>
        <Row label="Streak at risk"     sub="Alert 1 day before your streak resets"     on={activity.streak_at_risk}     onToggle={() => setActivity((p) => ({ ...p, streak_at_risk: !p.streak_at_risk }))}/>
      </Section>
    </div>
  );
};
