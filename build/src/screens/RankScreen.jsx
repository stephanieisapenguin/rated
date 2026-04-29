import { useEffect, useState } from "react";

import { Badge } from "../components/Badge";
import { Poster } from "../components/Poster";
import { TapTarget } from "../components/TapTarget";
import { API } from "../lib/api";
import { calcElo } from "../lib/elo";
import { findMovieSync } from "../lib/tmdb";
import { W } from "../theme";

// Pairwise binary-search ranker. Bisects the existing ranked list with O(log n)
// head-to-head comparisons, applies an Elo update on each pick, and on
// completion records every pairwise outcome plus the final score (mapped from
// Elo to a 1–10 scale) to the backend.
export const RankScreen = ({ newMovie, rankedIds, eloScores, onComplete, onCancel, session, userId }) => {
  const [lo, setLo] = useState(0);
  const [hi, setHi] = useState(rankedIds.length);
  const [localElo, setLocalElo] = useState({ ...eloScores, [newMovie.id]: 1500 });
  const [result, setResult] = useState(null);
  const [insertPos, setInsertPos] = useState(null);
  const [done, setDone] = useState(false);
  // First-rank shortcut — empty list means we slot in at position 0 with no
  // comparisons. Done-on-mount; the no-deps effect runs once.
  useEffect(() => { if (rankedIds.length === 0) { setInsertPos(0); setDone(true); } }, []);

  const midIdx = Math.floor((lo + hi) / 2);
  const opponentId = rankedIds[midIdx];
  const opponent = findMovieSync(opponentId);

  const pick = async (winnerId) => {
    const loserId = winnerId === newMovie.id ? opponentId : newMovie.id;
    const [newW, newL] = calcElo(localElo[winnerId] || 1500, localElo[loserId] || 1500);
    setLocalElo((p) => ({ ...p, [winnerId]: newW, [loserId]: newL }));
    const nextLo = winnerId === newMovie.id ? lo : midIdx + 1;
    const nextHi = winnerId === newMovie.id ? midIdx : hi;
    setResult({ chosenId: winnerId, otherId: loserId, nextLo, nextHi });
    if (userId && session) await API.recordPairwise(userId, winnerId, loserId, session);
  };

  const advance = () => {
    const { nextLo, nextHi } = result;
    setResult(null);
    if (nextLo >= nextHi) { setInsertPos(nextLo); setDone(true); }
    else { setLo(nextLo); setHi(nextHi); }
  };

  const handleSave = async (localEloFinal, finalIds) => {
    if (userId && session) {
      // Map Elo to a 1–10 score. 1500 is the default rating; ±20 per step.
      const score = Math.min(10, Math.max(1, Math.round((localEloFinal[newMovie.id] - 1400) / 20)));
      // Forward metadata so the backend can auto-create the movie row when
      // we're ranking a TMDB-sourced film it hasn't seen before.
      const movieMeta = {
        title: newMovie.title,
        genre: newMovie.genres?.[0]?.name || null,
        poster_url: newMovie.poster_url || null,
        year: newMovie.release_year || null,
      };
      await API.addRanking(userId, newMovie.id, score, session, movieMeta);
    }
    onComplete(localEloFinal, finalIds);
  };

  if (done && insertPos !== null) {
    const finalIds = [...rankedIds];
    finalIds.splice(insertPos, 0, newMovie.id);
    const ranked = finalIds.map((id) => findMovieSync(id)).filter(Boolean);
    return (
      <div style={{ height: "100%", overflowY: "auto" }}>
        <div style={{ padding: "8px 22px 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: W.text, fontFamily: "monospace" }}>⚡ RANKED!</span>
          <div onClick={onCancel} style={{ fontSize: 11, color: W.dim, fontFamily: "monospace", cursor: "pointer" }}>✕</div>
        </div>
        <div style={{ padding: "0 22px 20px" }}>
          <div style={{ textAlign: "center", padding: "14px 0 10px" }}>
            <div style={{ fontSize: 28 }}>🏆</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: W.gold, fontFamily: "monospace", marginTop: 6 }}>{newMovie.title} added!</div>
            <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 3 }}>Landed at #{insertPos + 1}</div>
          </div>
          <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", letterSpacing: 1, marginBottom: 8 }}>YOUR UPDATED RANKINGS</div>
          {ranked.map((m, i) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", marginBottom: 5, borderRadius: 10, border: `1px solid ${m.id === newMovie.id ? W.accent + "66" : W.border}`, background: m.id === newMovie.id ? W.accentDim : i === 0 ? W.goldDim : W.card }}>
              <span style={{ fontSize: i < 3 ? 13 : 10, width: 20, textAlign: "center", fontFamily: "monospace", fontWeight: 900, color: W.dim, flexShrink: 0 }}>{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
              <Poster url={m.poster_url} title={m.title} w={28} h={38} radius={4}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: m.id === newMovie.id ? W.accent : W.text, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>
              </div>
              {m.id === newMovie.id && <Badge color="red">NEW</Badge>}
              <div style={{ fontSize: 9, color: W.blue, fontFamily: "monospace", fontWeight: 700, flexShrink: 0 }}>{localElo[m.id] || 1500}</div>
            </div>
          ))}
          <div onClick={() => handleSave(localElo, finalIds)}
            style={{ marginTop: 10, background: W.accent, borderRadius: 12, padding: "13px", textAlign: "center", fontSize: 12, fontWeight: 900, color: "#fff", fontFamily: "monospace", cursor: "pointer" }}>
            SAVE TO PROFILE →
          </div>
        </div>
      </div>
    );
  }

  if (!opponent) return null;
  const chosen = result ? findMovieSync(result.chosenId) : null;
  const other = result ? findMovieSync(result.otherId) : null;
  const totalComps = Math.max(1, Math.ceil(Math.log2(rankedIds.length + 1)));

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ padding: "8px 22px 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: W.text, fontFamily: "monospace" }}>⚡ RANK IT</span>
        <div onClick={onCancel} style={{ fontSize: 11, color: W.dim, fontFamily: "monospace", cursor: "pointer" }}>✕ Cancel</div>
      </div>
      <div style={{ padding: "0 22px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ background: `linear-gradient(135deg,${W.accent}10,${W.accent}04)`, border: `1px solid ${W.accent}33`, borderRadius: 14, padding: "10px 14px", display: "flex", gap: 12, alignItems: "center" }}>
          <Poster url={newMovie.poster_url} w={40} h={56} radius={6}/>
          <div>
            <div style={{ fontSize: 8, color: W.accent, fontFamily: "monospace", fontWeight: 700, letterSpacing: 1 }}>PLACING IN YOUR LIST</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: W.text, fontFamily: "monospace", marginTop: 2 }}>{newMovie.title}</div>
            <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>{newMovie.release_year} · {newMovie.directors?.[0]?.name}</div>
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", letterSpacing: 1 }}>WHICH DO YOU PREFER?</div>
          <div style={{ fontSize: 8, color: W.dim, fontFamily: "monospace", marginTop: 2 }}>~{totalComps} comparisons · {hi - lo} remaining</div>
        </div>
        {!result ? (
          <div role="radiogroup" aria-label={`Choose which movie you prefer: ${newMovie.title} or ${opponent.title}`}
            style={{ display: "flex", gap: 10 }}>
            {[newMovie, opponent].map((m) => (
              <TapTarget key={m.id} role="radio" aria-checked="false" onClick={() => pick(m.id)}
                label={`Pick ${m.title} over ${m.id === newMovie.id ? opponent.title : newMovie.title}`} minTap={false}
                style={{ flex: 1, background: W.card, border: `1px solid ${W.border}`, borderRadius: 16, padding: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <Poster url={m.poster_url} title={m.title} w={100} h={140} radius={10}/>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: W.text, fontFamily: "monospace", lineHeight: 1.3 }}>{m.title}</div>
                  <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 2 }}>{m.release_year}</div>
                  {m.id !== newMovie.id && <div style={{ fontSize: 8, color: W.blue, fontFamily: "monospace", marginTop: 3, fontWeight: 700 }}>#{rankedIds.indexOf(m.id) + 1} in your list</div>}
                  {m.id === newMovie.id && <div style={{ fontSize: 8, color: W.accent, fontFamily: "monospace", marginTop: 3, fontWeight: 700 }}>NEW</div>}
                </div>
                <div aria-hidden="true" style={{ background: W.accentDim, border: `1px solid ${W.accent}44`, borderRadius: 10, padding: "7px 0", width: "100%", textAlign: "center", fontSize: 10, fontWeight: 900, color: W.accent, fontFamily: "monospace" }}>THIS ONE ▶</div>
              </TapTarget>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ background: W.greenDim, border: `1px solid ${W.green}44`, borderRadius: 14, padding: 14, display: "flex", gap: 12, alignItems: "center" }}>
              <Poster url={chosen.poster_url} w={48} h={66} radius={8}/>
              <div>
                <div style={{ fontSize: 8, color: W.green, fontFamily: "monospace", fontWeight: 700, letterSpacing: 1 }}>✓ YOU PREFERRED</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: W.text, fontFamily: "monospace", marginTop: 2 }}>{chosen.title}</div>
                <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 2 }}>Narrowing down further…</div>
              </div>
            </div>
            <div style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 14, padding: 14, display: "flex", gap: 12, alignItems: "center", opacity: 0.6 }}>
              <Poster url={other.poster_url} w={48} h={66} radius={8}/>
              <div>
                <div style={{ fontSize: 8, color: W.dim, fontFamily: "monospace", fontWeight: 700, letterSpacing: 1 }}>✗ NOT THIS TIME</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: W.text, fontFamily: "monospace", marginTop: 2 }}>{other.title}</div>
              </div>
            </div>
            <TapTarget onClick={advance} label={result.nextLo >= result.nextHi ? "Finish ranking" : "Next comparison"} minTap={false}
              style={{ background: W.accent, borderRadius: 12, padding: "13px", textAlign: "center", fontSize: 12, fontWeight: 900, color: "#fff", fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 48 }}>
              {result.nextLo >= result.nextHi ? "FINISH RANKING →" : "NEXT COMPARISON →"}
            </TapTarget>
          </div>
        )}
        {!result && rankedIds.length > 0 && <div style={{ marginTop: 4 }}>
          <div style={{ height: 3, background: W.border, borderRadius: 2 }}>
            <div style={{ height: "100%", background: W.accent, borderRadius: 2, width: `${Math.max(5, 100 - ((hi - lo) / Math.max(rankedIds.length, 1) * 100))}%`, transition: "width 0.3s" }}/>
          </div>
        </div>}
      </div>
    </div>
  );
};
