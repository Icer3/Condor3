'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/', label: 'home' },
  { href: '/trade', label: 'trade' },
  { href: '/compare', label: 'compare' },
  { href: '/learn', label: 'learn' },
  { href: '/portfolio', label: 'portfolio' },
  { href: '/tools', label: 'tools' },
  { href: '/about', label: 'about' },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg-2)]/80 backdrop-blur-md sticky top-0 z-20">
      <div className="max-w-[1500px] mx-auto px-6 py-3 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-gradient-to-br from-[var(--green-2)] to-[var(--green-dim)] flex items-center justify-center text-[#06180c] font-bold text-sm shadow-[0_0_16px_rgba(34,197,94,0.4)]">
            ▌
          </div>
          <span className="text-[var(--fg)] group-hover:text-[var(--green)] transition font-semibold tracking-wide">condor.io</span>
        </Link>
        <nav className="flex items-center gap-1 ml-4">
          {tabs.map(t => {
            const active = path === t.href || (t.href !== '/' && path.startsWith(t.href));
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-4 py-1.5 rounded-full text-sm transition ${
                  active
                    ? 'bg-[var(--green-faint)] border border-[var(--green-dim)] text-[var(--green)] shadow-[0_0_12px_rgba(34,197,94,0.15)]'
                    : 'border border-transparent text-[var(--fg-dim)] hover:text-[var(--fg)] hover:bg-[var(--bg-3)]'
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <div className="text-[var(--fg-faint)] text-xs hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-3)] border border-[var(--border)]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--green)] opacity-60 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--green)]" />
          </span>
          ready
        </div>
      </div>
    </header>
  );
}