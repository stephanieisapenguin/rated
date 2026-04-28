// Standard Elo update for a head-to-head matchup. K=32 is the conventional
// rating volatility for "amateur"-tier competitions; we use it for movie
// preference comparisons which suit a moderately-fast adjustment.
//
// Returns the new ratings as `[winnerNew, loserNew]`.
export const calcElo = (wElo, lElo, k = 32) => {
  const exp = 1 / (1 + Math.pow(10, (lElo - wElo) / 400));
  return [Math.round(wElo + k * (1 - exp)), Math.round(lElo + k * (0 - (1 - exp)))];
};
