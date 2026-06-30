// IV rank / vol environment detection from historical prices.
// Computes "current" vol as the last ~21 days of realized vol,
// then ranks it against the min/max of 21-day rolling windows over the full history.
// Returns 0-100 where 0 = historically cheap, 100 = historically expensive.

export interface IVEnvironment {
  rank: number;          // 0-100, current vs historical range
  tier: 'cheap' | 'normal' | 'expensive';
  emoji: string;
  color: string;
  recommendation: string;
  minVol: number;
  maxVol: number;
  currentVol: number;    // last-21-day realized vol (annualized)
  medianVol: number;     // median over the year
}

// Annualized realized vol over a slice of closes.
function annualizedVol(closes: number[]): number {
  if (closes.length < 5) return NaN;
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length - 1)) * Math.sqrt(252);
  return isFinite(v) && v > 0 ? v : NaN;
}

export function computeIVEnvironment(currentVol: number, history: number[]): IVEnvironment {
  // Fallback when not enough data — use absolute vol tier and median rank.
  if (history.length < 22) {
    const tier = currentVol > 0.30 ? 'expensive' : currentVol > 0.15 ? 'normal' : 'cheap';
    return {
      rank: 50,
      tier,
      emoji: tier === 'expensive' ? '🔴' : tier === 'cheap' ? '🟢' : '🟡',
      color: tier === 'expensive' ? 'var(--red)' : tier === 'cheap' ? 'var(--green)' : 'var(--yellow)',
      recommendation: 'limited history — using absolute vol tier',
      minVol: currentVol, maxVol: currentVol, currentVol, medianVol: currentVol,
    };
  }

  // Compute "current" as the last ~21 trading days (≈ 1 month) of vol.
  // This matches what traders mean by "where is vol right now".
  const WINDOW = 21;
  const recentVol = annualizedVol(history.slice(-WINDOW));

  // Compute rolling 21-day vol windows across the full year.
  const vols: number[] = [];
  for (let i = WINDOW; i <= history.length; i++) {
    const v = annualizedVol(history.slice(i - WINDOW, i));
    if (isFinite(v)) vols.push(v);
  }

  // If we still don't have enough windows (very short history), use absolute fallback.
  if (vols.length < 5) {
    const tier = currentVol > 0.30 ? 'expensive' : currentVol > 0.15 ? 'normal' : 'cheap';
    return {
      rank: 50, tier,
      emoji: tier === 'expensive' ? '🔴' : tier === 'cheap' ? '🟢' : '🟡',
      color: tier === 'expensive' ? 'var(--red)' : tier === 'cheap' ? 'var(--green)' : 'var(--yellow)',
      recommendation: 'not enough history — using absolute vol tier',
      minVol: currentVol, maxVol: currentVol, currentVol, medianVol: currentVol,
    };
  }

  const sorted = [...vols].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const median = sorted[Math.floor(sorted.length / 2)];
  const range = max - min || 1e-6;

  // Use the recent (last-21-day) vol as the live reading, not the full-year average.
  const liveVol = isFinite(recentVol) ? recentVol : currentVol;
  const rank = Math.max(0, Math.min(100, ((liveVol - min) / range) * 100));

  let tier: 'cheap' | 'normal' | 'expensive' = 'normal';
  let emoji = '🟡';
  let color = 'var(--yellow)';
  let recommendation = 'vol is normal — no strong edge either direction';

  if (rank > 60) {
    tier = 'expensive'; emoji = '🔴'; color = 'var(--red)';
    recommendation = `expensive vol (rank ${rank.toFixed(0)}) — great for selling premium`;
  } else if (rank < 30) {
    tier = 'cheap'; emoji = '🟢'; color = 'var(--green)';
    recommendation = `cheap vol (rank ${rank.toFixed(0)}) — avoid selling, buy premium instead`;
  } else {
    recommendation = `normal vol (rank ${rank.toFixed(0)}) — pick strategy based on direction, not vol`;
  }

  return { rank, tier, emoji, color, recommendation, minVol: min, maxVol: max, currentVol: liveVol, medianVol: median };
}