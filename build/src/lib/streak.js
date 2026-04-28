// Streak system. A streak counts consecutive weeks (Mon-start) where the user
// has ranked at least one movie. Current week has a "grace period": if you
// haven't ranked this week yet but last week had a rank, the streak is still
// alive (and breaks at the start of next week if you don't rank by Sunday).

// Date at 00:00:00 on the Monday of the week containing `ts`. Monday is ISO
// weekday 1 (JS getDay: Sun=0, Mon=1, ..., Sat=6).
export const getMondayOfWeek = (ts) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const dayOfWeek = d.getDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7; // Mon→0, Tue→1, ..., Sun→6
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
};

// Walk backward from this week, counting consecutive weeks with ≥1 rank.
// Stops at the first empty week.
//   rankHistory: array of { movieId, ts }
// Returns:
//   { count, status }
//   status: "active"  — ranked this week, streak fully healthy
//           "at-risk" — last week had rank, this week doesn't (rank by Sunday or it dies)
//           "none"    — no rank in 2+ weeks, streak is 0
export const computeStreak = (rankHistory) => {
  if (!rankHistory || rankHistory.length === 0) {
    return { count: 0, status: "none" };
  }
  const weekSet = new Set(rankHistory.map((r) => getMondayOfWeek(r.ts).getTime()));
  const thisWeek = getMondayOfWeek(Date.now()).getTime();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const thisWeekRanked = weekSet.has(thisWeek);
  const lastWeekRanked = weekSet.has(thisWeek - msPerWeek);
  let startWeek;
  let status;
  if (thisWeekRanked) {
    startWeek = thisWeek;
    status = "active";
  } else if (lastWeekRanked) {
    startWeek = thisWeek - msPerWeek;
    status = "at-risk";
  } else {
    return { count: 0, status: "none" };
  }
  let count = 0;
  let cursor = startWeek;
  while (weekSet.has(cursor)) {
    count++;
    cursor -= msPerWeek;
  }
  return { count, status };
};
