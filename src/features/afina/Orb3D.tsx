import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer, MeshTransmissionMaterial } from '@react-three/drei';

type MTM = THREE.MeshPhysicalMaterial & { distortion: number; temporalDistortion: number };

function Orb({ thinking, dark }: { thinking: boolean; dark: boolean }) {
  // Transmission samples what's behind the orb; give it a tint instead of transparent black.
  const bg = useMemo(() => new THREE.Color(dark ? '#16131f' : '#eef1ff'), [dark]);
  const group = useRef<THREE.Group>(null!);
  const shell = useRef<THREE.Mesh>(null!);
  const blue = useRef<THREE.Mesh>(null!);
  const pink = useRef<THREE.Mesh>(null!);
  const mat = useRef<MTM>(null!);
  const energy = useRef(0);

  useFrame((state, dt) => {
    const d = Math.min(dt, 0.05);
    energy.current = THREE.MathUtils.damp(energy.current, thinking ? 1 : 0, 2.5, d);
    const e = energy.current;
    const t = state.clock.elapsedTime;
    // Breathing: slow when idle, quicker and deeper while thinking.
    shell.current.scale.setScalar(1 + Math.sin(t * (1.1 + e * 2.6)) * (0.022 + e * 0.03));
    group.current.rotation.y += d * (0.12 + e * 1.4);
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, -state.pointer.y * 0.3, 3, d);
    group.current.rotation.z = THREE.MathUtils.damp(group.current.rotation.z, state.pointer.x * 0.2, 3, d);
    const s = 0.55 + e * 1.8;
    blue.current.position.set(Math.cos(t * s) * 0.34, Math.sin(t * s * 1.3) * 0.22, Math.sin(t * s) * 0.28);
    pink.current.position.set(-Math.cos(t * s * 0.9) * 0.32, -Math.sin(t * s * 1.1) * 0.24, -Math.sin(t * s * 0.9) * 0.26);
    if (mat.current) {
      mat.current.distortion = 0.22 + e * 0.55;
      mat.current.temporalDistortion = 0.08 + e * 0.35;
    }
  });

  return (
    <group ref={group}>
      <mesh ref={shell}>
        <sphereGeometry args={[1, 96, 96]} />
        <MeshTransmissionMaterial
          ref={mat as never}
          backside
          backsideThickness={0.4}
          thickness={0.9}
          roughness={0.18}
          transmission={1}
          ior={1.32}
          chromaticAberration={0.12}
          anisotropy={0.3}
          distortion={0.22}
          distortionScale={0.45}
          temporalDistortion={0.08}
          samples={6}
          resolution={256}
          color="#ffffff"
          background={bg}
        />
      </mesh>
      <mesh ref={blue}>
        <sphereGeometry args={[0.44, 48, 48]} />
        <meshBasicMaterial color="#2F6BFF" toneMapped={false} />
      </mesh>
      <mesh ref={pink}>
        <sphereGeometry args={[0.38, 48, 48]} />
        <meshBasicMaterial color="#FF4FA3" toneMapped={false} />
      </mesh>
    </group>
  );
}

export default function Orb3D({ thinking, active, dark }: { thinking: boolean; active: boolean; dark: boolean }) {
  return (
    <Canvas
      dpr={[1, 2]}
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [0, 0, 3.6], fov: 38 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      style={{ background: 'transparent' }}
      aria-hidden
    >
      <Environment resolution={256}>
        <group rotation={[-Math.PI / 3, 0, 1]}>
          <Lightformer form="circle" intensity={4} rotation-x={Math.PI / 2} position={[0, 5, -9]} scale={2} />
          <Lightformer form="circle" intensity={2} rotation-y={Math.PI / 2} position={[-5, 1, -1]} scale={2} />
          <Lightformer form="ring" color="#2F6BFF" intensity={8} rotation-y={Math.PI / 2} position={[-5, -1, -1]} scale={5} />
          <Lightformer form="ring" color="#FF4FA3" intensity={8} rotation-y={-Math.PI / 2} position={[5, 1, 0]} scale={5} />
        </group>
      </Environment>
      <Orb thinking={thinking} dark={dark} />
    </Canvas>
  );
}
