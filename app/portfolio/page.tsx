'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Panel, Stat, Tag } from '@/components/Panels';
import {
  PaperPosition, loadPositions, savePositions, closePosition, deletePosition,
  realizedPnL, unrealizedPnL, positionSummary, mtmPerContract,
} from '@/lib/paperTrading';
import { StrategyMeta, StrategyId, STRATEGIES } from '@/lib/strategies';

type LiveQuote = { price: number; realizedVol: number | null };

/** Safe lookup that handles positions saved before the strategyId-only schema. */
function metaFor(p: { strategyId: string; strategyName?: string }): StrategyMeta {
  const real = STRATEGIES[p.strategyId as keyof typeof STRATEGIES]?.meta;
  if (real) return real;
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

export default function PortfolioPage() {
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [loading, setLoading] = useState(true);
  const [closeModal, setCloseModal] = useState<{ id: string; price: number; reason: string } | null>(null);

  useEffect(() => {
    setPositions(loadPositions());
    setLoading(false);
  }, []);

  // Refresh live quotes for unique open tickers.
  useEffect(() => {
    const tickers = Array.from(new Set(positions.filter(p => p.status === 'open').map(p => p.ticker)));
    Promise.all(tickers.map(async t => {
      try {
        const res = await fetch(`/api/quote/${t}`);
        const data = await res.json();
        if (data.price != null) return [t, { price: data.price, realizedVol: data.realizedVol }] as const;
      } catch {}
      return null;
    })).then(entries => {
      const next: Record<string, LiveQuote> = {};
      for (const e of entries) if (e) next[e[0]] = e[1];
      setQuotes(prev => ({ ...prev, ...next }));
    });
  }, [positions.length]);

  const summary = positionSummary(positions);
  const openPositions = positions.filter(p => p.status === 'open');
  const closedPositions = positions.filter(p => p.status === 'closed');

  // Compute total unrealized (requires live quotes).
  let totalUnrealized = 0;
  for (const p of openPositions) {
    const q = quotes[p.ticker];
    if (!q?.price) continue;
    const daysElapsed = Math.max(0, (Date.now() - new Date(p.openedAt).getTime()) / 86_400_000);
    const remaining = Math.max(0.01, p.dteAtEntry - daysElapsed);
    const sigma = q.realizedVol ?? 0.30;
    totalUnrealized += unrealizedPnL(p, q.price, sigma, 0.045, remaining);
  }

  if (loading) return <div className="text-[var(--fg-faint)] text-sm">loading portfolio…</div>;

  return (
    <div className="space-y-4">
      <Panel title="~/portfolio">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[var(--green)] glow">Paper Trading</h1>
            <p className="text-xs text-[var(--fg-faint)] mt-1">all positions stored locally in your browser · not real money</p>
          </div>
          <div className="flex gap-2">
            {positions.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Clear ALL paper positions? This cannot be undone.')) {
                    savePositions([]);
                    setPositions([]);
                  }
                }}
                className="text-xs px-3 py-1.5 border border-[var(--red-border)] text-[var(--red)] rounded-[var(--radius-sm)] hover:bg-[var(--red-faint)]/40"
              >
                clear all
              </button>
            )}
            <Link href="/trade" className="btn-primary px-4 py-1.5 rounded-[var(--radius-sm)] text-sm">
              + open new position
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="open" value={summary.openCount} />
          <Stat label="closed" value={summary.closedCount} />
          <Stat label="realized P/L" value={`${summary.realized >= 0 ? '+' : ''}$${summary.realized.toFixed(2)}`} accent={summary.realized >= 0 ? 'green' : 'red'} />
          <Stat label="unrealized P/L" value={`${totalUnrealized >= 0 ? '+' : ''}$${totalUnrealized.toFixed(2)}`} accent={totalUnrealized >= 0 ? 'green' : 'red'} />
          <Stat label="win rate" value={closedPositions.length ? `${(summary.winRate * 100).toFixed(0)}%` : '—'} />
        </div>
      </Panel>

      {positions.length === 0 ? (
        <Panel title="~/empty">
          <div className="text-center py-12 space-y-3">
            <div className="text-5xl">📭</div>
            <div className="text-[var(--fg-dim)]">no paper positions yet</div>
            <Link href="/trade" className="btn-primary inline-block px-5 py-2 rounded-[var(--radius-sm)] text-sm">
              open your first position →
            </Link>
          </div>
        </Panel>
      ) : (
        <>
          {openPositions.length > 0 && (
            <Panel title={`~/open_positions (${openPositions.length})`}>
              <div className="space-y-3">
                {openPositions.map(p => (
                  <PositionCard
                    key={p.id}
                    position={p}
                    quote={quotes[p.ticker]}
                    onClose={() => {
                      const q = quotes[p.ticker];
                      const price = q?.price ?? p.spotAtEntry;
                      setCloseModal({ id: p.id, price, reason: 'manual' });
                    }}
                  />
                ))}
              </div>
            </Panel>
          )}

          {closedPositions.length > 0 && (
            <Panel title={`~/history (${closedPositions.length})`}>
              <div className="space-y-2">
                {closedPositions.map(p => {
                  const pnl = realizedPnL(p);
                  return (
                    <div key={p.id} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)]/30 px-4 py-3 flex items-center gap-4">
                      <div className="text-2xl">{metaFor(p).emoji}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-[var(--fg)]">{metaFor(p).name} · {p.ticker}</div>
                        <div className="text-[10px] text-[var(--fg-faint)] uppercase tracking-wider mt-0.5">
                          {p.quantity}× · opened {new Date(p.openedAt).toLocaleDateString()} · closed {p.closedAt ? new Date(p.closedAt).toLocaleDateString() : '—'}
                          {p.closeReason && <span> · {p.closeReason}</span>}
                        </div>
                      </div>
                      <div className={`text-base font-bold tabular-nums ${pnl >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                      </div>
                      <button
                        onClick={() => setPositions(deletePosition(p.id))}
                        className="text-[var(--fg-faint)] hover:text-[var(--red)] text-xs"
                      >✕</button>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </>
      )}

      {closeModal && (
        <ClosePositionModal
          position={positions.find(p => p.id === closeModal.id)!}
          closePrice={closeModal.price}
          realizedVol={quotes[positions.find(p => p.id === closeModal.id!)?.ticker ?? '']?.realizedVol ?? 0.30}
          onConfirm={(reason) => {
            const pos = positions.find(p => p.id === closeModal.id)!;
            const q = quotes[pos.ticker];
            const remaining = Math.max(0.001, pos.dteAtEntry - (Date.now() - new Date(pos.openedAt).getTime()) / 86_400_000);
            const sigma = q?.realizedVol ?? 0.30;
            const closeValue = mtmPerContract(pos.legs, closeModal.price, sigma, 0.045, remaining);
            // Store the raw closeValue (cash flow out of the position) —
            // NOT sign-flipped. realizedPnL = (close + entry) * q then matches
            // the modal preview and the live list-view unrealized value.
            setPositions(closePosition(closeModal.id, closeValue, reason));
            setCloseModal(null);
          }}
          onCancel={() => setCloseModal(null)}
        />
      )}
    </div>
  );
}

function PositionCard({ position: p, quote, onClose }: { position: PaperPosition; quote?: LiveQuote; onClose: () => void; }) {
  const daysElapsed = Math.max(0, (Date.now() - new Date(p.openedAt).getTime()) / 86_400_000);
  const remaining = Math.max(0.01, p.dteAtEntry - daysElapsed);
  const sigma = quote?.realizedVol ?? 0.30;
  const spot = quote?.price ?? p.spotAtEntry;
  const unrealized = unrealizedPnL(p, spot, sigma, 0.045, remaining);

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-gradient-to-br from-[var(--bg-2)] to-[var(--bg)] p-4 hover:border-[var(--border-bright)] transition">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-2xl">{metaFor(p).emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-[var(--fg)]">{metaFor(p).name}</span>
            <span className="text-xs text-[var(--fg-dim)]">·</span>
            <span className="font-mono text-[var(--green)]">{p.ticker}</span>
            <Tag color={p.entryPerContract > 0 ? 'green' : 'yellow'}>
              {p.entryPerContract > 0 ? 'credit' : 'debit'} ${Math.abs(p.entryPerContract).toFixed(2)}
            </Tag>
            <span className="text-[10px] text-[var(--fg-faint)]">{p.quantity}× contract{p.quantity > 1 ? 's' : ''}</span>
          </div>
          <div className="text-[10px] text-[var(--fg-faint)] mt-0.5 uppercase tracking-wider">
            opened {new Date(p.openedAt).toLocaleString()} · {Math.round(remaining)} DTE left
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-[var(--fg-faint)] uppercase tracking-wider">unrealized</div>
          <div className={`text-xl font-bold tabular-nums ${unrealized >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
            {unrealized >= 0 ? '+' : ''}${unrealized.toFixed(2)}
          </div>
          <div className="text-[10px] text-[var(--fg-faint)] mt-0.1">spot ${spot.toFixed(2)}</div>
        </div>
        <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-[var(--radius-sm)] border border-[var(--border)] hover:border-[var(--red)] hover:text-[var(--red)] transition">
          close
        </button>
      </div>
      <div className="mt-3 pt-3 border-t border-[var(--border)] grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <Mini label="entry / contract" value={`${p.entryPerContract > 0 ? '+' : ''}$${p.entryPerContract.toFixed(2)}`} />
        <Mini label="max risk / contract" value={`$${Math.abs(p.entryPerContract * p.quantity).toFixed(0)}`} />
        <Mini label="legs" value={`${p.legs.length}`} />
        <Mini label="strategy type" value={STRATEGIES[p.strategyId]?.meta.category ?? '—'} />
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center bg-[var(--bg-3)]/40 rounded px-2 py-1">
      <span className="text-[var(--fg-faint)] uppercase tracking-wider text-[9px]">{label}</span>
      <span className="text-[var(--fg)] font-mono tabular-nums">{value}</span>
    </div>
  );
}

function ClosePositionModal({ position, closePrice, realizedVol = 0.30, onConfirm, onCancel }: {
  position: PaperPosition; closePrice: number; realizedVol?: number; onConfirm: (reason: string) => void; onCancel: () => void;
}) {
  const [reason, setReason] = useState('profit target');
  const daysElapsed = Math.max(0, (Date.now() - new Date(position.openedAt).getTime()) / 86_400_000);
  const remainingDays = Math.max(0.001, position.dteAtEntry - daysElapsed);
  // mtmPerContract expects T in YEARS, not days.
  const closeValue = mtmPerContract(position.legs, closePrice, realizedVol, 0.045, remainingDays / 365);
  const pnl = (closeValue + position.entryPerContract) * position.quantity;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="panel max-w-md w-full">
        <div className="panel-header">
          <span className="text-sm font-bold text-[var(--fg)]">close position</span>
          <button onClick={onCancel} className="text-[var(--fg-faint)] hover:text-[var(--fg)]">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <div className="text-xs text-[var(--fg-dim)] mb-1">{metaFor(position).emoji} {metaFor(position).name} · {position.ticker} ×{position.quantity}</div>
            <div className="text-[10px] text-[var(--fg-faint)] uppercase tracking-wider">closing at spot ${closePrice.toFixed(2)} · {Math.round(remainingDays)} DTE left</div>
          </div>
          <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)]/40 p-4 text-center">
            <div className="text-[10px] uppercase tracking-wider text-[var(--fg-faint)]">realized P/L</div>
            <div className={`text-3xl font-bold tabular-nums mt-1 ${pnl >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
              {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--fg-faint)] mb-1.5">reason</label>
            <select value={reason} onChange={e => setReason(e.target.value)} className="w-full">
              <option>profit target</option>
              <option>stop loss</option>
              <option>expiration approaching</option>
              <option>thesis invalidated</option>
              <option>manual</option>
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onCancel} className="flex-1 py-2 rounded-[var(--radius-sm)] border border-[var(--border)] text-[var(--fg-dim)] hover:text-[var(--fg)] transition">
              cancel
            </button>
            <button onClick={() => onConfirm(reason)} className="btn-primary flex-1 py-2 rounded-[var(--radius-sm)]">
              confirm close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}