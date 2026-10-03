import type { Placement } from './floorplan.js';

type Vec3 = [number, number, number];

interface PieceProps {
  position: Vec3;
  rotationY?: number;
}

const WOOD = '#e2c79c';
const WOOD_DARK = '#c9a778';
const WHITE = '#f1f5f9';
const LIGHT = '#e2e8f0';
const METAL = '#94a3b8';
const DARK = '#334155';

function legs(x: number, z: number): [number, number][] {
  return [
    [-x, -z],
    [x, -z],
    [-x, z],
    [x, z],
  ];
}

/** A light-wood desk with slim metal legs and a cable tray. */
export function Desk({ position, rotationY = 0 }: PieceProps) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.75, 0]} castShadow>
        <boxGeometry args={[1.7, 0.08, 0.9]} />
        <meshStandardMaterial color={WOOD} roughness={0.65} />
      </mesh>
      {legs(0.75, 0.36).map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, 0.37, z]} castShadow>
          <boxGeometry args={[0.07, 0.74, 0.07]} />
          <meshStandardMaterial color={LIGHT} roughness={0.6} metalness={0.2} />
        </mesh>
      ))}
      <mesh position={[0, 0.66, -0.32]}>
        <boxGeometry args={[1.1, 0.06, 0.18]} />
        <meshStandardMaterial color={METAL} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** An office chair with a light seat, backrest and a star base. */
export function Chair({ position, rotationY = 0 }: PieceProps) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.52, 0.1, 0.52]} />
        <meshStandardMaterial color={LIGHT} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.82, -0.24]} castShadow>
        <boxGeometry args={[0.5, 0.52, 0.09]} />
        <meshStandardMaterial color={LIGHT} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.5, 10]} />
        <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.06, 16]} />
        <meshStandardMaterial color={DARK} roughness={0.8} />
      </mesh>
    </group>
  );
}

/** A thin-bezel monitor with a softly lit screen. */
export function Monitor({ position, rotationY = 0 }: PieceProps) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 0.32, 12]} />
        <meshStandardMaterial color={METAL} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.36, 0]} castShadow>
        <boxGeometry args={[0.64, 0.4, 0.03]} />
        <meshStandardMaterial color={WHITE} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.36, 0.02]}>
        <boxGeometry args={[0.58, 0.34, 0.01]} />
        <meshStandardMaterial color="#bae6fd" emissive="#7dd3fc" emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

/** A potted plant with layered foliage. */
export function Plant({ position, rotationY = 0 }: PieceProps) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.18, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.17, 0.36, 12]} />
        <meshStandardMaterial color="#d98b6a" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.58, 0]} castShadow>
        <sphereGeometry args={[0.32, 16, 16]} />
        <meshStandardMaterial color="#4ade80" roughness={0.8} />
      </mesh>
      <mesh position={[0.18, 0.86, 0.06]} castShadow>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color="#22c55e" roughness={0.8} />
      </mesh>
      <mesh position={[-0.15, 0.94, -0.08]} castShadow>
        <sphereGeometry args={[0.17, 16, 16]} />
        <meshStandardMaterial color="#16a34a" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** A warm patterned area rug. */
export function Rug({ position, rotationY = 0 }: PieceProps) {
  return (
    <group position={position} rotation={[-Math.PI / 2, 0, rotationY]} receiveShadow>
      <mesh receiveShadow>
        <planeGeometry args={[6.4, 4.4]} />
        <meshStandardMaterial color="#c98a76" roughness={1} />
      </mesh>
      <mesh position={[0, 0.005, 0]} receiveShadow>
        <planeGeometry args={[5.6, 3.6]} />
        <meshStandardMaterial color="#f3d9c9" roughness={1} />
      </mesh>
    </group>
  );
}

/** A wall calendar: a framed panel with a header band. */
export function Calendar({ position, rotationY = 0 }: PieceProps) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.9, 0.7, 0.05]} />
        <meshStandardMaterial color={WHITE} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.26, 0.03]}>
        <boxGeometry args={[0.9, 0.16, 0.02]} />
        <meshStandardMaterial color="#ef4444" roughness={0.6} />
      </mesh>
    </group>
  );
}

/** A whiteboard with a couple of colourful sticky notes. */
export function Whiteboard({ position, rotationY = 0 }: PieceProps) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh castShadow>
        <boxGeometry args={[2.2, 1.2, 0.06]} />
        <meshStandardMaterial color={METAL} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.04]}>
        <boxGeometry args={[2.04, 1.04, 0.02]} />
        <meshStandardMaterial color={WHITE} roughness={0.3} />
      </mesh>
      {[
        ['#fde68a', -0.7, 0.25],
        ['#fca5a5', -0.35, -0.1],
        ['#86efac', 0.0, 0.2],
        ['#a5b4fc', 0.35, -0.15],
      ].map(([color, x, y]) => (
        <mesh key={String(x)} position={[x as number, y as number, 0.07]}>
          <boxGeometry args={[0.2, 0.2, 0.01]} />
          <meshStandardMaterial color={color as string} />
        </mesh>
      ))}
    </group>
  );
}

/** A light-wood sideboard shared by a department zone. */
export function Cabinet({ position, rotationY = 0 }: PieceProps) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[1.2, 0.7, 0.5]} />
        <meshStandardMaterial color={WOOD} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.74, 0]}>
        <boxGeometry args={[1.28, 0.06, 0.56]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** A bookshelf with shelves and colourful spines. */
export function Bookshelf({ position, rotationY = 0 }: PieceProps) {
  const books = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#06b6d4'];
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[1.4, 1.2, 0.36]} />
        <meshStandardMaterial color={WOOD} roughness={0.7} />
      </mesh>
      {[0.35, 0.75, 1.1].map((y) => (
        <mesh key={y} position={[0, y, 0.12]}>
          <boxGeometry args={[1.3, 0.04, 0.16]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.7} />
        </mesh>
      ))}
      {books.map((color, index) => (
        <mesh key={color} position={[-0.5 + index * 0.16, 0.52, 0.14]}>
          <boxGeometry args={[0.09, 0.3, 0.14]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

/** A water cooler: white body with a blue bottle. */
export function Cooler({ position, rotationY = 0 }: PieceProps) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[0.42, 0.9, 0.42]} />
        <meshStandardMaterial color={WHITE} roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.08, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.42, 16]} />
        <meshStandardMaterial color="#60a5fa" roughness={0.3} transparent opacity={0.85} />
      </mesh>
      <mesh position={[0.16, 0.62, 0.24]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.12, 10]} />
        <meshStandardMaterial color="#1d4ed8" />
      </mesh>
    </group>
  );
}

/** A round meeting table with a metal base. */
export function Table({ position, rotationY = 0 }: PieceProps) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.72, 0]} castShadow>
        <cylinderGeometry args={[0.85, 0.85, 0.07, 32]} />
        <meshStandardMaterial color={WOOD} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.72, 12]} />
        <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.06, 20]} />
        <meshStandardMaterial color={DARK} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** A simple round stool. */
export function Stool({ position, rotationY = 0 }: PieceProps) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.28, 0.08, 20]} />
        <meshStandardMaterial color={LIGHT} roughness={0.7} />
      </mesh>
      {legs(0.18, 0.18).map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, 0.25, z]}>
          <boxGeometry args={[0.05, 0.5, 0.05]} />
          <meshStandardMaterial color={METAL} metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/** A printer on a low wooden sideboard. */
export function Printer({ position, rotationY = 0 }: PieceProps) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.28, 0]} castShadow>
        <boxGeometry args={[1.3, 0.5, 0.5]} />
        <meshStandardMaterial color={WOOD} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.64, 0]} castShadow>
        <boxGeometry args={[0.72, 0.28, 0.46]} />
        <meshStandardMaterial color={DARK} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[0.68, 0.02, 0.42]} />
        <meshStandardMaterial color={LIGHT} roughness={0.5} />
      </mesh>
    </group>
  );
}

/** A framed project-status poster with a small bar chart. */
export function Poster({ position, rotationY = 0 }: PieceProps) {
  const bars = [
    ['#3b82f6', 0.5],
    ['#22c55e', 0.85],
    ['#eab308', 0.35],
    ['#a855f7', 0.65],
  ] as const;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh castShadow>
        <boxGeometry args={[1.6, 1.1, 0.05]} />
        <meshStandardMaterial color={WHITE} roughness={0.5} />
      </mesh>
      {bars.map(([color, height], index) => (
        <mesh key={color} position={[-0.5 + index * 0.33, 0.05 + (height as number) / 2 - 0.25, 0.04]}>
          <boxGeometry args={[0.2, height as number, 0.01]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
}

/** Dispatches a plan placement to its procedural piece. */
export function Furniture({ placement }: { placement: Placement }) {
  const props: PieceProps = { position: placement.position, rotationY: placement.rotationY };
  switch (placement.kind) {
    case 'desk':
      return <Desk {...props} />;
    case 'chair':
      return <Chair {...props} />;
    case 'monitor':
      return <Monitor {...props} />;
    case 'plant':
      return <Plant {...props} />;
    case 'rug':
      return <Rug {...props} />;
    case 'calendar':
      return <Calendar {...props} />;
    case 'whiteboard':
      return <Whiteboard {...props} />;
    case 'cabinet':
      return <Cabinet {...props} />;
    case 'bookshelf':
      return <Bookshelf {...props} />;
    case 'cooler':
      return <Cooler {...props} />;
    case 'table':
      return <Table {...props} />;
    case 'stool':
      return <Stool {...props} />;
    case 'printer':
      return <Printer {...props} />;
    case 'poster':
      return <Poster {...props} />;
    default:
      return null;
  }
}
