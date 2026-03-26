'use client'

import { useRef, memo, useEffect, useCallback, useMemo } from 'react'
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
  const [dayMap, nightMap] = useTexture([
    '/textures/earth-blue-marble.jpg',
    '/textures/earth-night-2k.jpg',
  ])

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        dayTexture: { value: dayMap },
        nightTexture: { value: nightMap },
        sunDirection: { value: new THREE.Vector3(1, 0.3, 0.8).normalize() },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;

        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D dayTexture;
        uniform sampler2D nightTexture;
        uniform vec3 sunDirection;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;

        void main() {
          vec3 worldNormal = normalize(vWorldPosition);
          float sunDot = dot(worldNormal, sunDirection);

          // Smooth day/night transition
          float dayFactor = smoothstep(-0.15, 0.25, sunDot);

          vec3 dayColor = texture2D(dayTexture, vUv).rgb;
          vec3 nightColor = texture2D(nightTexture, vUv).rgb;

          // Darken the day side slightly for that SurveillanceWatch look
          dayColor *= 0.75 + 0.25 * dayFactor;

          // Boost night city lights
          nightColor *= 1.8;

          // Blend: day side shows geography, night side shows city lights
          vec3 color = mix(nightColor, dayColor, dayFactor);

          // Add subtle blue tint to ocean/dark areas (surveillance aesthetic)
          float luminance = dot(color, vec3(0.299, 0.587, 0.114));
          vec3 blueTint = vec3(0.05, 0.08, 0.15);
          color = color + blueTint * (1.0 - luminance) * 0.4;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    })
  }, [dayMap, nightMap])

  return (
    <mesh material={material}>
      <sphereGeometry args={[1.2, 64, 64]} />
    </mesh>
  )
})

useTexture.preload('/textures/earth-blue-marble.jpg')
useTexture.preload('/textures/earth-night-2k.jpg')

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
      {/* Outer pulsing ring */}
      <mesh ref={ring3Ref}>
        <ringGeometry args={[0.08, 0.09, 32]} />
        <meshBasicMaterial color="#C8102E" transparent opacity={0.2} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

// Camera controller that works WITH OrbitControls by directly positioning the camera
// and calling controls.update() to sync OrbitControls' internal state
function CameraController({
  focusTarget,
  groupRef,
}: {
  focusTarget?: { lat: number; lon: number }
  groupRef: React.RefObject<THREE.Group | null>
}) {
  const { camera, controls } = useThree()
  const targetCameraPos = useRef(new THREE.Vector3(0, 0, 4.8))
  const isAnimating = useRef(false)
  const isAutoRotating = useRef(true)
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const disableOrbitControls = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctrl = controls as any
    if (ctrl) ctrl.enabled = false
  }, [controls])

  const enableOrbitControls = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctrl = controls as any
    if (ctrl) ctrl.enabled = true
  }, [controls])

  const syncOrbitControls = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctrl = controls as any
    if (ctrl && ctrl.update) {
      // Sync OrbitControls internal state to match our camera position
      ctrl.target.set(0, 0, 0)
      ctrl.update()
    }
  }, [controls])

  useEffect(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current)

    if (!focusTarget) {
      // Zoom back out
      targetCameraPos.current.set(0, 0, 4.8)
      isAnimating.current = true
      isAutoRotating.current = true

      // Re-enable orbit controls after zoom-out animation
      resumeTimer.current = setTimeout(() => {
        enableOrbitControls()
        isAnimating.current = false
      }, 2000)
      return
    }

    // Calculate camera position looking at the target on the globe surface
    // Position camera along the vector from globe center through the target point
    const [x, y, z] = latLonToVector3(focusTarget.lat, focusTarget.lon, 2.4)
    targetCameraPos.current.set(x, y, z)

    // Disable OrbitControls so we have full control during animation
    disableOrbitControls()
    isAnimating.current = true
    isAutoRotating.current = false

    // Re-enable OrbitControls after animation settles (user can then manually rotate)
    resumeTimer.current = setTimeout(() => {
      syncOrbitControls()
      enableOrbitControls()
      isAnimating.current = false

      // Resume auto-rotate much later
      resumeTimer.current = setTimeout(() => {
        isAutoRotating.current = true
      }, 30000)
    }, 3000)

    return () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current)
    }
  }, [focusTarget, disableOrbitControls, enableOrbitControls, syncOrbitControls])

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return

    if (isAnimating.current) {
      // Smoothly lerp camera to target position
      camera.position.lerp(targetCameraPos.current, delta * 1.8)
      camera.lookAt(0, 0, 0)

      // Ease globe rotation to 0 so we see the correct hemisphere
      group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, 0, delta * 2)
      group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, 0, delta * 2)

      // Sync orbit controls to keep them in sync with our animation
      syncOrbitControls()
    } else if (isAutoRotating.current && !focusTarget) {
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
