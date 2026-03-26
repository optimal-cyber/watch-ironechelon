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
  const ring3Ref = useRef<THREE.Mesh>(null)
  const position = latLonToVector3(lat, lon, 1.215)

  // Make marker face outward from globe surface
  const normal = new THREE.Vector3(...position).normalize()

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (ringRef.current) {
      const scale = 1 + Math.sin(t * 3) * 0.3
      ringRef.current.scale.set(scale, scale, scale)
      ;(ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.9 - Math.sin(t * 3) * 0.3
    }
    if (ring2Ref.current) {
      const scale = 1.5 + Math.sin(t * 2) * 0.5
      ring2Ref.current.scale.set(scale, scale, scale)
      ;(ring2Ref.current.material as THREE.MeshBasicMaterial).opacity = 0.5 - Math.sin(t * 2) * 0.2
    }
    if (ring3Ref.current) {
      const scale = 2.2 + Math.sin(t * 1.5) * 0.8
      ring3Ref.current.scale.set(scale, scale, scale)
      ;(ring3Ref.current.material as THREE.MeshBasicMaterial).opacity = 0.2 - Math.sin(t * 1.5) * 0.1
    }
  })

  return (
    <group position={position} onUpdate={(self) => self.lookAt(normal.clone().multiplyScalar(2))}>
      {/* Center dot */}
      <mesh>
        <sphereGeometry args={[0.018, 16, 16]} />
        <meshBasicMaterial color="#C8102E" />
      </mesh>
      {/* Inner pulsing ring */}
      <mesh ref={ringRef}>
        <ringGeometry args={[0.03, 0.042, 32]} />
        <meshBasicMaterial color="#C8102E" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      {/* Mid pulsing ring */}
      <mesh ref={ring2Ref}>
        <ringGeometry args={[0.055, 0.065, 32]} />
        <meshBasicMaterial color="#C8102E" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      {/* Outer pulsing ring — visible when zoomed in */}
      <mesh ref={ring3Ref}>
        <ringGeometry args={[0.08, 0.09, 32]} />
        <meshBasicMaterial color="#C8102E" transparent opacity={0.2} side={THREE.DoubleSide} />
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
  const targetRotationX = useRef<number | null>(null)
  const isAutoRotating = useRef(true)
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current)

    if (!focusTarget) {
      // Zoom back out
      targetDistance.current = 4.8
      isAutoRotating.current = true
      targetRotationY.current = null
      targetRotationX.current = null
      return
    }

    // Calculate rotation to face the target
    const [x, , z] = latLonToVector3(focusTarget.lat, focusTarget.lon, 1.2)
    targetRotationY.current = Math.atan2(-x, z)

    // Tilt globe to latitude — brings the target closer to screen center
    const latRad = (focusTarget.lat * Math.PI) / 180
    targetRotationX.current = -latRad * 0.35

    // Zoom in aggressively to see the location
    targetDistance.current = 2.2

    // Stop auto-rotation while focused
    isAutoRotating.current = false

    // Resume auto-rotate after 20 seconds
    resumeTimer.current = setTimeout(() => {
      isAutoRotating.current = true
      targetRotationY.current = null
      targetRotationX.current = null
    }, 20000)

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
    const speed = targetDistance.current < currentDist ? 1.8 : 2.5 // Zoom in slower for cinematic feel
    const newDist = THREE.MathUtils.lerp(currentDist, targetDistance.current, delta * speed)
    camera.position.normalize().multiplyScalar(newDist)

    // Smoothly rotate globe Y (longitude)
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

    // Smoothly tilt globe X (latitude) for better framing
    if (targetRotationX.current !== null) {
      const currentX = group.rotation.x
      const targetX = targetRotationX.current
      group.rotation.x = THREE.MathUtils.lerp(currentX, targetX, delta * 2)
      if (Math.abs(targetX - currentX) < 0.005) {
        group.rotation.x = targetX
      }
    } else {
      // Ease back to 0 tilt
      group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, 0, delta * 1.5)
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
