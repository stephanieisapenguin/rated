import { useState } from "react";

import { Poster } from "../components/Poster";
import { checkProfanity } from "../lib/profanity";
import { W } from "../theme";

// Used for both new reviews and editing existing ones. When `existing` is
// passed (an object with {ts, text, rating, movie_id, movie_title}), the
// modal pre-fills and routes submission to onSubmit(text, rating). For new
// reviews, existing is undefined and onSubmit receives a full review object.
export const ReviewModal = ({ movie, onClose, onSubmit, existing }) => {
  const isEdit = !!existing;
  const [text, setText] = useState(existing?.text || "");
  const [rating, setRating] = useState(existing?.rating || 0);
  const [hover, setHover] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const submit = () => {
    if (!rating || !text.trim()) return;
    if (checkProfanity(text)) {
      setError("Review contains inappropriate language. Please revise it.");
      return;
    }
    setError(null);
    if (isEdit) {
      onSubmit && onSubmit(text.trim(), rating);
    } else {
      onSubmit && onSubmit({ movie_id: movie.id, movie_title: movie.title, rating, text: text.trim(), time: "just now" });
    }
    setSubmitted(true);
    setTimeout(onClose, 1200);
  };

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div style={{ background: W.bg, borderRadius: "20px 20px 0 0", padding: "20px 22px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
        {submitted ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: W.green, fontFamily: "monospace" }}>{isEdit ? "Review Updated" : "Review Posted!"}</div>
          </div>
        ) : (<>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: W.text, fontFamily: "monospace" }}>✎ {isEdit ? "EDIT REVIEW" : "WRITE REVIEW"}</div>
            <div onClick={onClose} style={{ fontSize: 18, color: W.dim, cursor: "pointer" }}>✕</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Poster url={movie.poster_url} title={movie.title} w={40} h={56} radius={6}/>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>{movie.title}</div>
              <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>{movie.release_year} · {movie.directors?.[0]?.name}</div>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginBottom: 6, letterSpacing: 1 }}>YOUR RATING</div>
            <div style={{ display: "flex", gap: 3 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <div key={n} onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
                  style={{
                    flex: 1, textAlign: "center", padding: "5px 0", borderRadius: 6, fontSize: 10, fontWeight: 900,
                    fontFamily: "monospace", cursor: "pointer",
                    background: (hover || rating) >= n ? W.goldDim : W.card,
                    border: `1px solid ${(hover || rating) >= n ? W.gold : W.border}`,
                    color: (hover || rating) >= n ? W.gold : W.dim,
                  }}>{n}</div>
              ))}
            </div>
            {rating > 0 && <div style={{ fontSize: 9, color: W.gold, fontFamily: "monospace", marginTop: 4, textAlign: "center" }}>★ {rating}/10</div>}
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", letterSpacing: 1 }}>YOUR REVIEW</div>
              <div style={{ fontSize: 9, color: text.length >= 450 ? W.accent : W.dim, fontFamily: "monospace" }}>{text.length} / 500</div>
            </div>
            <textarea value={text} onChange={(e) => { setText(e.target.value); setError(null); }} placeholder="What did you think? Be honest..." maxLength={500}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && rating && text.trim()) { e.preventDefault(); submit(); } }}
              style={{ width: "100%", minHeight: 80, background: W.card, border: `1px solid ${error ? W.accent : W.border}`, borderRadius: 12, padding: "10px 14px", fontSize: 11, fontFamily: "monospace", outline: "none", resize: "none", lineHeight: 1.6 }}/>
          </div>
          {error && <div style={{ padding: "8px 10px", borderRadius: 8, background: W.accentDim, border: `1px solid ${W.accent}`, fontSize: 10, color: W.accent, fontFamily: "monospace", lineHeight: 1.5 }}>✗ {error}</div>}
          <div onClick={submit}
            style={{
              background: rating && text.trim() ? W.accent : W.card,
              border: `1px solid ${rating && text.trim() ? W.accent : W.border}`,
              color: rating && text.trim() ? "#fff" : W.dim,
              borderRadius: 12, padding: "12px", fontSize: 12, fontWeight: 700,
              textAlign: "center", fontFamily: "monospace",
              cursor: rating && text.trim() ? "pointer" : "default",
            }}>{isEdit ? "SAVE CHANGES" : "POST REVIEW"}</div>
        </>)}
      </div>
    </div>
  );
};
