'use client'

import { useRef, memo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Stars, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import Atmosphere from './Atmosphere'
import ConnectionArc from './ConnectionArc'
import CountryMarker from './CountryMarker'

export function latLonToVector3(
  lat: number,
  lon: number,
  radius: number = 1.2
): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  const x = -(radius * Math.sin(phi) * Math.cos(theta))
  const z = radius * Math.sin(phi) * Math.sin(theta)
  const y = radius * Math.cos(phi)
  return [x, y, z]
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

const EarthSphere = memo(function EarthSphere() {
  const texture = useTexture('/textures/earth-night.jpg')
  return (
    <mesh>
      <sphereGeometry args={[1.2, 64, 64]} />
      <meshStandardMaterial
        map={texture}
        emissiveMap={texture}
        emissive={new THREE.Color('#ffffff')}
        emissiveIntensity={1.5}
        roughness={1}
        metalness={0}
      />
    </mesh>
  )
})

useTexture.preload('/textures/earth-night.jpg')

const GlobeOverlays = memo(function GlobeOverlays({
  connections,
  markers,
  onMarkerClick,
}: {
  connections: GlobeConnection[]
  markers: GlobeMarker[]
  onMarkerClick?: (marker: GlobeMarker) => void
}) {
  return (
    <>
      {markers.map((marker) => (
        <CountryMarker
          key={`marker-${marker.lat}-${marker.lon}`}
          lat={marker.lat}
          lon={marker.lon}
          name={marker.name}
          count={marker.count}
          onClick={() => onMarkerClick?.(marker)}
        />
      ))}
      {connections.map((conn, i) => (
        <ConnectionArc
          key={`arc-${i}`}
          source={conn.source}
          target={conn.target}
          type={conn.type}
        />
      ))}
    </>
  )
})

// Pulsing target marker for selected entity HQ
function HQMarker({ lat, lon }: { lat: number; lon: number }) {
  const ringRef = useRef<THREE.Mesh>(null)
  const ring2Ref = useRef<THREE.Mesh>(null)
  const position = latLonToVector3(lat, lon, 1.22)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (ringRef.current) {
      const scale = 1 + Math.sin(t * 3) * 0.3
      ringRef.current.scale.set(scale, scale, scale)
      ;(ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.8 - Math.sin(t * 3) * 0.3
    }
    if (ring2Ref.current) {
      const scale = 1.5 + Math.sin(t * 2) * 0.5
      ring2Ref.current.scale.set(scale, scale, scale)
      ;(ring2Ref.current.material as THREE.MeshBasicMaterial).opacity = 0.4 - Math.sin(t * 2) * 0.2
    }
  })

  return (
    <group position={position}>
      {/* Center dot */}
      <mesh>
        <sphereGeometry args={[0.015, 16, 16]} />
        <meshBasicMaterial color="#C8102E" />
      </mesh>
      {/* Inner pulsing ring */}
      <mesh ref={ringRef}>
        <ringGeometry args={[0.025, 0.035, 32]} />
        <meshBasicMaterial color="#C8102E" transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
      {/* Outer pulsing ring */}
      <mesh ref={ring2Ref}>
        <ringGeometry args={[0.045, 0.055, 32]} />
        <meshBasicMaterial color="#C8102E" transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

// Camera controller that handles zoom + rotation to focusTarget
function CameraController({
  focusTarget,
  groupRef,
}: {
  focusTarget?: { lat: number; lon: number }
  groupRef: React.RefObject<THREE.Group | null>
}) {
  const { camera } = useThree()
  const targetDistance = useRef(4.8)
  const targetRotationY = useRef<number | null>(null)
  const isAutoRotating = useRef(true)
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current)

    if (!focusTarget) {
      // Zoom back out
      targetDistance.current = 4.8
      isAutoRotating.current = true
      targetRotationY.current = null
      return
    }

    // Calculate rotation to face the target
    const [x, , z] = latLonToVector3(focusTarget.lat, focusTarget.lon, 1.2)
    targetRotationY.current = Math.atan2(-x, z)

    // Zoom in gently
    targetDistance.current = 3.6

    // Stop auto-rotation while focused
    isAutoRotating.current = false

    // Resume auto-rotate after 8 seconds
    resumeTimer.current = setTimeout(() => {
      isAutoRotating.current = true
      targetRotationY.current = null
    }, 8000)

    return () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current)
    }
  }, [focusTarget])

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return

    // Smoothly animate camera distance (zoom)
    const currentPos = camera.position.clone()
    const currentDist = currentPos.length()
    const newDist = THREE.MathUtils.lerp(currentDist, targetDistance.current, delta * 2)
    camera.position.normalize().multiplyScalar(newDist)

    // Smoothly rotate globe to target
    if (targetRotationY.current !== null) {
      const current = group.rotation.y
      let target = targetRotationY.current

      // Shortest path
      let diff = target - current
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      target = current + diff

      group.rotation.y = THREE.MathUtils.lerp(current, target, delta * 3)

      if (Math.abs(diff) < 0.01) {
        group.rotation.y = targetRotationY.current
        targetRotationY.current = null
      }
    } else if (isAutoRotating.current) {
      group.rotation.y += delta * 0.05
    }
  })

  return null
}

export default function Globe({
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
  const groupRef = useRef<THREE.Group>(null)

  return (
    <>
      <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade speed={0.5} />

      <CameraController focusTarget={focusTarget} groupRef={groupRef} />

      <group ref={groupRef}>
        <EarthSphere />
        <Atmosphere />
        <GlobeOverlays
          connections={connections}
          markers={markers}
          onMarkerClick={onMarkerClick}
        />
        {focusTarget && (
          <HQMarker lat={focusTarget.lat} lon={focusTarget.lon} />
        )}
      </group>
    </>
  )
}
