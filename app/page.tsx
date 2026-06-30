'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Panel, Tag } from '@/components/Panels';
import { loadPositions, positionSummary, PaperPosition, mtmPerContract } from '@/lib/paperTrading';
import { STRATEGIES, StrategyMeta, StrategyId } from '@/lib/strategies';

/** Safe lookup that handles positions saved before strategyId-only schema. */
function metaFor(p: PaperPosition): StrategyMeta {
  const real = STRATEGIES[p.strategyId]?.meta;
  if (real) return real;
  // Fallback for positions saved before the strategyId-only schema or for unknown ids.
  return {
    id: (p.strategyId as StrategyId) ?? ('unknown' as StrategyId),
    name: p.strategyName ?? p.strategyId,
    emoji: '?',
    category: 'unknown',
    shortDescription: 'unknown strategy',
    longDescription: 'unknown strategy',
    whenToUse: '—',
    example: '—',
    riskProfile: 'undefined',
    maxProfitFormula: '—',
    maxLossFormula: '—',
  };
}

const SHORTCUTS = [
  { key: 'T', label: 'trade',     href: '/trade',     desc: 'open the trading calculator',     kbd: '⌘ T' },
  { key: 'C', label: 'compare',   href: '/compare',   desc: '2 strategies head-to-head',        kbd: '⌘ K' },
  { key: 'L', label: 'learn',     href: '/learn',     desc: '10-lesson strategy course',        kbd: '⌘ L' },
  { key: 'P', label: 'portfolio', href: '/portfolio', desc: 'review your paper positions',     kbd: '⌘ P' },
  { key: 'X', label: 'tools',     href: '/tools',     desc: 'backtest · presets · journal · chain · broker', kbd: '⌘ X' },
];

const STRATEGIES_CYCLE = [
  { id: 'iron_condor',      emoji: '🦅', name: 'Iron Condor',      cat: 'income · neutral',     blurb: 'high-prob · defined risk · range-bound · profits if price stays inside the wings.' },
  { id: 'iron_butterfly',   emoji: '🦋', name: 'Iron Butterfly',   cat: 'income · pinned',      blurb: 'pin the price · tighter profit zone than condor · max payout at the center strike.' },
  { id: 'bull_call_spread', emoji: '🐂', name: 'Bull Call Spread', cat: 'directional · bullish', blurb: 'mildly bullish · capped profit · cheaper than naked long call · defined max loss.' },
  { id: 'bear_put_spread',  emoji: '🐻', name: 'Bear Put Spread',  cat: 'directional · bearish',  blurb: 'mildly bearish · mirror of bull call · profits as price drops toward the long strike.' },
  { id: 'long_call',        emoji: '📈', name: 'Long Call',        cat: 'leverage · bullish',   blurb: 'unlimited upside · defined risk = premium paid · loses only the debit if wrong.' },
  { id: 'long_put',         emoji: '📉', name: 'Long Put',         cat: 'leverage · bearish',   blurb: 'big leverage on a drop · defined risk · ideal for hedging long stock.' },
  { id: 'long_straddle',    emoji: '🎢', name: 'Long Straddle',    cat: 'volatility · long',    blurb: 'profits on a big move either way · long premium · needs the move to clear both premiums.' },
  { id: 'long_strangle',    emoji: '🐍', name: 'Long Strangle',    cat: 'volatility · long',    blurb: 'cheaper than straddle · wider strikes · needs an even bigger move to win.' },
  { id: 'short_put',        emoji: '💰', name: 'Short Put (CSP)',  cat: 'income · bullish',     blurb: 'cash-secured · collect premium · obligated to buy at strike · great in flat markets.' },
  { id: 'covered_call',     emoji: '🏦', name: 'Covered Call',     cat: 'income · neutral',     blurb: 'own 100 shares · sell a call · collect premium · caps your upside at the strike.' },
];

export default function Home() {
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [clock, setClock] = useState('');
  const [mounted, setMounted] = useState(false);
  const [cycleIdx, setCycleIdx] = useState(0);

  useEffect(() => {
    setMounted(true);
    setPositions(loadPositions());
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      const d = new Date();
      setClock(d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' · ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setCycleIdx(i => (i + 1) % STRATEGIES_CYCLE.length), 4500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toUpperCase();
      const hit = SHORTCUTS.find(s => s.key === k);
      if (hit) { e.preventDefault(); window.location.href = hit.href; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const summary = useMemo(() => positionSummary(positions), [positions]);
  const formatMoney = (n: number) => (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(0);
  const pnlAccent = (n: number) => n >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]';

  const marketStatus = useMemo(() => {
    const now = new Date();
    const h = now.getUTCHours();
    const day = now.getUTCDay();
    const isWeekend = day === 0 || day === 6;
    const isHours = h >= 13 && h < 21;
    if (isWeekend) return { label: 'CLOSED · weekend', color: 'var(--fg-faint)' };
    if (isHours) return { label: 'OPEN · regular session', color: 'var(--green)' };
    return { label: 'CLOSED · after hours', color: 'var(--yellow)' };
  }, [clock]);

  const cycling = STRATEGIES_CYCLE[cycleIdx];

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>
      <div className="flex-1 min-h-0 overflow-hidden py-2">
        <div className="grid grid-rows-[2fr_1.4fr_auto] gap-2 h-full">

          {/* ============ HERO (stacked: logo on top, cycle below) ============ */}
          <Panel
            className="flex flex-col min-h-0 overflow-hidden relative"
            title="~condor"
            right={
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--fg-faint)] tabular-nums hidden md:inline">{clock || '··:··:··'}</span>
                <span className="text-xs font-bold" style={{ color: marketStatus.color }}>● {marketStatus.label}</span>
              </div>
            }
            contentClassName="p-3 flex-1 min-h-0 overflow-hidden"
          >
            <div className="flex flex-col items-center justify-center gap-1 relative overflow-hidden w-full" style={{ minHeight: 0 }}>
              <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: 'radial-gradient(ellipse at top, rgba(34,197,94,0.08), transparent 55%)',
              }} />

              {/* Top half: CONDOR logo + tagline + prompt */}
              <div className="relative z-10 flex flex-col items-center justify-center">
                <pre className="text-[var(--green)] text-[8px] sm:text-[10px] md:text-[12px] lg:text-[14px] xl:text-[15px] leading-[1.05] glow whitespace-pre text-center select-none font-bold max-w-full overflow-hidden">
{` ██████╗ ██████╗ ███╗   ██╗██████╗  ██████╗ ██████╗
██╔════╝██╔═══██╗████╗  ██║██╔══██╗██╔═══██╗██╔══██╗
██║     ██║   ██║██╔██╗ ██║██║  ██║██║   ██║██████╔╝
██║     ██║   ██║██║╚██╗██║██║  ██║██║   ██║██╔══██╗
╚██████╗╚██████╔╝██║ ╚████║██████╔╝╚██████╔╝██║  ███║
 ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝╚═════╝  ╚═════╝ ╚═╝  ╚═══╝`}
                </pre>
                <div className="text-center mt-1">
                  <div className="text-sm md:text-base text-[var(--fg-dim)] font-semibold">a focused <span className="text-[var(--green)] glow">options toolkit</span>.</div>
                  <div className="text-[10px] md:text-xs text-[var(--fg-faint)] mt-0.5 tracking-wider">paper trading · monte carlo · 10 strategies · all sim, no broker.</div>
                </div>
              </div>

              {/* Bottom half: cycling strategy spotlight with integrated shortcuts */}
              <div className="relative z-10 w-full max-w-[640px] mt-1">
                <div className="rounded-[var(--radius)] border-2 border-[var(--green-dim)] bg-gradient-to-br from-[var(--green-faint)]/30 to-[var(--bg-3)]/40 px-4 py-2 shadow-[0_0_20px_rgba(34,197,94,0.18)] flex flex-col gap-1.5">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl md:text-3xl">{cycling.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm md:text-base font-bold text-[var(--fg)]">{cycling.name}</span>
                        <Tag color="green">{cycling.cat}</Tag>
                      </div>
                      <div className="text-[10px] md:text-xs text-[var(--fg-dim)] leading-snug mt-0.5 line-clamp-1">{cycling.blurb}</div>
                    </div>
                    <div className="text-[var(--green)]/70 text-[10px] md:text-xs font-mono whitespace-nowrap hidden md:block">
                      <span className="opacity-60">user@condor</span>:<span className="text-[var(--fg)]">~</span>$
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <Link href={`/trade?strategy=${cycling.id}`} className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-2)]/60 px-2 py-1 hover:border-[var(--green-dim)] hover:shadow-[0_0_10px_rgba(34,197,94,0.2)] transition group">
                      <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded border border-[var(--green-dim)] bg-[var(--green-faint)] text-[var(--green)] text-[10px] font-bold font-mono">T</kbd>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-[var(--green)] font-bold leading-tight">trade now</div>
                        <div className="text-[8px] text-[var(--fg-faint)] leading-tight truncate">simulate it</div>
                      </div>
                      <span className="text-[var(--fg-faint)] group-hover:text-[var(--green)] transition text-xs">→</span>
                    </Link>
                    <Link href={`/learn?strategy=${cycling.id}`} className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-2)]/60 px-2 py-1 hover:border-[var(--green-dim)] hover:shadow-[0_0_10px_rgba(34,197,94,0.2)] transition group">
                      <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded border border-[var(--green-dim)] bg-[var(--green-faint)] text-[var(--green)] text-[10px] font-bold font-mono">L</kbd>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-[var(--green)] font-bold leading-tight">learn</div>
                        <div className="text-[8px] text-[var(--fg-faint)] leading-tight truncate">deep-dive</div>
                      </div>
                      <span className="text-[var(--fg-faint)] group-hover:text-[var(--green)] transition text-xs">→</span>
                    </Link>
                    <Link href={`/compare?a=${cycling.id}`} className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-2)]/60 px-2 py-1 hover:border-[var(--green-dim)] hover:shadow-[0_0_10px_rgba(34,197,94,0.2)] transition group">
                      <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded border border-[var(--green-dim)] bg-[var(--green-faint)] text-[var(--green)] text-[10px] font-bold font-mono">C</kbd>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-[var(--green)] font-bold leading-tight">compare</div>
                        <div className="text-[8px] text-[var(--fg-faint)] leading-tight truncate">vs another</div>
                      </div>
                      <span className="text-[var(--fg-faint)] group-hover:text-[var(--green)] transition text-xs">→</span>
                    </Link>
                  </div>

                  <div className="flex justify-center gap-1">
                    {STRATEGIES_CYCLE.map((_, i) => (
                      <button key={i} onClick={() => setCycleIdx(i)} className="w-1.5 h-1.5 rounded-full transition-all"
                        style={{
                          background: i === cycleIdx ? 'var(--green)' : 'var(--border-bright)',
                          boxShadow: i === cycleIdx ? '0 0 6px var(--green)' : 'none',
                          transform: i === cycleIdx ? 'scale(1.2)' : 'scale(1)',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          {/* ============ BODY ============ */}
          <div className="grid grid-cols-12 gap-2 min-h-0">
            <Panel
              className="col-span-12 lg:col-span-8 flex flex-col min-h-0"
              title="~open_positions"
              right={
                <div className="flex items-center gap-2">
                  <Tag color={positions.length ? 'green' : 'dim'}>{positions.length} open</Tag>
                  {mounted && summary.unrealized !== 0 && (
                    <span className={`text-xs font-bold tabular-nums ${pnlAccent(summary.unrealized)}`}>
                      {formatMoney(summary.unrealized)}
                    </span>
                  )}
                  <Link href="/portfolio" className="text-[10px] text-[var(--green)] hover:underline">/portfolio →</Link>
                </div>
              }
              contentClassName="p-2 flex-1 min-h-0 overflow-hidden"
            >
              {!mounted ? (
                <div className="h-full flex items-center justify-center text-[10px] text-[var(--fg-faint)] italic">⟳ loading…</div>
              ) : positions.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4">
                  <div className="text-3xl mb-1 opacity-40">📒</div>
                  <div className="text-sm text-[var(--fg-dim)] font-semibold">no open positions yet</div>
                  <div className="text-[11px] text-[var(--fg-faint)] mt-1 max-w-[320px] leading-snug">
                    simulate a trade in <code className="text-[var(--green)]">/trade</code> → click the paper button. your MTM appears here live.
                  </div>
                  <Link href="/trade" className="mt-2 text-[11px] px-2.5 py-1 rounded-[var(--radius-sm)] border border-[var(--green-dim)] bg-[var(--green-faint)] text-[var(--green)] hover:bg-[var(--green-faint)]/60 transition">
                    open /trade →
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-1 h-full overflow-hidden">
                  {positions.slice(0, 6).map(p => {
                    const opened = new Date(p.openedAt).getTime();
                    const daysOld = Math.max(0, Math.floor((Date.now() - opened) / 86_400_000));
                    const remainingDays = Math.max(0, p.dteAtEntry - daysOld);
                    const T = remainingDays / 365;
                    const mtm = mtmPerContract(p.legs, p.spotAtEntry, 0.30, 0.045, T);
                    const totalPnl = (mtm + p.entryPerContract) * p.quantity;
                    return (
                      <Link key={p.id} href="/portfolio" className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-2)]/40 px-2 py-1.5 hover:border-[var(--green-dim)] transition group">
                        <span className="text-lg">{metaFor(p).emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-sm font-bold text-[var(--fg)] group-hover:text-[var(--green)] transition">{p.ticker}</span>
                            <span className="text-[10px] text-[var(--fg-dim)] truncate">{metaFor(p).name}</span>
                          </div>
                          <div className="text-[9px] text-[var(--fg-faint)] tabular-nums">
                            {p.quantity}× · {remainingDays}d left · day {daysOld}/{p.dteAtEntry}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-bold tabular-nums ${pnlAccent(totalPnl)}`}>{formatMoney(totalPnl)}</div>
                          <div className="text-[9px] text-[var(--fg-faint)] tabular-nums">MTM</div>
                        </div>
                      </Link>
                    );
                  })}
                  {positions.length > 6 && (
                    <div className="text-[10px] text-[var(--fg-faint)] text-center mt-1">
                      +{positions.length - 6} more in /portfolio →
                    </div>
                  )}
                </div>
              )}
            </Panel>

            <Panel
              className="col-span-12 lg:col-span-4 flex flex-col min-h-0"
              title="~shortcuts"
              contentClassName="p-2 flex-1 min-h-0"
            >
              <div className="flex flex-col gap-1.5 h-full">
                {SHORTCUTS.map(s => (
                  <Link key={s.key} href={s.href} className="group flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-gradient-to-r from-[var(--bg-3)]/60 to-[var(--bg-2)]/40 px-2.5 py-2 hover:border-[var(--green-dim)] hover:shadow-[0_0_12px_rgba(34,197,94,0.15)] transition">
                    <kbd className="inline-flex items-center justify-center min-w-[28px] h-8 px-2 rounded border-2 border-[var(--green-dim)] bg-[var(--green-faint)] text-[var(--green)] text-base font-bold font-mono group-hover:shadow-[0_0_8px_rgba(34,197,94,0.5)] transition">{s.key}</kbd>
                    <div className="flex-1 min-w-0">
                      <div className="text-base font-bold text-[var(--fg)] group-hover:text-[var(--green)] transition flex items-center gap-1.5">
                        {s.label}
                        <span className="text-[9px] text-[var(--fg-faint)] font-mono">· {s.kbd}</span>
                      </div>
                      <div className="text-[10px] text-[var(--fg-dim)] leading-tight">{s.desc}</div>
                    </div>
                    <span className="text-[var(--fg-faint)] group-hover:text-[var(--green)] transition text-base">→</span>
                  </Link>
                ))}
              </div>
            </Panel>
          </div>

          {/* ============ DISCLAIMER ============ */}
          <div className="px-3 py-1.5 border-t border-[var(--border)] bg-[var(--bg-2)]/30 text-[10px] text-[var(--fg-faint)] leading-tight flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-center">
            <span><span className="text-[var(--yellow)] font-bold">⚠ educational tool only</span> · not investment advice</span>
            <span className="hidden md:inline">·</span>
            <span>options can lose more than the premium paid</span>
            <span className="hidden md:inline">·</span>
            <span>models assume log-normal returns, constant vol · real markets have gaps & skew</span>
            <span className="hidden md:inline">·</span>
            <Link href="/about" className="text-[var(--green)] hover:underline">/about for full →</Link>
          </div>

        </div>
      </div>
    </div>
  );
}