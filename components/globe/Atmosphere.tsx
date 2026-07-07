'use client'

import { useMemo } from 'react'
import * as THREE from 'three'

export default function Atmosphere() {
  // Inner atmosphere - bright blue edge glow (Fresnel)
  const innerMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color('#5aa9ff') },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
          vec3 viewDir = normalize(-vPosition);
          float fresnel = 1.0 - max(dot(viewDir, vNormal), 0.0);
          fresnel = pow(fresnel, 2.2);

          gl_FragColor = vec4(uColor, fresnel * 0.85);
        }
      `,
    })
  }, [])

  // Outer atmosphere - soft wide haze
  const outerMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color('#2e6cba') },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
          vec3 viewDir = normalize(-vPosition);
          float fresnel = 1.0 - max(dot(viewDir, vNormal), 0.0);
          fresnel = pow(fresnel, 3.0);

          gl_FragColor = vec4(uColor, fresnel * 0.6);
        }
      `,
    })
  }, [])

  // Outermost soft halo — a wide, faint bloom-like glow for depth
  const haloMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color('#1c4f8f') },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vec3 viewDir = normalize(-vPosition);
          float fresnel = 1.0 - max(dot(viewDir, vNormal), 0.0);
          fresnel = pow(fresnel, 2.2);
          gl_FragColor = vec4(uColor, fresnel * 0.28);
        }
      `,
    })
  }, [])

  return (
    <>
      {/* Inner glow — sits just above the globe surface */}
      <mesh material={innerMaterial}>
        <sphereGeometry args={[1.22, 64, 64]} />
      </mesh>
      {/* Outer haze — larger, softer */}
      <mesh material={outerMaterial}>
        <sphereGeometry args={[1.5, 64, 64]} />
      </mesh>
      {/* Outermost soft halo */}
      <mesh material={haloMaterial}>
        <sphereGeometry args={[1.75, 48, 48]} />
      </mesh>
    </>
  )
}
