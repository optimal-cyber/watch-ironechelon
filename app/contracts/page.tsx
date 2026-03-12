'use client'

import { useEffect, useState, useMemo } from 'react'
import TopNav from '@/components/layout/TopNav'
import BottomBar from '@/components/layout/BottomBar'
import SearchCommand from '@/components/layout/SearchCommand'
import { useAppStore } from '@/lib/store'

interface ContractRow {
  id: string
  awardId: string | null
  description: string | null
  value: number | null
  awardDate: string | null
  endDate: string | null
  naicsCode: string | null
  psc: string | null
  placeOfPerformance: string | null
  entity: { id: string; name: string; type: string }
  agency: { id: string; name: string } | null
}

interface ConnectionRow {
  id: string
  connectionType: string
  confidence: string
  value: number | null
  sourceEntity: { id: string; name: string; type: string }
  targetEntity: { id: string; name: string; type: string }
}

function formatCurrency(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

type TabType = 'contracts' | 'investments'

export default function ContractsPage() {
  const { setSearchOpen, selectEntity } = useAppStore()
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [connections, setConnections] = useState<ConnectionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<TabType>('contracts')

  useEffect(() => {
    Promise.all([
      fetch('/api/contracts').then((r) => r.json()),
      fetch('/api/connections').then((r) => r.json()),
    ])
      .then(([contractData, connData]) => {
        setContracts(contractData.contracts || [])
        setConnections(connData.connections || [])
        // Auto-switch to investments tab if no contracts yet
        if ((!contractData.contracts || contractData.contracts.length === 0) && connData.connections?.length > 0) {
          setTab('investments')
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filteredContracts = useMemo(() => {
    if (!search) return contracts
    const q = search.toLowerCase()
    return contracts.filter(
      (c) =>
        c.entity.name.toLowerCase().includes(q) ||
        c.agency?.name.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q)
    )
  }, [contracts, search])

  const filteredConnections = useMemo(() => {
    if (!search) return connections
    const q = search.toLowerCase()
    return connections.filter(
      (c) =>
        c.sourceEntity.name.toLowerCase().includes(q) ||
        c.targetEntity.name.toLowerCase().includes(q)
    )
  }, [connections, search])

  const totalContractValue = contracts.reduce((sum, c) => sum + (c.value || 0), 0)
  const uniqueAgencies = new Set(contracts.map((c) => c.agency?.name).filter(Boolean)).size
  const uniqueContractors = new Set(contracts.map((c) => c.entity.name)).size

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col">
      <TopNav onSearchOpen={() => setSearchOpen(true)} />
      <SearchCommand />

      <div className="flex-1 pt-12 pb-7 bg-background overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border shrink-0">
          <h1 className="font-mono text-2xl tracking-[0.15em] text-foreground mb-2">
            GOVERNMENT CONTRACTS & INVESTMENTS
          </h1>
          <p className="text-sm text-slate-400 mb-4">
            Federal contract awards and investment relationships in the defense technology ecosystem.
          </p>

          {/* Tabs */}
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => setTab('contracts')}
              className={`font-mono text-xs tracking-wider px-3 py-1.5 rounded transition-colors ${
                tab === 'contracts'
                  ? 'text-accent-red bg-accent-red/10 border border-accent-red/30'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              GOV CONTRACTS ({contracts.length})
            </button>
            <button
              onClick={() => setTab('investments')}
              className={`font-mono text-xs tracking-wider px-3 py-1.5 rounded transition-colors ${
                tab === 'investments'
                  ? 'text-accent-green bg-accent-green/10 border border-accent-green/30'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              INVESTMENTS ({connections.length})
            </button>
          </div>

          {/* Stats */}
          {tab === 'contracts' ? (
            <div className="flex gap-6 mb-4">
              <div>
                <span className="font-mono text-lg text-accent-red">{contracts.length}</span>
                <span className="text-xs text-muted font-mono ml-2">CONTRACTS</span>
              </div>
              {totalContractValue > 0 && (
                <div>
                  <span className="font-mono text-lg text-accent-green">{formatCurrency(totalContractValue)}</span>
                  <span className="text-xs text-muted font-mono ml-2">TOTAL VALUE</span>
                </div>
              )}
              <div>
                <span className="font-mono text-lg text-accent-blue">{uniqueAgencies}</span>
                <span className="text-xs text-muted font-mono ml-2">AGENCIES</span>
              </div>
              <div>
                <span className="font-mono text-lg text-accent-gold">{uniqueContractors}</span>
                <span className="text-xs text-muted font-mono ml-2">CONTRACTORS</span>
              </div>
            </div>
          ) : (
            <div className="flex gap-6 mb-4">
              <div>
                <span className="font-mono text-lg text-accent-green">{connections.length}</span>
                <span className="text-xs text-muted font-mono ml-2">CONNECTIONS</span>
              </div>
              <div>
                <span className="font-mono text-lg text-accent-blue">{new Set(connections.map((c) => c.sourceEntity.id)).size}</span>
                <span className="text-xs text-muted font-mono ml-2">INVESTORS</span>
              </div>
              <div>
                <span className="font-mono text-lg text-accent-gold">{new Set(connections.map((c) => c.targetEntity.id)).size}</span>
                <span className="text-xs text-muted font-mono ml-2">ENTITIES</span>
              </div>
            </div>
          )}

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'contracts' ? 'Search contracts, agencies, companies...' : 'Search connections...'}
            className="w-full max-w-md px-3 py-2 bg-surface border border-border rounded text-sm font-mono text-foreground placeholder:text-muted focus:outline-none focus:border-accent-red/50"
          />

          {/* Data source */}
          <div className="mt-3 text-[9px] font-mono text-muted tracking-wider">
            {tab === 'contracts' ? (
              <>DATA SOURCE: <span className="text-accent-blue">USASPENDING.GOV</span> — Federal Award Data</>
            ) : (
              <>DATA SOURCE: <span className="text-accent-green">SURVEILLANCE WATCH</span> — Investment Relationships</>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-10 bg-surface rounded animate-pulse" />
              ))}
            </div>
          ) : tab === 'contracts' ? (
            contracts.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md">
                  <div className="font-mono text-accent-red text-lg tracking-[0.2em] mb-4">SYNCING CONTRACTS</div>
                  <p className="text-sm text-slate-400 mb-4">
                    Government contract data is being fetched from USAspending.gov.
                    Run the contract seeder to populate this view:
                  </p>
                  <code className="text-xs font-mono text-accent-blue bg-surface px-3 py-2 rounded block">
                    npx tsx prisma/seed-contracts.ts
                  </code>
                  <p className="text-xs text-muted mt-4">
                    This will fetch federal contract awards for tracked defense companies.
                  </p>
                </div>
              </div>
            ) : (
              <table className="w-full">
                <thead className="sticky top-0 bg-background border-b border-border z-10">
                  <tr>
                    <th className="text-left px-6 py-3 text-[10px] font-mono tracking-wider text-muted uppercase">Contractor</th>
                    <th className="text-left px-6 py-3 text-[10px] font-mono tracking-wider text-muted uppercase">Agency</th>
                    <th className="text-left px-6 py-3 text-[10px] font-mono tracking-wider text-muted uppercase">Description</th>
                    <th className="text-right px-6 py-3 text-[10px] font-mono tracking-wider text-muted uppercase">Value</th>
                    <th className="text-left px-6 py-3 text-[10px] font-mono tracking-wider text-muted uppercase">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContracts.map((contract) => (
                    <tr
                      key={contract.id}
                      className="border-b border-border/30 hover:bg-surface/50 transition-colors"
                    >
                      <td className="px-6 py-2.5">
                        <button
                          onClick={() => selectEntity(contract.entity.id)}
                          className="text-xs font-mono text-slate-300 hover:text-white transition-colors text-left"
                        >
                          {contract.entity.name}
                        </button>
                      </td>
                      <td className="px-6 py-2.5">
                        <span className="text-xs font-mono text-accent-blue">
                          {contract.agency?.name || 'N/A'}
                        </span>
                      </td>
                      <td className="px-6 py-2.5 max-w-sm">
                        <span className="text-[11px] text-muted-foreground line-clamp-2">
                          {contract.description || '—'}
                        </span>
                      </td>
                      <td className="px-6 py-2.5 text-right">
                        {contract.value ? (
                          <span className="text-xs font-mono text-accent-green font-bold">
                            {formatCurrency(contract.value)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                      <td className="px-6 py-2.5">
                        <span className="text-[10px] font-mono text-muted">
                          {contract.awardDate ? formatDate(contract.awardDate) : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            /* Investments table */
            <table className="w-full">
              <thead className="sticky top-0 bg-background border-b border-border z-10">
                <tr>
                  <th className="text-left px-6 py-3 text-[10px] font-mono tracking-wider text-muted uppercase">Investor</th>
                  <th className="text-left px-6 py-3 text-[10px] font-mono tracking-wider text-muted uppercase">Entity</th>
                  <th className="text-left px-6 py-3 text-[10px] font-mono tracking-wider text-muted uppercase">Type</th>
                  <th className="text-left px-6 py-3 text-[10px] font-mono tracking-wider text-muted uppercase">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {filteredConnections.slice(0, 500).map((conn) => (
                  <tr
                    key={conn.id}
                    className="border-b border-border/30 hover:bg-surface/50 transition-colors"
                  >
                    <td className="px-6 py-2">
                      <button
                        onClick={() => selectEntity(conn.sourceEntity.id)}
                        className="text-xs font-mono text-slate-300 hover:text-white transition-colors text-left"
                      >
                        {conn.sourceEntity.name}
                      </button>
                    </td>
                    <td className="px-6 py-2">
                      <button
                        onClick={() => selectEntity(conn.targetEntity.id)}
                        className="text-xs font-mono text-slate-300 hover:text-white transition-colors text-left"
                      >
                        {conn.targetEntity.name}
                      </button>
                    </td>
                    <td className="px-6 py-2">
                      <span className="text-[10px] font-mono text-accent-blue">
                        {conn.connectionType.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-2">
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        conn.confidence === 'confirmed'
                          ? 'text-accent-green bg-accent-green/10'
                          : 'text-accent-gold bg-accent-gold/10'
                      }`}>
                        {conn.confidence?.toUpperCase() || 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <BottomBar />
    </div>
  )
}
