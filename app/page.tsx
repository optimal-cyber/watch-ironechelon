'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'

interface Stats {
  totalEntities: number
  totalConnections: number
  totalCountries: number
  typeCounts: { type: string; count: number }[]
}

export default function Home() {
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [showContent, setShowContent] = useState(false)

  useEffect(() => {
    // Show loading screen for at least 2s
    const timer = setTimeout(() => setLoaded(true), 2000)
    fetch('/api/stats')
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (loaded) {
      const t = setTimeout(() => setShowContent(true), 300)
      return () => clearTimeout(t)
    }
  }, [loaded])

  // Loading screen
  if (!loaded) {
    return (
      <div className="h-screen w-screen bg-[#0B0F1A] flex items-center justify-center overflow-hidden relative">
        {/* Animated background grid */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(200,16,46,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(200,16,46,0.3) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }} />

        {/* Scan line */}
        <motion.div
          className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-red/40 to-transparent"
          animate={{ top: ['0%', '100%'] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        />

        <div className="text-center z-10">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="mb-6"
          >
            <div className="font-mono text-[10px] tracking-[0.5em] text-muted mb-4">INITIALIZING SECURE CONNECTION</div>
            <div className="flex items-center justify-center gap-3 mb-2">
              <span className="text-accent-red text-xl">&lt;</span>
              <span className="font-mono text-2xl tracking-[0.3em] text-foreground font-bold">IRON ECHELON</span>
              <span className="text-accent-red text-xl">&gt;</span>
            </div>
            <div className="font-mono text-xs tracking-[0.2em] text-muted">DEFENSE TECH INTELLIGENCE</div>
          </motion.div>

          <motion.div
            initial={{ width: 0 }}
            animate={{ width: '12rem' }}
            transition={{ duration: 1.8, ease: 'easeInOut' }}
            className="mx-auto"
          >
            <div className="h-0.5 bg-accent-red/60 rounded" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-4 font-mono text-[9px] tracking-[0.3em] text-accent-green"
          >
            SYSTEMS ONLINE
          </motion.div>
        </div>
      </div>
    )
  }

  // Landing page
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: showContent ? 1 : 0 }}
      className="h-screen w-screen bg-[#0B0F1A] overflow-hidden relative flex flex-col"
    >
      {/* Background grid */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `linear-gradient(rgba(200,16,46,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(200,16,46,0.3) 1px, transparent 1px)`,
        backgroundSize: '60px 60px',
      }} />

      {/* Radial glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent-blue/5 rounded-full blur-[100px]" />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2">
          <span className="text-accent-red">&lt;</span>
          <span className="font-mono text-sm tracking-[0.2em] text-foreground font-bold">IRON ECHELON</span>
          <span className="text-accent-red">&gt;</span>
        </div>
        <div className="flex items-center gap-6">
          {[
            { label: 'MAP', href: '/map' },
            { label: 'NETWORK', href: '/network' },
            { label: 'FUNDERS', href: '/funders' },
            { label: 'CONTRACTS', href: '/contracts' },
            { label: 'INTEL', href: '/intel' },
            { label: 'ABOUT', href: '/about' },
          ].map((link) => (
            <button
              key={link.href}
              onClick={() => router.push(link.href)}
              className="font-mono text-[11px] tracking-[0.15em] text-muted hover:text-foreground transition-colors"
            >
              {link.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center max-w-3xl"
        >
          <div className="font-mono text-base tracking-[0.3em] text-slate-400 mb-6 font-medium">
            THEY BUILD THE WEAPONS.
          </div>
          <h1 className="font-mono text-5xl md:text-6xl tracking-[0.08em] text-white font-bold leading-tight mb-3">
            IT&apos;S TIME TO MAP
          </h1>
          <h1 className="font-mono text-5xl md:text-6xl tracking-[0.08em] font-bold leading-tight mb-10">
            <span className="text-accent-red underline decoration-accent-red/60 underline-offset-8 decoration-2">THE ARSENAL.</span>
          </h1>
          <p className="text-slate-400 text-base max-w-xl mx-auto leading-relaxed mb-14">
            Iron Echelon is an interactive intelligence platform mapping the defense technology,
            cybersecurity, AI, and surveillance ecosystem — companies, investors, contracts,
            and the connections between them.
          </p>
        </motion.div>

        {/* CTA Cards */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="grid grid-cols-3 gap-4 max-w-3xl w-full"
        >
          <button
            onClick={() => router.push('/map')}
            className="group bg-surface/60 border border-border hover:border-accent-green/50 rounded-lg px-5 py-4 text-left transition-all hover:bg-surface"
          >
            <div className="font-mono text-[10px] tracking-[0.2em] text-accent-green mb-2 flex items-center justify-between">
              EXPLORE ENTITIES
              <svg className="w-3.5 h-3.5 text-muted group-hover:text-accent-green transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </div>
            <div className="text-xs text-slate-400">
              Browse {stats?.totalEntities || '1,600+'} surveillance & defense tech companies on the globe.
            </div>
          </button>
          <button
            onClick={() => router.push('/network')}
            className="group bg-surface/60 border border-border hover:border-accent-gold/50 rounded-lg px-5 py-4 text-left transition-all hover:bg-surface"
          >
            <div className="font-mono text-[10px] tracking-[0.2em] text-accent-gold mb-2 flex items-center justify-between">
              MAP THE NETWORK
              <svg className="w-3.5 h-3.5 text-muted group-hover:text-accent-gold transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </div>
            <div className="text-xs text-slate-400">
              Visualize {stats?.totalConnections || '1,183'} connections in a force-directed network graph.
            </div>
          </button>
          <button
            onClick={() => router.push('/funders')}
            className="group bg-surface/60 border border-border hover:border-accent-blue/50 rounded-lg px-5 py-4 text-left transition-all hover:bg-surface"
          >
            <div className="font-mono text-[10px] tracking-[0.2em] text-accent-blue mb-2 flex items-center justify-between">
              FOLLOW THE MONEY
              <svg className="w-3.5 h-3.5 text-muted group-hover:text-accent-blue transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </div>
            <div className="text-xs text-slate-400">
              Track who funds surveillance tech — from BlackRock to state-backed funds.
            </div>
          </button>
        </motion.div>

        {/* Stats bar */}
        {stats && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="flex items-center gap-8 mt-12 font-mono text-[10px] tracking-[0.2em] text-muted"
          >
            <span><span className="text-accent-red font-bold">{stats.totalEntities}</span> ENTITIES</span>
            <span className="text-border">|</span>
            <span><span className="text-accent-blue font-bold">{stats.totalConnections}</span> CONNECTIONS</span>
            <span className="text-border">|</span>
            <span><span className="text-accent-green font-bold">{stats.totalCountries}</span> COUNTRIES</span>
            <span className="text-border">|</span>
            <span><span className="text-accent-gold font-bold">{stats.typeCounts.length}</span> CATEGORIES</span>
          </motion.div>
        )}
      </div>

      {/* Bottom */}
      <div className="relative z-10 px-8 py-4 flex items-center justify-between border-t border-border/30">
        <div className="font-mono text-[9px] tracking-[0.2em] text-muted">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-green mr-2" />
          SYSTEMS ACTIVE
        </div>
        <div className="font-mono text-[9px] tracking-[0.2em] text-muted">
          IRON ECHELON v1.0
        </div>
      </div>
    </motion.div>
  )
}
