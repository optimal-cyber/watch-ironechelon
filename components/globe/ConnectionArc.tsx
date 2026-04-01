'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineRef = useRef<any>(null)

  const { points, color } = useMemo(() => {
    const start = new THREE.Vector3(...latLonToVector3(source.lat, source.lon, 1.21))
    const end = new THREE.Vector3(...latLonToVector3(target.lat, target.lon, 1.21))

    const mid = new THREE.Vector3()
      .addVectors(start, end)
      .multiplyScalar(0.5)
    const dist = start.distanceTo(end)
    mid.normalize().multiplyScalar(1.21 + dist * 0.3)

    const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
    const pts = curve.getPoints(50)

    return {
      points: pts.map((p) => [p.x, p.y, p.z] as [number, number, number]),
      color: ARC_COLORS[type] || ARC_COLORS.DEFAULT,
    }
  }, [source, target, type])

  // Animate the dash offset to create a traveling pulse effect
  useFrame((_, delta) => {
    if (lineRef.current) {
      const mat = lineRef.current.material
      if (mat && 'dashOffset' in mat) {
        mat.dashOffset -= delta * 0.4
      }
    }
  })

  return (
    <Line
      ref={lineRef}
      points={points}
      color={color}
      lineWidth={1.5}
      transparent
      opacity={0.7}
      dashed
      dashScale={6}
      dashSize={0.8}
      gapSize={0.4}
    />
  )
}
