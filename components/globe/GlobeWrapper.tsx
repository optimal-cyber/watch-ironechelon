'use client'

import { Suspense, Component, type ReactNode, useState, useEffect, useRef, memo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Preload } from '@react-three/drei'
import Globe from './Globe'

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

class GlobeErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.error('Globe error:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#0B0F1A]">
          <div className="text-center">
            <div className="font-mono text-xs text-muted tracking-[0.3em] mb-2">GLOBE ERROR</div>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="font-mono text-xs text-accent-red hover:text-accent-red/80"
            >
              RETRY
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Static config objects — must never be recreated or Canvas remounts
const CAMERA = { position: [0, 0, 4.8] as [number, number, number], fov: 45 }
const GL = { antialias: true, alpha: true, powerPreference: 'default' as const }
const STYLE = { background: '#0B0F1A' }

// Memoize to prevent Globe re-renders from propagating to Canvas
const MemoGlobe = memo(Globe)

export default function GlobeWrapper({
  connections = [],
  markers = [],
  onMarkerClick,
  focusTarget,
}: {
  connections?: GlobeConnection[]
  markers?: GlobeMarker[]
  onMarkerClick?: (marker: GlobeMarker) => void
  focusTarget?: { lat: number; lon: number }
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  // Wait for container to have real dimensions before mounting Canvas
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const check = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width > 0 && height > 0) {
        setReady(true)
        observer.disconnect()
      }
    }

    const observer = new ResizeObserver(check)
    observer.observe(el)
    check()
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ position: 'absolute', inset: 0, minHeight: '400px' }}
    >
      {ready && (
        <GlobeErrorBoundary>
          <Canvas
            camera={CAMERA}
            gl={GL}
            style={STYLE}
            frameloop="always"
            resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
            onCreated={(state) => {
              const canvas = state.gl.domElement
              canvas.addEventListener('webglcontextlost', (e) => {
                e.preventDefault()
                console.warn('WebGL context lost')
              })
              canvas.addEventListener('webglcontextrestored', () => {
                console.warn('WebGL context restored')
                state.invalidate()
              })
            }}
          >
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 3, 5]} intensity={0.8} />

            <Suspense fallback={null}>
              <MemoGlobe
                connections={connections}
                markers={markers}
                onMarkerClick={onMarkerClick}
                focusTarget={focusTarget}
              />
              <Preload all />
            </Suspense>

            <OrbitControls
              enablePan={false}
              enableZoom={true}
              minDistance={1.8}
              maxDistance={8}
              autoRotate={false}
              rotateSpeed={0.5}
              zoomSpeed={0.5}
              enableDamping={true}
              dampingFactor={0.1}
            />
          </Canvas>
        </GlobeErrorBoundary>
      )}
    </div>
  )
}
