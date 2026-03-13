'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/map', label: 'MAP' },
  { href: '/network', label: 'NETWORK' },
  { href: '/funders', label: 'FUNDERS' },
  { href: '/contracts', label: 'CONTRACTS' },
  { href: '/intel', label: 'INTEL' },
  { href: '/about', label: 'ABOUT' },
]

export default function TopNav({ onSearchOpen }: { onSearchOpen?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-12 bg-surface/90 backdrop-blur-md border-b border-border flex items-center px-4 gap-6">
      <Link href="/" className="flex items-center gap-2 shrink-0">
        <span className="text-accent-red font-mono font-bold text-sm tracking-[0.2em]">
          &#x276E; IRON ECHELON
        </span>
      </Link>

      <div className="flex items-center gap-1 ml-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 text-xs font-mono tracking-wider transition-colors rounded ${
                isActive
                  ? 'text-accent-red bg-accent-red/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        <button
          onClick={onSearchOpen}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-muted rounded border border-border hover:border-border-bright hover:text-muted-foreground transition-colors"
        >
          <span>SEARCH</span>
          <kbd className="text-[10px] bg-background px-1 py-0.5 rounded">⌘K</kbd>
        </button>
        <Link
          href="/submit"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono tracking-wider text-accent-red rounded border border-accent-red/30 hover:bg-accent-red/10 hover:border-accent-red/50 transition-colors"
        >
          SUBMIT
        </Link>
      </div>
    </nav>
  )
}
