'use client'

import { useEffect, useState, useCallback, useMemo, useRef, type ComponentType } from 'react'
import TopNav from '@/components/layout/TopNav'
import BottomBar from '@/components/layout/BottomBar'
import SearchCommand from '@/components/layout/SearchCommand'
import EntityList from '@/components/panels/EntityList'
import EntityDetail from '@/components/panels/EntityDetail'
import OverviewPanel from '@/components/panels/OverviewPanel'
import { useAppStore } from '@/lib/store'

interface GlobeWrapperProps {
  connections?: GlobeConnection[]
  markers?: GlobeMarker[]
  onMarkerClick?: (marker: GlobeMarker) => void
  focusTarget?: { lat: number; lon: number }
}

interface EntityListItem {
  id: string
  name: string
  slug: string
  type: string
  connectionCount: number
  headquartersCountry?: {
    name: string
    alpha2: string
    latitude: number
    longitude: number
  } | null
}

interface Stats {
  totalEntities: number
  totalConnections: number
  totalCountries: number
  typeCounts: { type: string; count: number }[]
  mostConnected: { id: string; name: string; slug: string; type: string; connectionCount: number }[]
}

interface EntityDetailData {
  id: string
  name: string
  slug: string
  type: string
  subTypes: string[]
  description: string
  headquartersCity: string | null
  headquartersCountry: { name: string; alpha2: string; latitude: number; longitude: number } | null
  founded: number | null
  website: string | null
  alsoKnownAs: string[]
  fundingType: string | null
  ticker: string | null
  stockExchange: string | null
  isin: string | null
  hasDirectTargets: boolean
  providingTo: Array<{ name: string; slug: string; lat: number; lon: number }>
  surveilling: Array<{ name: string; slug: string; lat: number; lon: number }>
  sources: { url: string; title: string; domain: string; date?: string }[]
  connectionsFrom: Array<{
    id: string
    connectionType: string
    confidence: string
    value: number | null
    targetEntity: {
      id: string
      name: string
      slug: string
      type: string
      headquartersCountry?: { name: string; alpha2: string; latitude: number; longitude: number } | null
    }
  }>
  connectionsTo: Array<{
    id: string
    connectionType: string
    confidence: string
    value: number | null
    sourceEntity: {
      id: string
      name: string
      slug: string
      type: string
      headquartersCountry?: { name: string; alpha2: string; latitude: number; longitude: number } | null
    }
  }>
  contracts: Array<{
    id: string
    description: string | null
    value: number | null
    awardDate: string | null
    agency: { name: string } | null
  }>
  connectionCount: number
  updatedAt: string
}

interface GlobeConnection {
  source: { lat: number; lon: number }
  target: { lat: number; lon: number }
  type: string
}

interface GlobeMarker {
  lat: number
  lon: number
  name: string
  count: number
}

export default function MainView() {
  const { selectedEntityId, selectEntity, searchQuery, typeFilters, sortBy, sortDirection, setSearchOpen, countryFilter, setCountryFilter } = useAppStore()
  const [entities, setEntities] = useState<EntityListItem[]>([])
  const [selectedEntity, setSelectedEntity] = useState<EntityDetailData | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [globeConnections, setGlobeConnections] = useState<GlobeConnection[]>([])
  const [globeMarkers, setGlobeMarkers] = useState<GlobeMarker[]>([])

  // Manual dynamic import — component reference stored once, never causes re-mount
  const [GlobeComponent, setGlobeComponent] = useState<ComponentType<GlobeWrapperProps> | null>(null)
  const globeImported = useRef(false)
  useEffect(() => {
    if (globeImported.current) return
    globeImported.current = true
    import('@/components/globe/GlobeWrapper').then(mod => {
      setGlobeComponent(() => mod.default)
    })
  }, [])

  const handleMarkerClick = useCallback((marker: GlobeMarker) => {
    setCountryFilter(marker.name)
  }, [setCountryFilter])

  // Fetch entities
  const fetchEntities = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      if (typeFilters.length > 0) params.set('types', typeFilters.join(','))
      if (countryFilter) params.set('country', countryFilter)
      params.set('sort', sortBy)
      params.set('direction', sortDirection)

      const res = await fetch(`/api/entities?${params}`)
      const data = await res.json()
      setEntities(data.entities || [])
    } catch (err) {
      console.error('Failed to fetch entities:', err)
    } finally {
      setLoading(false)
    }
  }, [searchQuery, typeFilters, sortBy, sortDirection, countryFilter])

  // Fetch stats
  useEffect(() => {
    fetch('/api/stats')
      .then((res) => res.json())
      .then(setStats)
      .catch(console.error)
  }, [])

  // Fetch entities on filter change
  useEffect(() => {
    fetchEntities()
  }, [fetchEntities])

  // Fetch selected entity detail
  useEffect(() => {
    if (!selectedEntityId) {
      setSelectedEntity(null)
      return
    }
    fetch(`/api/entities/${selectedEntityId}`)
      .then((res) => res.json())
      .then(setSelectedEntity)
      .catch(console.error)
  }, [selectedEntityId])

  // Fetch globe markers once — all countries with entity counts
  useEffect(() => {
    fetch('/api/globe-markers')
      .then((res) => res.json())
      .then((data) => setGlobeMarkers(data.markers || []))
      .catch(console.error)
  }, [])

  // Build globe connection arcs from selected entity
  useEffect(() => {
    const connections: GlobeConnection[] = []

    if (selectedEntity) {
      const entityCountry = selectedEntity.headquartersCountry
      if (entityCountry) {
        for (const country of selectedEntity.providingTo || []) {
          connections.push({
            source: { lat: entityCountry.latitude, lon: entityCountry.longitude },
            target: { lat: country.lat, lon: country.lon },
            type: 'SUPPLIES_TO',
          })
        }
        for (const country of selectedEntity.surveilling || []) {
          connections.push({
            source: { lat: entityCountry.latitude, lon: entityCountry.longitude },
            target: { lat: country.lat, lon: country.lon },
            type: 'SURVEILLING',
          })
        }
        for (const conn of selectedEntity.connectionsTo) {
          const sourceCountry = conn.sourceEntity?.headquartersCountry
          if (sourceCountry) {
            connections.push({
              source: { lat: sourceCountry.latitude, lon: sourceCountry.longitude },
              target: { lat: entityCountry.latitude, lon: entityCountry.longitude },
              type: 'FUNDED_BY',
            })
          }
        }
        for (const conn of selectedEntity.connectionsFrom) {
          const targetCountry = conn.targetEntity?.headquartersCountry
          if (targetCountry) {
            connections.push({
              source: { lat: entityCountry.latitude, lon: entityCountry.longitude },
              target: { lat: targetCountry.latitude, lon: targetCountry.longitude },
              type: conn.connectionType,
            })
          }
        }
      }
    }

    setGlobeConnections(connections)
  }, [selectedEntity])

  // Memoize globe props to prevent Canvas re-renders
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedMarkers = useMemo(() => globeMarkers, [JSON.stringify(globeMarkers)])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedConnections = useMemo(() => globeConnections, [JSON.stringify(globeConnections)])

  // Focus globe on selected entity's HQ
  const focusTarget = useMemo(() => {
    if (!selectedEntity?.headquartersCountry) return undefined
    return {
      lat: selectedEntity.headquartersCountry.latitude,
      lon: selectedEntity.headquartersCountry.longitude,
    }
  }, [selectedEntity?.headquartersCountry?.latitude, selectedEntity?.headquartersCountry?.longitude])

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col">
      <TopNav onSearchOpen={() => setSearchOpen(true)} />
      <SearchCommand />

      <div className="flex-1 flex pt-12 pb-7" style={{ minHeight: 0 }}>
        {/* Left sidebar - Entity list */}
        <div className="w-80 shrink-0 border-r border-border overflow-hidden flex flex-col bg-surface/50">
          {countryFilter && (
            <div className="px-3 py-2 border-b border-border bg-accent-blue/10 flex items-center justify-between">
              <span className="text-[10px] font-mono text-accent-blue tracking-wider">
                FILTERED: {countryFilter.toUpperCase()}
              </span>
              <button
                onClick={() => setCountryFilter(null)}
                className="text-muted hover:text-foreground text-xs"
              >
                &times;
              </button>
            </div>
          )}
          <EntityList
            entities={entities}
            loading={loading}
          />
        </div>

        {/* Center - Globe */}
        <div className="flex-1 relative bg-[#0B0F1A]" style={{ minHeight: 0 }}>
          {GlobeComponent ? (
            <GlobeComponent
              connections={memoizedConnections}
              markers={memoizedMarkers}
              onMarkerClick={handleMarkerClick}
              focusTarget={focusTarget}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[#0B0F1A]">
              <div className="text-center">
                <div className="font-mono text-xs text-muted tracking-[0.3em] mb-3">INITIALIZING</div>
                <div className="font-mono text-accent-red text-sm tracking-[0.2em]">IRON ECHELON</div>
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar - Detail/Overview panel */}
        <div className="w-96 shrink-0 border-l border-border overflow-y-auto bg-surface/50">
          {selectedEntity ? (
            <EntityDetail
              entity={selectedEntity}
              onClose={() => selectEntity(null)}
            />
          ) : (
            <OverviewPanel stats={stats} />
          )}
        </div>
      </div>

      <BottomBar lastUpdated={stats ? new Date().toISOString().split('T')[0] : undefined} />
    </div>
  )
}
