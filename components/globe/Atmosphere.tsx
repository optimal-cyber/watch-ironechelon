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
      uniforms: {
        uColor: { value: new THREE.Color('#3a7cbd') },
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
          fresnel = pow(fresnel, 2.5);

          gl_FragColor = vec4(uColor, fresnel * 0.7);
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
      uniforms: {
        uColor: { value: new THREE.Color('#1a4a7a') },
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
          fresnel = pow(fresnel, 4.0);

          gl_FragColor = vec4(uColor, fresnel * 0.5);
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
        <sphereGeometry args={[1.42, 64, 64]} />
      </mesh>
    </>
  )
}
