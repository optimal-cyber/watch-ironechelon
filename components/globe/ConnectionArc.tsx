'use client'

import { useMemo } from 'react'
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

  return (
    <Line
      points={points}
      color={color}
      lineWidth={1.5}
      transparent
      opacity={0.6}
    />
  )
}
