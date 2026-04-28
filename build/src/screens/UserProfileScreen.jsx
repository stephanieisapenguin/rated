import { useState } from "react";

import { Badge } from "../components/Badge";
import { Poster } from "../components/Poster";
import { ReportBlockMenu } from "../components/ReportBlockMenu";
import { useConfirm } from "../components/useConfirm";
import { haptic } from "../lib/haptic";
import { MOVIES, USER_PROFILES } from "../lib/mockData";
import { W } from "../theme";

export const UserProfileScreen = ({
  user, onBack, onSelectMovie,
  blockedUsers = new Set(), blockUser, reportContent,
  rateLimitedFollow,
  followingHandles = new Set(), toggleFollowHandle,
}) => {
  const [followRequested, setFollowRequested] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();
  const isFollowing = followingHandles.has(user);
  const p = USER_PROFILES[user] || {
    username: user?.replace("@", ""),
    avatar: user?.[1]?.toUpperCase() || "?",
    movies_rated: 0, streak: 0, badge: "", bio: "",
    followers: 0, following: 0, isPrivate: false,
  };
  const isPrivate = p.isPrivate === true;
  const canSeeContent = isFollowing;
  const isBlocked = blockedUsers.has(user);

  const handleFollow = () => {
    if (isFollowing) {
      confirm({
        icon: "👤",
        title: `Unfollow ${user}?`,
        message: "You'll stop seeing their posts in your Following feed. You can follow again anytime.",
        confirmLabel: "Unfollow",
        onConfirm: () => {
          toggleFollowHandle && toggleFollowHandle(user);
          setFollowRequested(false);
        },
      });
    } else if (isPrivate && followRequested) {
      // Cancel the request — not rate-limited.
      setFollowRequested(false);
    } else if (isPrivate && !followRequested) {
      // Private: send a follow request — counts against limit.
      if (rateLimitedFollow) rateLimitedFollow(() => setFollowRequested(true));
      else setFollowRequested(true);
    } else {
      // Public: follow immediately — counts against limit.
      if (rateLimitedFollow) rateLimitedFollow(() => toggleFollowHandle && toggleFollowHandle(user));
      else toggleFollowHandle && toggleFollowHandle(user);
    }
  };

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ padding: "10px 22px 6px", display: "flex", alignItems: "center", gap: 10 }}>
        <div onClick={onBack} style={{ fontSize: 11, color: W.dim, fontFamily: "monospace", cursor: "pointer" }}>← Back</div>
        <div style={{ flex: 1 }}/>
        <ReportBlockMenu
          targetType="user" targetId={user} targetLabel={user} targetUser={user}
          onReport={reportContent} onBlock={blockUser} blockedUsers={blockedUsers}
          size="md"/>
      </div>
      {isBlocked && <div style={{ margin: "0 22px 14px", padding: "12px 14px", background: W.accentDim, border: `1px solid ${W.accent}33`, borderRadius: 12, textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: W.accent, fontFamily: "monospace", marginBottom: 4 }}>🚫 You blocked this user</div>
        <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", lineHeight: 1.5 }}>Unblock them in Settings → Privacy to see their content.</div>
      </div>}
      <div style={{ padding: "0 22px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ width: 58, height: 58, borderRadius: "50%", background: W.card, border: `2px solid ${W.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, color: W.text, fontFamily: "monospace", flexShrink: 0 }}>{p.avatar}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: W.text, fontFamily: "monospace" }}>@{p.username}</span>
              {p.badge && <span style={{ fontSize: 16 }}>{p.badge}</span>}
              {isPrivate && <Badge color="purple">🔒 Private</Badge>}
            </div>
            {p.bio && <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", marginTop: 3 }}>{p.bio}</div>}
            {p.streak > 0 && <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 4 }}>
              <span>🔥</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: W.gold, fontFamily: "monospace" }}>{p.streak}-week streak</span>
            </div>}
          </div>
        </div>
        {/* Stats — hide counts when private and not following. */}
        <div style={{ display: "flex", gap: 0 }}>
          {[
            { n: (!isPrivate || canSeeContent) ? p.movies_rated : "—", l: "Ranked" },
            { n: p.followers + (isFollowing ? 1 : 0), l: "Followers" },
            { n: (!isPrivate || canSeeContent) ? p.following : "—", l: "Following" },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center", borderRight: i < 2 ? `1px solid ${W.border}` : "none" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: i === 0 ? W.accent : W.text, fontFamily: "monospace" }}>{s.n}</div>
              <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>{s.l}</div>
            </div>
          ))}
        </div>
        <div onClick={handleFollow}
          style={{
            background: isFollowing ? W.accentDim : followRequested ? W.card : W.accent,
            border: `1px solid ${isFollowing || followRequested ? W.accent : "transparent"}`,
            color: isFollowing || followRequested ? W.accent : "#fff",
            borderRadius: 12, padding: "10px", textAlign: "center", fontSize: 12, fontWeight: 700,
            fontFamily: "monospace", cursor: "pointer",
          }}>
          {isFollowing ? "✓ FOLLOWING" : followRequested ? "⏳ REQUESTED — tap to cancel" : "+ FOLLOW"}
        </div>
        {/* Lock wall: only when private AND not an approved follower. */}
        {isPrivate && !canSeeContent ? (
          <div style={{ textAlign: "center", padding: "28px 16px", background: W.card, border: `1px solid ${W.border}`, borderRadius: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🔒</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: W.text, fontFamily: "monospace", marginBottom: 6 }}>This account is private</div>
            <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", lineHeight: 1.7 }}>
              Follow {`@${p.username}`} to see their rankings, reviews, and activity.
              {followRequested && <div style={{ marginTop: 8, color: W.accent, fontWeight: 700 }}>Follow request sent — waiting for approval</div>}
            </div>
          </div>
        ) : (
          <UserContentTabs user={user} p={p} onSelectMovie={onSelectMovie}/>
        )}
      </div>
      <ConfirmDialog/>
    </div>
  );
};

// Rankings / Reviews / Activity tabs on another user's profile. Synthesizes
// content deterministically from the handle so the same user always shows the
// same content — replace with real backend lookups when ready.
const UserContentTabs = ({ user, p, onSelectMovie }) => {
  const [tab, setTab] = useState("rankings");
  const seed = (user || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rotateStart = seed % MOVIES.length;
  const userRankings = [];
  const count = Math.min(p.movies_rated || 0, MOVIES.length);
  for (let i = 0; i < count; i++) userRankings.push(MOVIES[(rotateStart + i) % MOVIES.length]);
  const reviewMovies = userRankings.slice(0, Math.min(2, Math.max(1, (seed % 3))));
  const reviewTexts = [
    "Absolutely floored. Direction, score, everything clicked.",
    "Overhyped in my opinion but still a solid watch.",
    "Couldn't look away. One of the best I've seen this year.",
    "The third act drags but the payoff makes it worthwhile.",
    "Not sure what all the fuss is about. Rewatched to be sure.",
  ];
  const userRatings = {};
  userRankings.forEach((m, i) => {
    userRatings[m.id] = Math.max(5, 10 - Math.floor(i / Math.max(userRankings.length / 6, 1)));
  });
  const activity = [];
  if (userRankings[0]) activity.push({ id: "ua-1", type: "ranking", movie: userRankings[0], time: "2d ago" });
  if (reviewMovies[0]) activity.push({ id: "ua-2", type: "review",  movie: reviewMovies[0], text: reviewTexts[seed % reviewTexts.length], rating: userRatings[reviewMovies[0].id], time: "4d ago" });
  if (userRankings[1]) activity.push({ id: "ua-3", type: "ranking", movie: userRankings[1], time: "1w ago" });
  if (userRankings[2]) activity.push({ id: "ua-4", type: "save",    movie: userRankings[2], time: "2w ago" });

  return (
    <>
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${W.border}`, marginBottom: 6 }}>
        {[
          { key: "rankings", label: `Rankings · ${userRankings.length}` },
          { key: "reviews",  label: `Reviews · ${reviewMovies.length}` },
          { key: "activity", label: "Activity" },
        ].map((t) => (
          <div key={t.key} onClick={() => { haptic("light"); setTab(t.key); }}
            style={{ flex: 1, textAlign: "center", padding: "8px 4px", fontSize: 10, fontWeight: 700, fontFamily: "monospace", color: tab === t.key ? W.accent : W.dim, borderBottom: tab === t.key ? `2px solid ${W.accent}` : "2px solid transparent", cursor: "pointer" }}>
            {t.label}
          </div>
        ))}
      </div>

      {tab === "rankings" && <>
        {userRankings.length === 0 && <div style={{ textAlign: "center", padding: "28px 0" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎬</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>No rankings yet</div>
          <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", marginTop: 6 }}>@{p.username} hasn't ranked any films</div>
        </div>}
        {userRankings.map((m, i) => (
          <div key={m.id} onClick={() => { haptic("light"); onSelectMovie(m); }}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: i === 0 ? W.goldDim : W.card, borderRadius: 10, border: `1px solid ${i === 0 ? W.gold + "44" : W.border}`, cursor: "pointer" }}>
            <span style={{ fontSize: i < 3 ? 13 : 11, fontWeight: 900, color: W.dim, fontFamily: "monospace", width: 18, textAlign: "center", flexShrink: 0 }}>
              {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
            </span>
            <Poster url={m.poster_url} title={m.title} w={28} h={38} radius={4}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: W.text, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>
              <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>{m.release_year}</div>
            </div>
            <span style={{ fontSize: 9, color: W.gold, fontFamily: "monospace", fontWeight: 700, flexShrink: 0 }}>{userRatings[m.id]}/10</span>
          </div>
        ))}
      </>}

      {tab === "reviews" && <>
        {reviewMovies.length === 0 && <div style={{ textAlign: "center", padding: "28px 0" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✎</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>No reviews yet</div>
          <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", marginTop: 6 }}>@{p.username} hasn't written any reviews</div>
        </div>}
        {reviewMovies.map((m, i) => (
          <div key={m.id} style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: 12 }}>
            <div onClick={() => { haptic("light"); onSelectMovie(m); }}
              style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, cursor: "pointer" }}>
              <Poster url={m.poster_url} title={m.title} w={32} h={44} radius={6}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title}</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: W.gold, fontFamily: "monospace", marginTop: 3 }}>{userRatings[m.id]}/10</div>
              </div>
              <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", flexShrink: 0 }}>{i === 0 ? "3d ago" : "1w ago"}</div>
            </div>
            <div style={{ fontSize: 11, color: W.dim, fontFamily: "monospace", lineHeight: 1.6 }}>{reviewTexts[(seed + i) % reviewTexts.length]}</div>
          </div>
        ))}
      </>}

      {tab === "activity" && <>
        {activity.length === 0 && <div style={{ textAlign: "center", padding: "28px 0" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>No activity</div>
        </div>}
        {activity.map((a) => (
          <div key={a.id} style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: W.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: W.text, fontFamily: "monospace", flexShrink: 0 }}>{p.avatar}</div>
              <div style={{ flex: 1, fontSize: 10, color: W.dim, fontFamily: "monospace" }}>
                <span style={{ color: W.accent, fontWeight: 700 }}>@{p.username}</span>
                {a.type === "ranking" && " ranked a new film"}
                {a.type === "review"  && " posted a review"}
                {a.type === "save"    && " saved to watchlist"}
              </div>
              <div style={{ fontSize: 8, color: W.dim, fontFamily: "monospace", flexShrink: 0 }}>{a.time}</div>
            </div>
            <div onClick={() => { haptic("light"); onSelectMovie(a.movie); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: W.bg, borderRadius: 8, cursor: "pointer" }}>
              <Poster url={a.movie.poster_url} title={a.movie.title} w={26} h={36} radius={4}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: W.text, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.movie.title}</div>
                {a.type === "review" && <div style={{ fontSize: 9, color: W.gold, fontFamily: "monospace", marginTop: 1 }}>★ {a.rating}/10</div>}
              </div>
            </div>
            {a.type === "review" && a.text && <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", lineHeight: 1.6, marginTop: 6, fontStyle: "italic" }}>"{a.text}"</div>}
          </div>
        ))}
      </>}
    </>
  );
};
