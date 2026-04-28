// Reusable React hooks. Browser-feature-detected so SSR doesn't crash;
// degrades to no-op behavior when the relevant API is missing.

import { useCallback, useEffect, useRef, useState } from "react";

import { haptic } from "./haptic";

// Tracks `navigator.onLine`. Listens to online/offline events. Useful for
// rendering an offline banner or skipping retries while disconnected.
export const useOnlineStatus = () => {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
};

// Re-renders consumers every minute so relative timestamps tick. The hook
// itself returns nothing — its only purpose is to schedule a state bump.
export const useMinuteTick = () => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
};

// Mobile keyboard pushes the layout up. When that happens, scroll the
// focused input into view so the user can see what they're typing. No-ops
// where visualViewport isn't available (older browsers, SSR).
export const useKeyboardAvoidance = () => {
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const handleResize = () => {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
        setTimeout(() => active.scrollIntoView({ block: "center", behavior: "smooth" }), 100);
      }
    };
    window.visualViewport.addEventListener("resize", handleResize);
    return () => window.visualViewport.removeEventListener("resize", handleResize);
  }, []);
};

// Focus trap for modal dialogs. While `isOpen`, captures Tab cycling within
// `containerRef`, calls `onClose` on Escape, and restores focus to the
// previously focused element on close. Use in every modal so keyboard users
// don't end up with focus stranded behind the overlay.
export const useFocusTrap = (containerRef, isOpen, onClose) => {
  useEffect(() => {
    if (!isOpen || !containerRef?.current) return;
    const container = containerRef.current;
    const prevActive = document.activeElement;
    const focusables = () => Array.from(
      container.querySelectorAll('a, button, [role="button"], input, textarea, select, [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-disabled") !== "true");
    const initial = focusables()[0];
    if (initial && typeof initial.focus === "function") initial.focus();
    const onKey = (e) => {
      if (e.key === "Escape" && onClose) { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      const f = focusables();
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    container.addEventListener("keydown", onKey);
    return () => {
      container.removeEventListener("keydown", onKey);
      if (prevActive && typeof prevActive.focus === "function") {
        try { prevActive.focus(); } catch (e) { /* element gone */ }
      }
    };
  }, [isOpen, containerRef, onClose]);
};

// Pull-to-refresh. Returns { pullDist, isRefreshing, pullHandlers }.
// Spread pullHandlers onto your scrollable element. onRefresh fires when
// the user pulls past 60px from scrollTop=0.
export const usePullToRefresh = (onRefresh) => {
  const [pullDist, setPullDist] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(null);
  const triggered = useRef(false);

  const handleTouchStart = (e) => {
    if (e.currentTarget.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      triggered.current = false;
    }
  };
  const handleTouchMove = (e) => {
    if (startY.current == null || isRefreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0 && e.currentTarget.scrollTop === 0) {
      const damped = Math.min(100, dy * 0.5);
      setPullDist(damped);
      // Pop a haptic when crossing the trigger threshold so the user
      // knows release-here will refresh. Inverse pop on release-without.
      if (damped >= 60 && !triggered.current) {
        triggered.current = true;
        haptic("medium");
      } else if (damped < 60 && triggered.current) {
        triggered.current = false;
      }
    }
  };
  const handleTouchEnd = async () => {
    if (pullDist >= 60 && !isRefreshing) {
      setIsRefreshing(true);
      haptic("heavy");
      try { await onRefresh?.(); } catch (e) { /* surface elsewhere */ }
      setTimeout(() => { setIsRefreshing(false); setPullDist(0); }, 600);
    } else {
      setPullDist(0);
    }
    startY.current = null;
    triggered.current = false;
  };
  return {
    pullDist,
    isRefreshing,
    pullHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
};

// iOS-style edge-swipe-back. Detects a pointer that starts within 24px of
// the left edge and travels >70px right with <50px vertical drift, then
// fires `onBack`. Spread the returned handlers onto your scrollable element.
export const useEdgeSwipeBack = (onBack) => {
  const startX = useRef(null);
  const startY = useRef(null);
  const triggered = useRef(false);
  const handleTouchStart = (e) => {
    if (e.touches[0].clientX < 24) {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      triggered.current = false;
    }
  };
  const handleTouchMove = (e) => {
    if (startX.current == null || triggered.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = Math.abs(e.touches[0].clientY - startY.current);
    if (dx > 70 && dy < 50) {
      triggered.current = true;
      haptic("medium");
      onBack?.();
    }
  };
  const handleTouchEnd = () => { startX.current = null; triggered.current = false; };
  return { onTouchStart: handleTouchStart, onTouchMove: handleTouchMove, onTouchEnd: handleTouchEnd };
};

// Stable handlers for the user's invite link: native share sheet → clipboard
// fallback, plus mailto and sms variants. Used by Find Friends in Search and
// by Settings → Find Friends. `showToast` is optional but recommended for
// confirming clipboard success.
export const useShareInvite = (username, showToast) => {
  const inviteUrl = `https://rated.app/invite/${username || "rated"}`;
  const inviteMsg = `Join me on RATED — the movie-ranking app: ${inviteUrl}`;
  const shareInvite = useCallback(async () => {
    haptic("medium");
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Join me on RATED", text: inviteMsg, url: inviteUrl });
        return true;
      }
    } catch (e) {
      if (e?.name === "AbortError") return false; // user cancelled
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
        showToast && showToast("Invite link copied to clipboard", "ok");
        return true;
      }
    } catch (e) { /* clipboard unavailable */ }
    showToast && showToast("Couldn't share — your browser doesn't support this", "err");
    return false;
  }, [inviteUrl, inviteMsg, showToast]);
  const emailInvite = useCallback(() => {
    haptic("light");
    const subject = encodeURIComponent("Join me on RATED");
    const body = encodeURIComponent(inviteMsg);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }, [inviteMsg]);
  const smsInvite = useCallback(() => {
    haptic("light");
    const body = encodeURIComponent(inviteMsg);
    window.location.href = `sms:?&body=${body}`;
  }, [inviteMsg]);
  return { inviteUrl, inviteMsg, shareInvite, emailInvite, smsInvite };
};
