'use client'

import { useEffect, useState } from 'react'
import TopNav from '@/components/layout/TopNav'
import BottomBar from '@/components/layout/BottomBar'
import SearchCommand from '@/components/layout/SearchCommand'
import { useAppStore } from '@/lib/store'

interface FeedItem {
  title: string
  link: string
  pubDate: string
  source: string
  category: string
  description: string
}

const CATEGORY_COLORS: Record<string, string> = {
  CYBER: '#C8102E',
  DEFENSE: '#4A7C9B',
  OSINT: '#2ECC71',
  SURVEILLANCE: '#B8953E',
  POLICY: '#8B5CF6',
}

const CATEGORY_LABELS: Record<string, string> = {
  CYBER: 'Cybersecurity',
  DEFENSE: 'Defense',
  OSINT: 'OSINT',
  SURVEILLANCE: 'Surveillance & Privacy',
  POLICY: 'Policy & Law',
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return ''
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

export default function IntelPage() {
  const { setSearchOpen } = useAppStore()
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/intel-feeds')
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items || [])
        setFetchedAt(data.fetchedAt)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = items.filter((item) => {
    if (categoryFilter && item.category !== categoryFilter) return false
    if (filter) {
      const q = filter.toLowerCase()
      return (
        item.title.toLowerCase().includes(q) ||
        item.source.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      )
    }
    return true
  })

  const categories = Object.keys(CATEGORY_COLORS)
  const sourceCounts = new Map<string, number>()
  for (const item of items) {
    sourceCounts.set(item.source, (sourceCounts.get(item.source) || 0) + 1)
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col">
      <TopNav onSearchOpen={() => setSearchOpen(true)} />
      <SearchCommand />

      <div className="flex-1 pt-12 pb-7 bg-background overflow-hidden flex flex-col md:flex-row">
        {/* Left sidebar - sources (hidden on mobile) */}
        <div className="hidden md:block w-64 shrink-0 border-r border-border overflow-y-auto bg-surface/50 p-4">
          <h2 className="font-mono text-xs tracking-[0.2em] text-accent-red mb-4">
            OSINT FEEDS
          </h2>
          <p className="text-[10px] text-muted font-mono mb-4">
            {items.length} items from {sourceCounts.size} sources
          </p>

          {/* Category filters */}
          <div className="space-y-1 mb-6">
            <button
              onClick={() => setCategoryFilter(null)}
              className={`w-full text-left px-2 py-1.5 rounded text-xs font-mono transition-colors ${
                !categoryFilter ? 'text-foreground bg-surface-hover' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All Categories
            </button>
            {categories.map((cat) => {
              const count = items.filter((i) => i.category === cat).length
              if (count === 0) return null
              return (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs font-mono transition-colors flex items-center justify-between ${
                    categoryFilter === cat
                      ? 'text-foreground bg-surface-hover'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                    />
                    {CATEGORY_LABELS[cat]}
                  </div>
                  <span className="text-[10px] text-muted">{count}</span>
                </button>
              )
            })}
          </div>

          {/* Sources */}
          <div className="border-t border-border pt-4">
            <div className="text-[10px] font-mono tracking-wider text-muted mb-3 uppercase">Sources</div>
            <div className="space-y-1">
              {Array.from(sourceCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([source, count]) => (
                  <div key={source} className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                    <span className="truncate">{source}</span>
                    <span className="text-muted ml-2">{count}</span>
                  </div>
                ))}
            </div>
          </div>

          {fetchedAt && (
            <div className="mt-6 pt-4 border-t border-border">
              <div className="text-[9px] font-mono text-muted">
                Last fetched: {timeAgo(fetchedAt)}
              </div>
            </div>
          )}
        </div>

        {/* Main feed */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Search bar */}
          <div className="p-4 border-b border-border shrink-0">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search intel feeds..."
              className="w-full max-w-md px-3 py-2 bg-surface border border-border rounded text-sm font-mono text-foreground placeholder:text-muted focus:outline-none focus:border-accent-red/50"
            />
            {categoryFilter && (
              <div className="mt-2 flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border"
                  style={{
                    color: CATEGORY_COLORS[categoryFilter],
                    borderColor: CATEGORY_COLORS[categoryFilter] + '40',
                    backgroundColor: CATEGORY_COLORS[categoryFilter] + '10',
                  }}
                >
                  {CATEGORY_LABELS[categoryFilter]}
                  <button onClick={() => setCategoryFilter(null)} className="ml-1 hover:opacity-70">&times;</button>
                </span>
              </div>
            )}
          </div>

          {/* Feed items */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="h-16 bg-surface rounded animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="font-mono text-xs text-muted tracking-[0.2em] mb-2">NO RESULTS</div>
                  <p className="text-sm text-muted-foreground">
                    {items.length === 0
                      ? 'Could not fetch OSINT feeds. Check your network connection.'
                      : 'Try adjusting your search or category filter.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {filtered.map((item, i) => (
                  <a
                    key={i}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-6 py-3 hover:bg-surface/50 transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="w-1.5 h-1.5 rounded-full mt-2 shrink-0"
                        style={{ backgroundColor: CATEGORY_COLORS[item.category] || '#64748B' }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-muted-foreground group-hover:text-foreground transition-colors leading-snug mb-1">
                          {item.title}
                        </div>
                        {item.description && (
                          <div className="text-[11px] text-muted leading-relaxed mb-1.5 line-clamp-2">
                            {item.description}
                          </div>
                        )}
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-mono text-accent-blue">{item.source}</span>
                          <span
                            className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                            style={{
                              color: CATEGORY_COLORS[item.category],
                              backgroundColor: CATEGORY_COLORS[item.category] + '15',
                            }}
                          >
                            {item.category}
                          </span>
                          {item.pubDate && (
                            <span className="text-[10px] font-mono text-muted">{timeAgo(item.pubDate)}</span>
                          )}
                        </div>
                      </div>
                      <svg
                        className="w-3.5 h-3.5 text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <BottomBar />
    </div>
  )
}
