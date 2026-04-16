import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Icosahedron, Torus, MeshDistortMaterial } from "@react-three/drei";
import { useRef } from "react";

function RotatingCluster() {
  const groupRef = useRef(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.25;
      groupRef.current.rotation.x += delta * 0.08;
    }
  });

  return (
    <group ref={groupRef}>
      <Float speed={1.6} rotationIntensity={1.4} floatIntensity={2.2}>
        <Icosahedron args={[1.3, 1]} position={[-2, 1.2, -1]}>
          <MeshDistortMaterial color="#11b28a" distort={0.35} speed={2.1} roughness={0.22} />
        </Icosahedron>
      </Float>
      <Float speed={1.2} rotationIntensity={1.1} floatIntensity={1.7}>
        <Torus args={[1.15, 0.28, 18, 80]} position={[2, -0.8, -1.2]}>
          <meshStandardMaterial color="#f26a2d" metalness={0.45} roughness={0.2} />
        </Torus>
      </Float>
      <Float speed={2.1} rotationIntensity={1.6} floatIntensity={1.3}>
        <Icosahedron args={[0.75, 0]} position={[0.3, 1.9, 0.6]}>
          <meshStandardMaterial color="#ffd56f" metalness={0.26} roughness={0.38} />
        </Icosahedron>
      </Float>
    </group>
  );
}

export default function ThreeBackdrop() {
  return (
    <div className="three-backdrop" aria-hidden="true">
      <Canvas camera={{ position: [0, 0, 6], fov: 46 }}>
        <ambientLight intensity={0.65} />
        <directionalLight position={[4, 5, 3]} intensity={1.15} />
        <RotatingCluster />
      </Canvas>
    </div>
  );
}
