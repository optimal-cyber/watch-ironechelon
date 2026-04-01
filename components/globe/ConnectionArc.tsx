'use client'

import { useRef, useMemo, useEffect } from 'react'
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
  const drawProgress = useRef(0)
  const color = ARC_COLORS[type] || ARC_COLORS.DEFAULT
  const totalPoints = 80

  const curvePoints = useMemo(() => {
    const start = new THREE.Vector3(...latLonToVector3(source.lat, source.lon, 1.21))
    const end = new THREE.Vector3(...latLonToVector3(target.lat, target.lon, 1.21))

    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
    const dist = start.distanceTo(end)
    mid.normalize().multiplyScalar(1.21 + dist * 0.3)

    const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
    return curve.getPoints(totalPoints)
  }, [source.lat, source.lon, target.lat, target.lon])

  // Stable line object — created once, mutated via useFrame
  const lineObj = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(totalPoints * 3), 3))
    geo.setAttribute('aOpacity', new THREE.BufferAttribute(new Float32Array(totalPoints), 1))

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(color) } },
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

    return new THREE.Line(geo, mat)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Intentionally stable — color/geometry updated in useFrame

  // Update color uniform when type changes
  useEffect(() => {
    const mat = lineObj.material as THREE.ShaderMaterial
    mat.uniforms.uColor.value.set(color)
  }, [color, lineObj])

  // Reset draw-in when arc source/target changes
  useEffect(() => {
    drawProgress.current = 0
  }, [curvePoints])

  useFrame((_, delta) => {
    const geo = lineObj.geometry

    if (drawProgress.current < 1) {
      drawProgress.current = Math.min(1, drawProgress.current + delta * 1.25)
    }

    const drawnCount = Math.floor(drawProgress.current * totalPoints)
    const t = performance.now() * 0.001

    const pulseLen = 0.18
    const pulseSpeed = 0.6
    const pulseCenter = ((t * pulseSpeed) % 1.3) - 0.15

    const positions = geo.getAttribute('position') as THREE.BufferAttribute
    const opacities = geo.getAttribute('aOpacity') as THREE.BufferAttribute

    for (let i = 0; i < totalPoints; i++) {
      positions.setXYZ(i, curvePoints[i].x, curvePoints[i].y, curvePoints[i].z)

      if (i >= drawnCount) {
        opacities.array[i] = 0
        continue
      }

      const frac = i / totalPoints
      const base = 0.35 * Math.sin(frac * Math.PI)
      const distToPulse = Math.abs(frac - pulseCenter)
      const pulse = Math.max(0, 1 - distToPulse / pulseLen) * 0.55

      opacities.array[i] = Math.min(1, base + pulse)
    }

    positions.needsUpdate = true
    opacities.needsUpdate = true
  })

  return <primitive object={lineObj} />
}
