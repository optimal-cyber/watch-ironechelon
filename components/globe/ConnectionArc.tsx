'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { latLonToVector3 } from './Globe'

const ARC_COLORS: Record<string, string> = {
  SUPPLIES_TO: '#2ECC71',
  SURVEILLING: '#B8953E',
  CONTRACTS: '#2ECC71',
  FUNDED_BY: '#4A7C9B',
  INVESTED_IN: '#4A7C9B',
  ACQUIRED: '#C8102E',
  SUBSIDIARY: '#C8102E',
  PARTNERSHIP: '#8B5CF6',
  DEFAULT: '#64748B',
}

export default function ConnectionArc({
  source,
  target,
  type,
}: {
  source: { lat: number; lon: number }
  target: { lat: number; lon: number }
  type: string
}) {
  const lineRef = useRef<THREE.Line>(null)
  const drawProgress = useRef(0) // 0 → 1 draw-in animation
  const color = ARC_COLORS[type] || ARC_COLORS.DEFAULT

  const { positions, opacities, totalPoints } = useMemo(() => {
    const start = new THREE.Vector3(...latLonToVector3(source.lat, source.lon, 1.21))
    const end = new THREE.Vector3(...latLonToVector3(target.lat, target.lon, 1.21))

    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
    const dist = start.distanceTo(end)
    mid.normalize().multiplyScalar(1.21 + dist * 0.3)

    const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
    const n = 80
    const pts = curve.getPoints(n)

    const pos = new Float32Array(n * 3)
    const alpha = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      pos[i * 3] = pts[i].x
      pos[i * 3 + 1] = pts[i].y
      pos[i * 3 + 2] = pts[i].z
      alpha[i] = 0
    }
    return { positions: pos, opacities: alpha, totalPoints: n }
  }, [source, target])

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1))
    return geo
  }, [positions, opacities])

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
      },
      vertexShader: `
        attribute float aOpacity;
        varying float vOpacity;
        void main() {
          vOpacity = aOpacity;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vOpacity;
        void main() {
          gl_FragColor = vec4(uColor, vOpacity);
        }
      `,
    })
  }, [color])

  useFrame((_, delta) => {
    if (!lineRef.current) return
    const geo = lineRef.current.geometry
    const attr = geo.getAttribute('aOpacity') as THREE.BufferAttribute
    if (!attr) return

    // Draw-in: ramp progress from 0 → 1 over ~0.8s
    if (drawProgress.current < 1) {
      drawProgress.current = Math.min(1, drawProgress.current + delta * 1.25)
    }

    const drawnCount = Math.floor(drawProgress.current * totalPoints)
    const t = performance.now() * 0.001 // seconds

    // Traveling pulse — a bright window slides along the arc
    const pulseLen = 0.18
    const pulseSpeed = 0.6
    const pulseCenter = ((t * pulseSpeed) % 1.3) - 0.15 // loop with gap

    for (let i = 0; i < totalPoints; i++) {
      if (i >= drawnCount) {
        attr.array[i] = 0
        continue
      }

      const frac = i / totalPoints
      // Base opacity: fade in from source, fade out at tip
      const base = 0.35 * Math.sin(frac * Math.PI)

      // Traveling pulse contribution
      const distToPulse = Math.abs(frac - pulseCenter)
      const pulse = Math.max(0, 1 - distToPulse / pulseLen) * 0.55

      attr.array[i] = Math.min(1, base + pulse)
    }

    attr.needsUpdate = true
  })

  // Reset draw progress when connections change
  useMemo(() => {
    drawProgress.current = 0
  }, [source, target])

  return (
    <primitive object={new THREE.Line(geometry, material)} ref={lineRef} />
  )
}
