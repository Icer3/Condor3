// Paper trading engine — localStorage-backed position store.
// Mark-to-market uses Black-Scholes on live quotes.

'use client';

import { Leg, StrategyId } from './strategies';
import { blackScholes } from './blackScholes';

export interface PaperPosition {
  id: string;
  strategyId: StrategyId;
  /** @deprecated Look up from STRATEGIES instead. Kept optional for backwards-compat with positions saved under the old schema. */
  strategyName?: string;
  /** @deprecated Same as strategyName. */
  emoji?: string;
  ticker: string;
  legs: Leg[];
  entryPerContract: number;  // negative = debit, positive = credit
  quantity: number;          // # of contracts
  openedAt: string;
  status: 'open' | 'closed';
  closedAt?: string;
  closePerContract?: number;
  closeReason?: string;
  // Snapshot of opening conditions for context.
  spotAtEntry: number;
  dteAtEntry: number;
  notes?: string;
}

const STORAGE_KEY = 'condor.paper.positions.v1';
const DEVICE_KEY = 'condor.device.id';

export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export async function loadPositionsServer(): Promise<PaperPosition[] | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/positions', { headers: { 'X-Device-Id': getDeviceId() } });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.positions) ? (data.positions as PaperPosition[]) : [];
  } catch { return null; }
}

export async function savePositionsServer(positions: PaperPosition[]): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const res = await fetch('/api/positions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': getDeviceId() },
      body: JSON.stringify({ positions }),
    });
    return res.ok;
  } catch { return false; }
}

export function loadPositions(): PaperPosition[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePositions(positions: PaperPosition[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
}

export function addPosition(p: PaperPosition) {
  const all = loadPositions();
  all.unshift(p);
  savePositions(all);
  return all;
}

export function closePosition(id: string, closePerContract: number, reason: string) {
  const all = loadPositions();
  const idx = all.findIndex(p => p.id === id);
  if (idx < 0) return all;
  all[idx] = {
    ...all[idx],
    status: 'closed',
    closedAt: new Date().toISOString(),
    closePerContract,
    closeReason: reason,
  };
  savePositions(all);
  return all;
}

export function deletePosition(id: string) {
  const all = loadPositions().filter(p => p.id !== id);
  savePositions(all);
  return all;
}

/** Mark-to-market value in **dollars per contract** (leg prices are per-share, so ×100 at the end). */
export function mtmPerContract(legs: Leg[], spot: number, sigma: number, r: number, T: number): number {
  let total = 0;
  for (const leg of legs) {
    if (leg.kind === 'stock') {
      total += leg.side === 'long' ? spot - leg.entryPrice : leg.entryPrice - spot;
      continue;
    }
    if (leg.strike == null || T <= 0) continue;
    const g = blackScholes({ S: spot, K: leg.strike, T, r, sigma });
    const value = leg.kind === 'call' ? g.call : g.put;
    total += leg.side === 'long' ? value : -value;
  }
  return total * 100;
}

/** Realized P/L for a closed position (per contract × quantity). */
export function realizedPnL(p: PaperPosition): number {
  if (p.status !== 'closed' || p.closePerContract == null) return 0;
  // entryPerContract and closePerContract are signed cash flows in $/contract:
  //   entry: + = credit (received), - = debit (paid)
  //   close: + = received on close, - = paid on close
  // Total PnL = (entry + close) × quantity.
  return (p.closePerContract + p.entryPerContract) * p.quantity;
}

/** Current (open) P/L based on live MTM. */
export function unrealizedPnL(p: PaperPosition, currentSpot: number, sigma: number, r: number, remainingDays: number): number {
  if (p.status !== 'open') return 0;
  const T = Math.max(0.0001, remainingDays / 365);
  const mtm = mtmPerContract(p.legs, currentSpot, sigma, r, T);
  // mtm is the net value of the position in $/contract (positive = asset, negative = liability).
  // Closing cash flow = mtm (sell asset for +mtm, pay |mtm| to buy back liability).
  // Total PnL = (entry + mtm) × quantity.
  return (mtm + p.entryPerContract) * p.quantity;
}

export function positionSummary(positions: PaperPosition[]) {
  const open = positions.filter(p => p.status === 'open');
  const closed = positions.filter(p => p.status === 'closed');
  const realized = closed.reduce((s, p) => s + realizedPnL(p), 0);
  const numWins = closed.filter(p => realizedPnL(p) > 0).length;
  return {
    total: positions.length,
    openCount: open.length,
    closedCount: closed.length,
    realized,
    unrealized: 0, // filled by caller once MTM is computed
    winRate: closed.length ? numWins / closed.length : 0,
    avgHoldDays: closed.length
      ? closed.reduce((s, p) => s + (new Date(p.closedAt!).getTime() - new Date(p.openedAt).getTime()) / 86_400_000, 0) / closed.length
      : 0,
  };
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}