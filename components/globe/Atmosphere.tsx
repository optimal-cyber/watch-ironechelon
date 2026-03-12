'use client'

import { useMemo } from 'react'
import * as THREE from 'three'

export default function Atmosphere() {
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      uniforms: {
        uColor: { value: new THREE.Color('#4A7C9B') },
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

  return (
    <mesh material={material}>
      <sphereGeometry args={[1.35, 64, 64]} />
    </mesh>
  )
}
