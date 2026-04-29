import React, { useState, useEffect, useCallback, useRef } from "react";
import { W, setActiveTheme, setTypeScale } from "./theme";
import { LoginScreen } from "./screens/LoginScreen";
import { AlreadyRankedFallback } from "./screens/AlreadyRankedFallback";
import { UsernameScreen } from "./screens/UsernameScreen";
import { UpcomingScreen } from "./screens/UpcomingScreen";
import { NotificationsScreen } from "./screens/NotificationsScreen";
import { ReviewModal } from "./screens/ReviewModal";
import { MovieDetailScreen } from "./screens/MovieDetailScreen";
import { LeaderboardScreen } from "./screens/LeaderboardScreen";
import { UserProfileScreen } from "./screens/UserProfileScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { RankScreen } from "./screens/RankScreen";
import { OnboardingRank } from "./screens/OnboardingRank";
import { SettingsScreen } from "./screens/SettingsScreen";
import { NotificationSettings } from "./screens/NotificationSettings";
import { Toggle } from "./components/Toggle";
import { TapTarget } from "./components/TapTarget";
import { Poster } from "./components/Poster";
import { PullIndicator } from "./components/PullIndicator";
import { ScreenWithNav } from "./components/ScreenWithNav";
import { useConfirm } from "./components/useConfirm";
import { Badge } from "./components/Badge";
import { Btn } from "./components/Btn";
import { ShareIcon } from "./components/ShareIcon";
import { Skeleton, FeedSkeleton } from "./components/Skeleton";
import { CropperModal } from "./components/CropperModal";
import { ImageViewer } from "./components/ImageViewer";
import { ShareSheet } from "./components/ShareSheet";
import { TrailerModal } from "./components/TrailerModal";
import { DraggableList } from "./components/DraggableList";
import { SwipeableRow } from "./components/SwipeableRow";
import { ReportBlockMenu } from "./components/ReportBlockMenu";
import { haptic } from "./lib/haptic";
import {
  useEdgeSwipeBack,
  useFocusTrap,
  useKeyboardAvoidance,
  useMinuteTick,
  useOnlineStatus,
  usePullToRefresh,
  useShareInvite,
} from "./lib/hooks";
import {
  ALL_GENRES,
  GLOBAL_FEED,
  MOCK_FEED,
  MOCK_FRIENDS,
  MOVIES,
  UPCOMING,
  USER_PROFILES,
} from "./lib/mockData";
import {
  daysUntil,
  formatRelativeTime,
  formatReleaseDate,
  parseRelativeToTs,
} from "./lib/time";
import {
  TMDB_ENABLED,
  findMovieSync,
  tmdbMovieDetail,
  tmdbPopular,
  tmdbSearch,
  tmdbTopRated,
} from "./lib/tmdb";
import { calcElo } from "./lib/elo";
import { computeStreak } from "./lib/streak";
import { FOLLOW_LIMIT_PER_HOUR, FOLLOW_WINDOW_MS } from "./lib/moderation";
import { checkProfanity } from "./lib/profanity";
import { TAKEN_USERNAMES } from "./lib/usernames";
import { API, API_BASE } from "./lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// API LAYER
// Set API_BASE to your running FastAPI server.
// Falls back to mock data automatically when the server is unreachable.
// ─────────────────────────────────────────────────────────────────────────────

// API client + base URL live in ./lib/api — see imports at top of file.

// MOVIES / UPCOMING / ALL_GENRES / MOCK_FEED / MOCK_FRIENDS / MOCK_NOTIFICATIONS
// live in ./lib/mockData. TMDB helpers and findMovieSync/Async live in ./lib/tmdb.
// Time helpers (formatRelativeTime, parseRelativeToTs, daysUntil) live in
// ./lib/time. Reusable hooks (useOnlineStatus, useMinuteTick, etc.) live in
// ./lib/hooks. Screen components in ./screens/, primitives in ./components/.
// THEMING — W, setActiveTheme, setTypeScale come from ./theme so extracted
// screen components can read the live palette without prop-drilling. See
// ./theme.js for the Proxy + mutation pattern.

// TAKEN_USERNAMES lives in ./lib/usernames — see import at top of file.

// ─────────────────────────────────────────────────────────────────────────────
// SHARED UI COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// UX UTILITIES — haptics, pull-to-refresh, skeletons, swipe, image viewer, share
// ─────────────────────────────────────────────────────────────────────────────

// haptic() and the reusable hooks (useOnlineStatus, useMinuteTick, etc.) live
// in ./lib/haptic and ./lib/hooks. PullIndicator + useConfirm are imported.

// Share icon — square with up-arrow (iOS-style). Used everywhere a share affordance
// appears: feed cards, movie detail, profile, share-sheet header, share-sheet menu items.
// Single source of truth so the visual identity stays consistent.

// Skeleton placeholder — pulsing gray block matching the shape of loaded content

// Feed skeleton — 3 placeholder cards

// Profile photo cropper. Loads an image, lets the user drag to reposition and
// scroll/pinch to zoom inside a circular mask, then writes the visible square
// region to a 256×256 canvas and returns a JPEG dataURL via onSave.
//
// Implementation notes:
// - State: imageScale (1 = fit-to-frame), offsetX/Y (pan in pixels of the displayed image).
// - Frame is FRAME_SIZE px square. Image is rendered at FRAME_SIZE * imageScale, anchored
//   at center, then offset by (offsetX, offsetY).
// - On save we re-render at full output resolution onto a 256×256 canvas using the same
//   transformation math, so the saved image matches what the user saw in the preview.

// Drag-to-reorder list using Pointer Events (works for both mouse and touch).
// `items` is the array, `keyOf(item)` returns a stable key, `renderItem(item, dragHandleProps, isDragging)`
// returns the row JSX. Pass dragHandleProps onto the element you want to be the drag affordance.
// onReorder(fromIndex, toIndex) is called once when the user releases.
//
// Uses transform translateY for the dragged item (no layout reflow during drag), and
// shifts neighboring items via CSS transform when the dragged item crosses their midpoints.
// Each row's row height is measured on pointerdown so the math works for any row size.

// Swipeable row — reveals action buttons on left swipe. Children is the row content.
// actions = [{icon, label, color, onPress}]  — rendered right-to-left

// Edge-swipe back hook — detects iOS-style swipe from left edge. Calls onBack when triggered.

// Full-screen image viewer with tap-to-close

// Share sheet for movies and reviews

// YouTube trailer modal. Embeds the video via an iframe. Autoplay may be blocked
// on some platforms — user can tap play inside the iframe as fallback.

// Poster lives in ./components/Poster, useFocusTrap in ./lib/hooks.
// TapTarget lives in ./components/TapTarget — see imports at top of file.

// Shared invite-link hook. Returns a stable set of handlers for sharing the
// user's invite URL via native share sheet / clipboard / email / SMS.
// Used by both the Find Friends modal (Search) and Settings → Find Friends.


// NavBar + ScreenWithNav (with per-screen scroll persistence) live in
// ./components/ScreenWithNav.



// daysUntil lives in ./lib/time.

// ───── Streak system ────────────────────────────────────────────────────────
// A streak counts consecutive weeks (Mon-start) where the user has ranked
// at least one movie. Current week "grace period": if you haven't ranked
// this week yet but last week had a rank, the streak is still alive (and
// will break at the start of next week if you don't rank by Sunday).

// Return a Date at 00:00:00 on the Monday of the week containing `ts`.
// Monday is ISO weekday 1 (JS getDay: Sun=0, Mon=1, ... Sat=6).

// Walk backward from this week, counting consecutive weeks with ≥1 rank.
// Stops at the first empty week.
//   rankHistory: array of { movieId, ts }
// Returns:
//   { count, status }
//   status: "active"       — ranked this week, streak fully healthy
//           "at-risk"      — last week had rank, this week doesn't (rank by Sunday or it dies)
//           "none"         — no rank in 2+ weeks, streak is 0

// Format a release date nicely (e.g., "May 15, 2026")

// ─────────────────────────────────────────────────────────────────────────────
// CONTENT MODERATION — profanity + rate limits
// ─────────────────────────────────────────────────────────────────────────────

// checkProfanity() lives in ./lib/profanity — see import at top of file.

// Rate limit tracker. In production this would live server-side (Redis).
// We use in-memory counters in the App shell.

// ─────────────────────────────────────────────────────────────────────────────
// REPORT/BLOCK MENU — reusable, mounts as a dot trigger + sheet
// ─────────────────────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────────────────────
// LOGIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────

// LoginScreen lives in ./screens/LoginScreen — see import at top of file.

// UsernameScreen lives in ./screens/UsernameScreen — see import at top of file.

// ─────────────────────────────────────────────────────────────────────────────
// HOME SCREEN
// ─────────────────────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────────────────────
// REVIEW MODAL
// ─────────────────────────────────────────────────────────────────────────────

// ReviewModal — used for both new reviews AND editing existing ones.
// When `existing` is passed (an object with {ts, text, rating, movie_id, movie_title}),
// the modal pre-fills and routes submission to onSubmit(updatedFields, existing.ts).
// For new reviews, existing is undefined and onSubmit receives just the review object.

// ─────────────────────────────────────────────────────────────────────────────
// MOVIE DETAIL SCREEN
// ─────────────────────────────────────────────────────────────────────────────


// UpcomingScreen lives in ./screens/UpcomingScreen, NotificationsScreen in
// ./screens/NotificationsScreen.

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION SETTINGS (used inside Settings → Notifications)
// ─────────────────────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS SCREEN
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// USER PROFILE SCREEN — shown when tapping a user on leaderboard
// ─────────────────────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────────────────────
// USER CONTENT TABS — Rankings / Reviews / Activity on another user's profile
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// LEADERBOARD SCREEN
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// SEARCH SCREEN
// ─────────────────────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────────────────────
// PROFILE SCREEN
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// RANK SCREEN — sends pairwise results + final score to backend
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// ERROR BOUNDARY — catches render crashes and shows friendly fallback
// ─────────────────────────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component {
  constructor(props){
    super(props);
    this.state={hasError:false, error:null};
  }
  static getDerivedStateFromError(error){
    return {hasError:true, error};
  }
  componentDidCatch(error, info){
    // In production: log to a service like Sentry here
    console.error("ErrorBoundary caught:", error, info);
  }
  handleReload=()=>{
    this.setState({hasError:false, error:null});
    // Force a remount by changing the key if needed
    if(typeof window!=="undefined") window.location.reload();
  };
  render(){
    if(this.state.hasError){
      return (
        <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px",background:W.bg}}>
          <div style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:18,padding:"24px 20px",maxWidth:380,width:"100%",textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:10}}>💥</div>
            <div style={{fontSize:15,fontWeight:900,color:W.text,fontFamily:"monospace",marginBottom:6}}>Something went wrong</div>
            <div style={{fontSize:11,color:W.dim,fontFamily:"monospace",lineHeight:1.6,marginBottom:18}}>
              The app hit an unexpected error. Your data is safe — try reloading.
            </div>
            <div onClick={this.handleReload} style={{background:W.accent,color:"#fff",borderRadius:12,padding:"11px",textAlign:"center",fontSize:12,fontWeight:700,fontFamily:"monospace",cursor:"pointer"}}>
              Reload App
            </div>
            {this.state.error?.message&&<div style={{marginTop:14,padding:"8px 10px",background:W.bg,borderRadius:8,fontSize:9,color:W.dim,fontFamily:"monospace",textAlign:"left",opacity:0.7}}>
              {String(this.state.error.message).slice(0,140)}
            </div>}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// APP SHELL
// ─────────────────────────────────────────────────────────────────────────────

// AlreadyRankedFallback lives in ./screens/AlreadyRankedFallback — see import at top of file.

function AppInner() {
  const [authState,setAuthState]=useState("logged-out");
  const [loginProvider,setLoginProvider]=useState(null);
  const [session,setSession]=useState(null);
  const [userId,setUserId]=useState(null);
  const [username,setUsername]=useState("");
  // Track when username was last changed for the 30-day rate limit
  const [lastUsernameChangeTs,setLastUsernameChangeTs]=useState(null);
  const [displayName,setDisplayName]=useState("");
  const [userBio,setUserBio]=useState("");
  const [profilePic,setProfilePic]=useState(null); // base64 data URL
  const [isPrivate,setIsPrivate]=useState(false);
  const [unreadCount,setUnreadCount]=useState(3);
  // Theme: "dark" | "light" | "system" (follows OS)
  const [themeMode,setThemeModeState]=useState("dark");
  // Dynamic type scale: 0.9 | 1.0 | 1.15 | 1.3
  const [fontScale,setFontScaleState]=useState(1.0);
  const online = useOnlineStatus();
  useMinuteTick(); // tick so relative times refresh
  useKeyboardAvoidance();
  // Apply theme + scale synchronously on every render. Since these values mutate module-level
  // vars that the W Proxy reads, we must set them BEFORE any component reads W this render.
  // State changes to themeMode/fontScale already trigger re-render, so no forced key remount needed.
  const effectiveTheme = themeMode==="system"
    ? (typeof window!=="undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : themeMode;
  setActiveTheme(effectiveTheme);
  setTypeScale(fontScale);
  const setThemeMode = useCallback((m)=>{haptic("light");setThemeModeState(m);},[]);
  const setFontScale = useCallback((s)=>{haptic("light");setFontScaleState(s);},[]);
  // Toast state lives near the top of AppInner because callbacks below
  // (toggleSavedMovie, follow handlers) close over showToast and would
  // otherwise hit a TDZ error.
  const [toast,setToast]=useState(null); // {msg, tone}
  const toastTimeoutRef = useRef(null);
  const showToast=useCallback((msg,tone="ok")=>{
    setToast({msg,tone});
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(()=>{setToast(null);toastTimeoutRef.current=null;}, 2600);
  },[]);
  // Clean up pending toast timeout on unmount
  useEffect(()=>()=>{if(toastTimeoutRef.current)clearTimeout(toastTimeoutRef.current);},[]);
  const [screen,setScreen]=useState("home");
  // First-run tutorial — show OnboardingRank after username claim until the
  // user ranks 5 films or skips. Persists in localStorage so a refresh
  // mid-tutorial doesn't drop you back into it after you've moved on.
  const [onboardingActive,setOnboardingActive]=useState(false);
  const [onboardingDone,setOnboardingDone]=useState(()=>{
    if (typeof localStorage==="undefined") return false;
    return localStorage.getItem("rated_onboarding_done")==="1";
  });
  const [selectedMovie,setSelectedMovie]=useState(null);
  const [selectedUpcoming,setSelectedUpcoming]=useState(null);
  const [selectedUser,setSelectedUser]=useState(null);
  const [rankMovie,setRankMovie]=useState(null);
  const [rankedIds,setRankedIds]=useState([]);
  const [eloScores,setEloScores]=useState({});
  // Rank history — each entry {movieId, ts}. Drives the streak counter.
  // Persisted to localStorage so streak survives page reload.
  const [rankHistory, setRankHistory] = useState(() => {
    try {
      if (typeof localStorage === "undefined") return [];
      const raw = localStorage.getItem("rated:rankHistory");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      // Sanity check — must be an array of {movieId, ts}
      return Array.isArray(parsed) ? parsed.filter(e => e && typeof e.ts === "number") : [];
    } catch(_) { return []; }
  });
  // Persist rank history whenever it changes
  useEffect(() => {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("rated:rankHistory", JSON.stringify(rankHistory));
      }
    } catch(_) {}
  }, [rankHistory]);
  // Compute streak on every render — cheap, pure function of rankHistory
  const streakInfo = computeStreak(rankHistory);
  const [watchlist,setWatchlist]=useState(new Set());
  // Reviews the current user has written — each: {movie_id, movie_title, rating, text, time, ts}
  const [userReviews,setUserReviews]=useState([]);
  // Activity the current user has generated (ranking, reviews) — prepended to feed
  const [userFeedItems,setUserFeedItems]=useState([]);
  // Global saved movies — shared across Home, Profile, MovieDetail
  const [savedMovies,setSavedMovies]=useState(new Set(["m-001","m-002","m-005"]));
  // Toggle a movie in the user's saved/bookmarked set. Optimistic update
  // (UI flips first, network call follows). Falls back to local-only when not
  // logged in. Rolls back if the backend call fails so UI matches truth.
  const toggleSavedMovie=useCallback(async(id)=>{
    haptic("light");
    const wasSaved = savedMovies.has(id);
    setSavedMovies(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
    if (!userId || !session) return; // local-only mode
    const result = wasSaved
      ? await API.removeSaved(userId, id, session)
      : await API.addSaved(userId, id, session);
    if (result === null) {
      // Backend write failed — revert
      setSavedMovies(p=>{const n=new Set(p);wasSaved?n.add(id):n.delete(id);return n;});
      showToast(wasSaved ? "Couldn't unsave" : "Couldn't save", "error");
    }
  },[savedMovies, userId, session, showToast]);
  // Global likes state — {feedItemId: boolean}, shared so likes persist across navigation
  const [feedLikes,setFeedLikes]=useState({});
  const toggleFeedLike=useCallback((itemId)=>{
    haptic("light");
    setFeedLikes(p=>({...p,[itemId]:!p[itemId]}));
  },[]);
  // Recent search history — most recent first, deduped, capped at 10
  const [searchHistory,setSearchHistory]=useState([]);
  const addSearchHistory=useCallback((q)=>{
    if(!q||q.trim().length<2) return;
    const trimmed=q.trim();
    setSearchHistory(p=>{
      const filtered=p.filter(x=>x.toLowerCase()!==trimmed.toLowerCase());
      return [trimmed,...filtered].slice(0,10);
    });
  },[]);
  const clearSearchHistory=useCallback(()=>setSearchHistory([]),[]);
  const removeSearchHistoryItem=useCallback((q)=>{
    setSearchHistory(p=>p.filter(x=>x!==q));
  },[]);
  // Global following set — handles like "@josh" that the current user follows
  const [followingHandles,setFollowingHandles]=useState(()=>{
    const s=new Set();
    MOCK_FRIENDS.forEach(f=>{if(f.is_following)s.add(`@${f.username}`);});
    return s;
  });
  // Toggle follow state for a user (by @handle). Optimistic UI update then
  // calls the backend. Backend needs the target's user_id (UUID), so we first
  // look it up via /users/by-username/{handle}, then call follow/unfollow.
  // If the backend lookup or write fails, roll back the optimistic change.
  const toggleFollowHandle=useCallback(async(handle)=>{
    const wasFollowing = followingHandles.has(handle);
    // Optimistic flip
    setFollowingHandles(p=>{
      const n=new Set(p);
      if(n.has(handle)) n.delete(handle);
      else n.add(handle);
      return n;
    });
    // Backend write — only if logged in
    if (!userId || !session) return;
    // Strip @ prefix for username lookup
    const cleanHandle = handle.replace(/^@/, "");
    const target = await API.getUserByUsername(cleanHandle, session);
    if (!target || !target.user_id) {
      // Target user doesn't exist in backend — that's OK for mock data, leave UI as-is
      return;
    }
    const result = wasFollowing
      ? await API.unfollow(userId, target.user_id, session)
      : await API.follow(userId, target.user_id, session);
    if (result === null) {
      // Backend write failed — roll back the optimistic flip
      setFollowingHandles(p=>{
        const n=new Set(p);
        if(wasFollowing) n.add(handle);
        else n.delete(handle);
        return n;
      });
      showToast(wasFollowing ? "Couldn't unfollow" : "Couldn't follow", "error");
    }
  },[followingHandles, userId, session, showToast]);
  const [blockedUsers,setBlockedUsers]=useState(new Set()); // Set of @handles
  // Local-only record of reports submitted by this user. Wire up to a real
  // /reports endpoint when moderation backend lands.
  const [reportedItems,setReportedItems]=useState([]);
  // Users whose follow requests you've approved — they follow you (boosts your followers count)
  const [approvedFollowers,setApprovedFollowers]=useState(new Set());
  const approveFollower=useCallback((handle)=>{
    setApprovedFollowers(p=>{const n=new Set(p);n.add(handle);return n;});
  },[]);
  // Follow rate limit tracking — array of timestamps in last hour
  const [followTimestamps,setFollowTimestamps]=useState([]);

  // Returns null if follow is allowed, else returns a formatted "try again in X" message
  const checkFollowLimit=useCallback(()=>{
    const now = Date.now();
    const recent = followTimestamps.filter(t=>now-t<FOLLOW_WINDOW_MS);
    if (recent.length >= FOLLOW_LIMIT_PER_HOUR) {
      const oldestRecent = Math.min(...recent);
      const msLeft = FOLLOW_WINDOW_MS - (now - oldestRecent);
      const minLeft = Math.ceil(msLeft / 60000);
      return `Follow limit reached (${FOLLOW_LIMIT_PER_HOUR}/hour). Try again in ${minLeft} minute${minLeft===1?"":"s"}.`;
    }
    return null;
  },[followTimestamps]);

  const recordFollow=useCallback(()=>{
    const now = Date.now();
    setFollowTimestamps(p=>[...p.filter(t=>now-t<FOLLOW_WINDOW_MS),now]);
  },[]);

  // Wrapped follow action — checks limit, records timestamp, shows toast on block
  const rateLimitedFollow=useCallback((callback)=>{
    const limitMsg = checkFollowLimit();
    if (limitMsg) {
      showToast(limitMsg, "err");
      return false;
    }
    recordFollow();
    callback&&callback();
    return true;
  },[checkFollowLimit, recordFollow, showToast]);
  const blockUser=useCallback((handle)=>{
    setBlockedUsers(p=>{const n=new Set(p);n.add(handle);return n;});
    // A block implies an unfollow — you can't follow someone you're blocking
    setFollowingHandles(p=>{
      if (!p.has(handle)) return p;
      const n=new Set(p);n.delete(handle);return n;
    });
    // Also remove them from your approved followers — they can't follow you anymore
    setApprovedFollowers(p=>{
      if (!p.has(handle)) return p;
      const n=new Set(p);n.delete(handle);return n;
    });
    showToast(`Blocked ${handle} · They can no longer see or follow you`,"ok");
  },[showToast]);
  const unblockUser=useCallback((handle)=>{
    setBlockedUsers(p=>{const n=new Set(p);n.delete(handle);return n;});
    showToast(`Unblocked ${handle}`,"ok");
  },[showToast]);
  const reportContent=useCallback((type,targetId,targetLabel,reason)=>{
    setReportedItems(p=>[...p,{type,targetId,targetLabel,reason,time:Date.now()}]);
    // NOTE: this is a local-only record until the backend /reports endpoint is wired up.
    // The toast copy avoids claiming a specific review timeline.
    showToast(`Report received`,"ok");
  },[showToast]);

  // Navigation history stack. Each entry is a snapshot the user can return to.
  // { screen, selectedMovie, selectedUpcoming, selectedUser, settingsSection }
  const navStack = useRef([]);
  const snapshotNav = useCallback(()=>({
    screen, selectedMovie, selectedUpcoming, selectedUser, settingsSection:null,
  }),[screen, selectedMovie, selectedUpcoming, selectedUser]);
  const pushNav = useCallback(()=>{ navStack.current.push(snapshotNav()); },[snapshotNav]);
  const popNav = useCallback(()=>{
    const prev = navStack.current.pop();
    if (!prev) return false;
    setScreen(prev.screen);
    setSelectedMovie(prev.selectedMovie||null);
    setSelectedUpcoming(prev.selectedUpcoming||null);
    setSelectedUser(prev.selectedUser||null);
    return true;
  },[]);

  const onNav=useCallback(s=>{
    // Tapping a nav tab is a fresh top-level destination — clear history and selections
    navStack.current = [];
    setScreen(s);setSelectedMovie(null);setSelectedUpcoming(null);setRankMovie(null);setSelectedUser(null);
  },[]);
  const onSelectMovie=useCallback(m=>{pushNav();setSelectedMovie(m);setSelectedUpcoming(null);setSelectedUser(null);setScreen("detail");},[pushNav]);
  const onSelectUpcoming=useCallback(u=>{pushNav();setSelectedUpcoming(u);setSelectedMovie(null);setSelectedUser(null);setScreen("upcoming-detail");},[pushNav]);
  const onSelectUser=useCallback(u=>{pushNav();setSelectedUser(u);setScreen("user-profile");},[pushNav]);
  // All "back" actions now pop the history stack, falling back to a safe default if empty
  const onBack=useCallback(()=>{
    if (!popNav()) { setScreen("home"); setSelectedMovie(null); setSelectedUpcoming(null); }
  },[popNav]);
  const onBackToUpcoming=useCallback(()=>{
    if (!popNav()) { setScreen("upcoming"); setSelectedUpcoming(null); }
  },[popNav]);
  const onBackFromUser=useCallback(()=>{
    if (!popNav()) { setScreen("leaderboard"); setSelectedUser(null); }
  },[popNav]);
  const [settingsSection,setSettingsSection]=useState(null);
  const onOpenSettings=useCallback((section=null)=>{setSettingsSection(section);setScreen("settings");},[]);

  // Submit a new review (or update one if user already reviewed this movie).
  // Optimistic local update first, then backend write. If backend fails, roll back.
  const handleSubmitReview=useCallback(async(review)=>{
    const ts = Date.now();
    const localReview = {...review, ts};
    setUserReviews(p=>[localReview, ...p]);
    // Add feed item locally so home feed shows it immediately
    if (username) {
      setUserFeedItems(p=>[{
        id:`self-review-${ts}`,
        type:"review",
        user:`@${username}`,
        avatar:(displayName||username||"Y")[0].toUpperCase(),
        action:"reviewed",
        movie_title:review.movie_title,
        movie_id:review.movie_id,
        preview:review.text,
        rating:review.rating,
        time:"just now",
        ts,
        likes:0,
        liked:false,
      }, ...p]);
    }
    // Backend write
    if (userId && session) {
      const result = await API.submitReview(userId, review.movie_id, review.rating, review.text, session);
      if (result === null) {
        // Roll back both local stores
        setUserReviews(p=>p.filter(r=>r.ts!==ts));
        setUserFeedItems(p=>p.filter(f=>f.id!==`self-review-${ts}`));
        showToast("Couldn't post review", "error");
      }
    }
  },[username, displayName, userId, session, showToast]);

  // Edit review — finds by ts (stable local id), translates to movie_id for the
  // backend (which keys reviews by user_id + movie_id, not by ts). Backend's
  // submit endpoint is upsert: re-submitting with same movie_id replaces.
  const handleEditReview=useCallback(async(ts, newText, newRating)=>{
    let movieId = null;
    setUserReviews(p=>{
      const found = p.find(r=>r.ts===ts);
      if (found) movieId = found.movie_id;
      return p.map(r=>r.ts===ts?{...r, text:newText, rating:newRating, edited:true}:r);
    });
    setUserFeedItems(p=>p.map(f=>f.id===`self-review-${ts}`?{...f, preview:newText, rating:newRating}:f));
    // Backend upsert (will mark edited_at)
    if (userId && session && movieId) {
      const result = await API.submitReview(userId, movieId, newRating, newText, session);
      if (result === null) {
        showToast("Couldn't save changes", "error");
      }
    }
  },[userId, session, showToast]);

  // Delete review — find movie_id from local store, then backend delete.
  const handleDeleteReview=useCallback(async(ts)=>{
    let movieId = null;
    setUserReviews(p=>{
      const found = p.find(r=>r.ts===ts);
      if (found) movieId = found.movie_id;
      return p.filter(r=>r.ts!==ts);
    });
    setUserFeedItems(p=>p.filter(f=>f.id!==`self-review-${ts}`));
    if (userId && session && movieId) {
      const result = await API.deleteReview(userId, movieId, session);
      if (result === null) {
        showToast("Couldn't delete review", "error");
      }
    }
  },[userId, session, showToast]);

  const handleUnrank=useCallback((movieId)=>{
    setRankedIds(p=>p.filter(id=>id!==movieId));
    setEloScores(p=>{const n={...p}; delete n[movieId]; return n;});
    // Also remove any feed items about this ranking
    setUserFeedItems(p=>p.filter(f=>!(f.movie_id===movieId && f.type==="ranking")));
  },[]);

  const handleReorderRanking=useCallback((movieId, newIndex)=>{
    setRankedIds(p=>{
      const filtered = p.filter(id=>id!==movieId);
      const clamped = Math.max(0, Math.min(newIndex, filtered.length));
      filtered.splice(clamped, 0, movieId);
      return filtered;
    });
  },[]);
  const handleDeleteAccount=useCallback(()=>{
    // In production: call DELETE /users/me API here.
    // Then wipe all local state and return to logged-out.
    setAuthState("logged-out");
    setLoginProvider(null);
    setSession(null);
    setUserId(null);
    setUsername("");
    setDisplayName("");
    setUserBio("");
    setProfilePic(null);
    setIsPrivate(false);
    setRankedIds([]);
    setEloScores({});
    setRankHistory([]);
    setWatchlist(new Set());
    setUserReviews([]);
    setUserFeedItems([]);
    setSearchHistory([]);
    setSavedMovies(new Set());
    setFeedLikes({});
    setFollowingHandles(new Set());
    setBlockedUsers(new Set());
    setApprovedFollowers(new Set());
    setReportedItems([]);
    setFollowTimestamps([]);
    setLastUsernameChangeTs(null);
    setUnreadCount(0);
    setScreen("home");
    setSettingsSection(null);
    navStack.current = [];
  },[]);
  const onBackFromSettings=useCallback(()=>{setSettingsSection(null);setScreen("profile");},[]);
  const onRank=useCallback(m=>{setRankMovie(m);setScreen("rank");},[]);
  // Re-rank: clear the existing ranking + ELO for this movie, then enter rank flow again.
  // Used by the Profile → Rankings → Edit mode ↻ button.
  const onReRank=useCallback((m)=>{
    if (!m) return;
    setRankedIds(p=>p.filter(id=>id!==m.id));
    setEloScores(p=>{const n={...p};delete n[m.id];return n;});
    // Also remove any "ranked" feed item for this movie so the new rank posts fresh activity
    setUserFeedItems(p=>p.filter(f=>!(f.movie_id===m.id && f.type==="ranking")));
    setRankMovie(m);
    setScreen("rank");
  },[]);
  const onRankComplete=useCallback((elo,ids)=>{
    setEloScores(elo);
    // Detect the newly added movie by comparing against prior rankedIds
    setRankedIds(prev=>{
      const newId = ids.find(id=>!prev.includes(id));
      if(newId){
        const movie = findMovieSync(newId);
        if(movie){
          const ts = Date.now();
          // Record this rank in history for the streak counter
          setRankHistory(h => [...h, { movieId: newId, ts }]);
          // Compute the rank position (1-based) and total count for display on the feed
          const rankPosition = ids.indexOf(newId) + 1;
          const totalRanked = ids.length;
          // Derive a user-facing score (1-10 scale) from the rank position
          const score = Math.max(1, Math.min(10, 10 - Math.round((rankPosition-1)/Math.max(totalRanked-1,1)*9)));
          setUserFeedItems(p=>[{
            id:`self-rank-${ts}`,
            type:"ranking",
            user:username?`@${username}`:"@you",
            avatar:(displayName||username||"Y")[0].toUpperCase(),
            action:"ranked a new film",
            movie_title:movie.title,
            movie_id:movie.id,
            preview:`Ranked #${rankPosition} of ${totalRanked}`,
            rank_position:rankPosition,
            total_ranked:totalRanked,
            rating:score,
            time:"just now",
            ts,
            likes:0,
            liked:false,
          }, ...p]);
        }
      }
      return ids;
    });
    setRankMovie(null);
    // During first-run tutorial, return to onboarding so the user can keep
    // ranking until they hit the target. Otherwise land on Profile so they
    // see their updated list.
    setScreen(onboardingActive ? "onboarding-rank" : "profile");
  },[username, displayName, onboardingActive]);
  const onRankCancel=useCallback(()=>{
    setRankMovie(null);
    if (onboardingActive) { setScreen("onboarding-rank"); return; }
    setScreen(selectedMovie?"detail":"home");
  },[selectedMovie, onboardingActive]);

  // Toggle a movie in the user's watchlist. Optimistic update — UI flips immediately,
  // then we hit the backend. If the backend call fails, roll back the local change
  // and show a toast so the user knows something went wrong.
  const onToggleWatchlist=useCallback(async(id)=>{
    const has = watchlist.has(id);
    // Optimistic: update UI first so the tap feels instant
    setWatchlist(p=>{const n=new Set(p);has?n.delete(id):n.add(id);return n;});
    if (!userId || !session) return; // not logged in — local state only
    const result = has
      ? await API.removeWatchlist(userId, id, session)
      : await API.addWatchlist(userId, id, session);
    if (result === null) {
      // Backend unreachable — roll back the optimistic change
      setWatchlist(p=>{const n=new Set(p);has?n.add(id):n.delete(id);return n;});
      showToast(has ? "Couldn't remove from watchlist" : "Couldn't add to watchlist", "error");
    }
  },[userId, session, watchlist, showToast]);

  const handleLogin=async(provider)=>{
    setLoginProvider(provider);
    // Stub login token — format: "sub|name|email" matches backend's AuthService.google_login.
    // Each provider gets a distinct sub so they're treated as different users in the backend.
    const stub = provider==="apple"
      ? "sub_apple_demo|Apple User|user@icloud.com"
      : "sub_google_demo|Google User|user@gmail.com";
    const res = await API.login(stub);
    if (res && res.user) {
      // Backend created/found a user. Save session + user_id for all future API calls.
      setSession(res.session_token);
      setUserId(res.user_id);
      // For now always go to username chooser. Later we'll skip if user already has one.
      setAuthState("choosing-username");
    } else {
      // Backend unreachable or returned an error. Show a toast so user knows.
      showToast("Couldn't connect to server. Make sure the backend is running.", "error");
    }
  };

  const handleUsernameComplete=(u, name)=>{
    setUsername(u);
    if(name)setDisplayName(name);
    setAuthState("logged-in");
    // First-run tutorial: only fresh accounts (no rankings yet) and only if
    // they haven't already finished/skipped onboarding in a prior session.
    if (!onboardingDone && rankedIds.length===0) {
      setOnboardingActive(true);
      setScreen("onboarding-rank");
    }
  };
  const finishOnboarding=useCallback(()=>{
    setOnboardingActive(false);
    setOnboardingDone(true);
    if (typeof localStorage!=="undefined") localStorage.setItem("rated_onboarding_done","1");
    setScreen("home");
  },[]);

  // Load watchlist from backend on login. The backend's GET /users/{id}/watchlist
  // returns an array of movie_ids directly (not wrapped in an object). If the API
  // is unreachable, getWatchlist returns null and we leave the local Set as-is.
  useEffect(()=>{
    if(authState==="logged-in"&&userId&&session){
      API.getWatchlist(userId,session).then(data=>{
        if(Array.isArray(data)) setWatchlist(new Set(data));
      });
    }
  },[authState,userId,session]);

  // Load saved/bookmarked movies the same way.
  useEffect(()=>{
    if(authState==="logged-in"&&userId&&session){
      API.getSaved(userId,session).then(data=>{
        if(Array.isArray(data)) setSavedMovies(new Set(data));
      });
    }
  },[authState,userId,session]);

  // Load user's written reviews on login. Backend returns objects with
  // {user_id, movie_id, rating, text, created_at, edited_at, edited}.
  // We translate to the local shape (ts as the unique id, movie_title looked up).
  useEffect(()=>{
    if(authState==="logged-in"&&userId&&session){
      API.getUserReviews(userId,session).then(data=>{
        if(!Array.isArray(data)) return;
        const reviews = data.map(r=>{
          // Backend stores movie_id only; resolve title via local lookup.
          const movie = findMovieSync(r.movie_id);
          return {
            ts: Math.floor((r.created_at || 0) * 1000) || Date.now(),
            movie_id: r.movie_id,
            movie_title: movie?.title || r.movie_id,
            rating: r.rating,
            text: r.text,
            edited: !!r.edited,
          };
        });
        setUserReviews(reviews);
      });
    }
  },[authState,userId,session]);

  // Load rankings from backend on login. The backend returns an array of
  // {user, movie, score, ranked_at} objects sorted by score (highest first).
  // We extract the movie_ids in order and the score map, mirroring the local
  // structure (rankedIds, eloScores) so the rest of the app needs no changes.
  useEffect(()=>{
    if(authState==="logged-in"&&userId&&session){
      API.getRankings(userId,session).then(data=>{
        if(Array.isArray(data) && data.length > 0){
          // Backend already returns rankings sorted highest-score-first
          const ids = data.map(r => r.movie?.movie_id).filter(Boolean);
          // Convert backend's 1-10 score back to ELO-ish range used locally
          // (each score point ≈ 20 ELO; midpoint 1500 = score ~5)
          const scores = {};
          data.forEach(r => {
            if (r.movie?.movie_id && typeof r.score === "number") {
              scores[r.movie.movie_id] = 1400 + r.score * 20;
            }
          });
          setRankedIds(ids);
          setEloScores(scores);
        }
      });
    }
  },[authState,userId,session]);

  const activeNav=()=>{if(["detail","rank"].includes(screen))return"home";if(screen==="upcoming-detail")return"upcoming";return screen;};
  const navLabel=()=>{if(authState==="logged-out")return"Sign In";if(authState==="choosing-username")return"Create Username";if(screen==="detail")return selectedMovie?.title||"Detail";if(screen==="upcoming-detail")return selectedUpcoming?.title||"Upcoming";if(screen==="rank")return"Ranking";return screen;};

  const content=()=>{
    if(authState==="logged-out") return <LoginScreen onLogin={handleLogin}/>;
    if(authState==="choosing-username") return <UsernameScreen provider={loginProvider} session={session} onComplete={handleUsernameComplete}/>;
    if(screen==="onboarding-rank") return <OnboardingRank rankedCount={rankedIds.length} onPickMovie={onRank} onSkip={finishOnboarding} onDone={finishOnboarding}/>;
    if(screen==="home") return <HomeScreen onNav={onNav} onSelectMovie={onSelectMovie} session={session} userId={userId} username={username} unreadCount={unreadCount} blockedUsers={blockedUsers} blockUser={blockUser} reportContent={reportContent} rateLimitedFollow={rateLimitedFollow} followingHandles={followingHandles} toggleFollowHandle={toggleFollowHandle} onSelectUser={onSelectUser} userFeedItems={userFeedItems} onRank={onRank} savedMovies={savedMovies} toggleSavedMovie={toggleSavedMovie} feedLikes={feedLikes} toggleFeedLike={toggleFeedLike} showToast={showToast}/>;
    if(screen==="detail") return <div style={{display:"flex",flexDirection:"column",height:"100%"}}><div style={{flex:1,overflowY:"auto"}}><MovieDetailScreen movie={selectedMovie} onBack={onBack} onRank={onRank} watchlist={watchlist} onToggleWatchlist={onToggleWatchlist} followingHandles={followingHandles} onSelectUser={onSelectUser} onSubmitReview={handleSubmitReview} savedMovies={savedMovies} toggleSavedMovie={toggleSavedMovie} showToast={showToast}/></div></div>;
    if(screen==="upcoming") return <UpcomingScreen onNav={onNav} onSelectUpcoming={onSelectUpcoming} watchlist={watchlist} onToggleWatchlist={onToggleWatchlist}/>;
    if(screen==="upcoming-detail") return <div style={{display:"flex",flexDirection:"column",height:"100%"}}><div style={{flex:1,overflowY:"auto"}}><MovieDetailScreen movie={selectedUpcoming} onBack={onBackToUpcoming} isUpcoming={true} watchlist={watchlist} onToggleWatchlist={onToggleWatchlist} savedMovies={savedMovies} toggleSavedMovie={toggleSavedMovie} showToast={showToast}/></div></div>;
    if(screen==="leaderboard") return <LeaderboardScreen onNav={onNav} onSelectMovie={onSelectMovie} onSelectUser={onSelectUser} username={username} displayName={displayName} blockedUsers={blockedUsers} myRankedCount={rankedIds.length} myStreak={streakInfo.count}/>;
    if(screen==="user-profile") return <div style={{display:"flex",flexDirection:"column",height:"100%"}}><div style={{flex:1,overflowY:"auto"}}><UserProfileScreen user={selectedUser} onBack={onBackFromUser} onSelectMovie={onSelectMovie} blockedUsers={blockedUsers} blockUser={blockUser} reportContent={reportContent} rateLimitedFollow={rateLimitedFollow} followingHandles={followingHandles} toggleFollowHandle={toggleFollowHandle}/></div></div>;
    if(screen==="search") return <SearchScreen onNav={onNav} onSelectMovie={onSelectMovie} onSelectUser={onSelectUser} followingHandles={followingHandles} toggleFollowHandle={toggleFollowHandle} rateLimitedFollow={rateLimitedFollow} searchHistory={searchHistory} addSearchHistory={addSearchHistory} clearSearchHistory={clearSearchHistory} removeSearchHistoryItem={removeSearchHistoryItem} username={username} showToast={showToast}/>;
    if(screen==="notifications") return <NotificationsScreen onNav={onNav} isPrivate={isPrivate} onMarkAllRead={()=>setUnreadCount(0)} blockedUsers={blockedUsers} toggleFollowHandle={toggleFollowHandle} followingHandles={followingHandles} approveFollower={approveFollower} onSelectUser={onSelectUser} rateLimitedFollow={rateLimitedFollow}/>;
    if(screen==="profile") return <ProfileScreen onNav={onNav} onSelectMovie={onSelectMovie} rankedIds={rankedIds} eloScores={eloScores} watchlist={watchlist} onSelectUpcoming={onSelectUpcoming} onToggleWatchlist={onToggleWatchlist} username={username} displayName={displayName} userBio={userBio} profilePic={profilePic} isPrivate={isPrivate} onOpenSettings={onOpenSettings} session={session} userId={userId} reportContent={reportContent} rateLimitedFollow={rateLimitedFollow} followingHandles={followingHandles} toggleFollowHandle={toggleFollowHandle} approvedFollowers={approvedFollowers} userReviews={userReviews} onUnrank={handleUnrank} onReorderRanking={handleReorderRanking} onRank={onRank} onReRank={onReRank} savedMovies={savedMovies} toggleSavedMovie={toggleSavedMovie} onEditReview={handleEditReview} onDeleteReview={handleDeleteReview} showToast={showToast} streakInfo={streakInfo}/>;
    if(screen==="settings") return <SettingsScreen onBack={onBackFromSettings} username={username} displayName={displayName} userBio={userBio} profilePic={profilePic} isPrivate={isPrivate} onUpdateUsername={setUsername} onUpdatePrivacy={setIsPrivate} onUpdateDisplayName={setDisplayName} onUpdateBio={setUserBio} onUpdateProfilePic={setProfilePic} initialSection={settingsSection} blockedUsers={blockedUsers} onUnblock={unblockUser} onDeleteAccount={handleDeleteAccount} themeMode={themeMode} fontScale={fontScale} onSetThemeMode={setThemeMode} onSetFontScale={setFontScale} lastUsernameChangeTs={lastUsernameChangeTs} onUsernameChanged={()=>setLastUsernameChangeTs(Date.now())} showToast={showToast}/>;
    if(screen==="rank"&&rankMovie){
      if(rankedIds.includes(rankMovie.id)){
        // Edge case — should rarely trigger since onReRank clears first.
        // Use a tiny inline component so the state-flip happens in useEffect, not during render.
        // Mirror onRankCancel's fallback: only go to "detail" if a movie is selected,
        // otherwise route home — "detail" with no selectedMovie renders a blank screen.
        return <AlreadyRankedFallback onDone={()=>{
          setRankMovie(null);
          setScreen(selectedMovie ? "detail" : "home");
        }}/>;
      }
      return <RankScreen newMovie={rankMovie} rankedIds={rankedIds} eloScores={eloScores} onComplete={onRankComplete} onCancel={onRankCancel} session={session} userId={userId}/>;
    }
    return <HomeScreen onNav={onNav} onSelectMovie={onSelectMovie} session={session} userId={userId}/>;
  };

  return (
    <div style={{minHeight:"100vh",background:themeMode==="light"?"#e5e5ec":"#08080b",padding:"20px 12px 40px",fontFamily:"system-ui"}}>
      <div style={{textAlign:"center",marginBottom:16}}>
        <h1 style={{fontSize:26,fontWeight:900,color:W.accent,fontFamily:"monospace",letterSpacing:-1,margin:0,textShadow:`0 0 30px ${W.accent}33`}}>RATED</h1>
        <p style={{fontSize:9,color:W.dim,fontFamily:"monospace",margin:"4px 0 0",letterSpacing:3}}>DATA-DRIVEN PROTOTYPE · ENTITY → UI</p>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:5,justifyContent:"center",marginBottom:20,maxWidth:560,margin:"0 auto 20px"}}>
        {authState==="logged-in"
          ?Object.entries({home:"Home",upcoming:"Upcoming",search:"Search",leaderboard:"Board",profile:"Profile"}).map(([k,v])=>(
              <button key={k} onClick={()=>onNav(k)} style={{padding:"5px 11px",borderRadius:8,fontSize:9,fontFamily:"monospace",fontWeight:700,cursor:"pointer",border:`1px solid ${activeNav()===k?W.accent:W.border}`,background:activeNav()===k?W.accentDim:"transparent",color:activeNav()===k?W.accent:W.dim}}>{v}</button>
            ))
          :<button onClick={()=>setAuthState("logged-out")} style={{padding:"5px 11px",borderRadius:8,fontSize:9,fontFamily:"monospace",fontWeight:700,cursor:"pointer",border:`1px solid ${W.accent}`,background:W.accentDim,color:W.accent}}>← Login</button>
        }
      </div>
      <div style={{display:"flex",justifyContent:"center"}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
          <div style={{width:320,height:640,background:W.bg,borderRadius:36,border:`2.5px solid ${W.border}`,overflow:"hidden",position:"relative",boxShadow:"0 24px 80px rgba(0,0,0,0.6)",display:"flex",flexDirection:"column"}}>
            {/* Dynamic island / notch */}
            <div style={{position:"absolute",top:6,left:"50%",transform:"translateX(-50%)",width:94,height:28,background:"#000",borderRadius:14,zIndex:10}}/>
            {/* Status bar — safe area padding for notch */}
            <div style={{height:44,display:"flex",alignItems:"flex-end",justifyContent:"space-between",padding:"0 22px 4px",fontSize:11,color:W.dim,fontFamily:"monospace",flexShrink:0,position:"relative",zIndex:5}}>
              <span style={{fontWeight:600}}>9:41</span>
              <span>{online?"●●● ▐██▌":"○○○ ▐  ▌"}</span>
            </div>
            <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",position:"relative",zoom:fontScale}}>
              {!online&&<div style={{background:W.dim,color:"#fff",padding:"4px 12px",fontSize:9,fontWeight:700,fontFamily:"monospace",textAlign:"center",flexShrink:0,letterSpacing:1}}>
                ⚠ OFFLINE · Changes won't sync until you reconnect
              </div>}
              {content()}
              {toast&&<div role="status" aria-live="polite" aria-atomic="true" style={{position:"absolute",bottom:80,left:16,right:16,zIndex:100,background:toast.tone==="err"?W.accent:(themeMode==="light"?"#18181e":"#000"),border:`1px solid ${toast.tone==="err"?W.accent:W.border}`,borderRadius:12,padding:"10px 14px",boxShadow:"0 6px 24px rgba(0,0,0,0.6)"}}>
                <div style={{fontSize:10,fontWeight:600,color:"#fff",fontFamily:"monospace",lineHeight:1.5}}>{toast.msg}</div>
              </div>}
            </div>
          </div>
          <span style={{fontSize:10,color:W.dim,fontFamily:"monospace",letterSpacing:1.5,textTransform:"uppercase",fontWeight:600}}>{navLabel()}</span>
        </div>
      </div>
      <div style={{maxWidth:500,margin:"16px auto 0",textAlign:"center"}}>
        <p style={{fontSize:9,color:W.dim,fontFamily:"monospace",lineHeight:1.6}}>Apple ID & Google only · Import watch history from 8 platforms</p>
      </div>
    </div>
  );
}

// Global accessibility styles — injected into the document so these survive
// any build pipeline (not just the Python HTML wrapper). Idempotent — only
// injects once even if App re-renders.
const A11Y_STYLE_ID = "rated-a11y-styles";
const A11Y_CSS = `
/* Hide outline for mouse/touch users but keep a clear ring for keyboard nav */
*:focus { outline: none; }
*:focus-visible { outline: 2px solid #ff3b3b; outline-offset: 2px; border-radius: 4px; }
/* Honor OS reduced-motion preference */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
/* Skeleton shimmer keyframes — safe fallback if build script doesn't provide them */
@keyframes skeleton-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
/* Horizontal carousels keep scroll behavior but hide the bar — see e.g. the
   highlights row on Home, genre filter chips on Upcoming. */
.no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }
`;
const useA11yStyles = () => {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById(A11Y_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = A11Y_STYLE_ID;
    style.textContent = A11Y_CSS;
    document.head.appendChild(style);
    // No cleanup — we want these to persist for the app's lifetime
  }, []);
};

export default function App() {
  useA11yStyles();
  return (
    <ErrorBoundary>
      <AppInner/>
    </ErrorBoundary>
  );
}
