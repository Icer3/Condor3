// Server-side paper-position store. Uses a JSON file at .data/positions.json.
// Per-device scoping via X-Device-Id header (browser-generated UUID).

import { NextRequest, NextResponse } from 'next/server';
import { PaperPosition } from '@/lib/paperTrading';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'positions.json');

type Store = Record<string, PaperPosition[]>; // deviceId → positions

async function readStore(): Promise<Store> {
  try {
    const txt = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(txt) as Store;
  } catch {
    return {};
  }
}

async function writeStore(store: Store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

function deviceId(req: NextRequest): string | null {
  const id = req.headers.get('x-device-id') ?? new URL(req.url).searchParams.get('device');
  if (!id || id.length < 4 || id.length > 64) return null;
  return id;
}

export async function GET(req: NextRequest) {
  const id = deviceId(req);
  if (!id) return NextResponse.json({ error: 'Missing X-Device-Id header' }, { status: 400 });
  const store = await readStore();
  return NextResponse.json({ positions: store[id] ?? [] });
}

export async function PUT(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const id = deviceId(req);
  if (!id) return NextResponse.json({ error: 'Missing X-Device-Id header' }, { status: 400 });
  if (!Array.isArray(body?.positions)) {
    return NextResponse.json({ error: 'Body must be { positions: PaperPosition[] }' }, { status: 400 });
  }
  const store = await readStore();
  store[id] = body.positions;
  await writeStore(store);
  return NextResponse.json({ ok: true, count: store[id].length });
}

export async function DELETE(req: NextRequest) {
  const id = deviceId(req);
  if (!id) return NextResponse.json({ error: 'Missing X-Device-Id header' }, { status: 400 });
  const store = await readStore();
  delete store[id];
  await writeStore(store);
  return NextResponse.json({ ok: true });
}
