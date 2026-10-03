import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { CanvasTexture } from 'three';
import type { Group, Mesh } from 'three';
import { clipNameFor, type ResolvedAvatar } from './manifest.js';
import { type BotLabelData } from './identity.js';
import type { BotVisual } from './visuals.js';

export interface ProceduralBotProps {
  visual: BotVisual;
  scale?: number;
}

/**
 * Asset-free bot, built from primitives: a humanoid with a head, visor, arms,
 * legs and a hovering status light. It is the fallback whenever the avatar
 * manifest has no model, so the office always renders something readable.
 */
export function ProceduralBot({ visual, scale = 1 }: ProceduralBotProps) {
  const group = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const node = group.current;
    if (node !== null) {
      node.position.y =
        visual.posture === 'busy' ? Math.sin(time * 5) * 0.05 : Math.sin(time * 1.6) * 0.02;
      node.rotation.z = visual.posture === 'alert' ? Math.sin(time * 9) * 0.06 : 0;
    }
    const swing = visual.posture === 'busy' ? Math.sin(time * 7) * 0.6 : Math.sin(time * 1.4) * 0.06;
    if (leftArm.current !== null) leftArm.current.rotation.x = swing;
    if (rightArm.current !== null) rightArm.current.rotation.x = -swing;
    if (leftLeg.current !== null) leftLeg.current.rotation.x = -swing * 0.7;
    if (rightLeg.current !== null) rightLeg.current.rotation.x = swing * 0.7;
  });

  const lean = visual.posture === 'stuck' ? 0.14 : 0;
  const dark = '#0f172a';

  return (
    <group ref={group} scale={scale}>
      {/* Legs, pivoting at the hips so a busy bot visibly walks in place. */}
      <group ref={leftLeg} position={[-0.12, 0.58, 0]}>
        <mesh position={[0, -0.22, 0]} castShadow>
          <capsuleGeometry args={[0.09, 0.34, 6, 12]} />
          <meshStandardMaterial color={dark} roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.4, 0.06]} castShadow>
          <boxGeometry args={[0.16, 0.08, 0.28]} />
          <meshStandardMaterial color="#1e293b" roughness={0.9} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.12, 0.58, 0]}>
        <mesh position={[0, -0.22, 0]} castShadow>
          <capsuleGeometry args={[0.09, 0.34, 6, 12]} />
          <meshStandardMaterial color={dark} roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.4, 0.06]} castShadow>
          <boxGeometry args={[0.16, 0.08, 0.28]} />
          <meshStandardMaterial color="#1e293b" roughness={0.9} />
        </mesh>
      </group>

      {/* Torso and the big round head with two eyes, cartoon-style. */}
      <mesh position={[0, 0.88, 0]} rotation={[0, 0, lean]} castShadow>
        <capsuleGeometry args={[0.21, 0.3, 8, 16]} />
        <meshStandardMaterial color={visual.tint} roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.4, 0]} rotation={[0, 0, lean]} castShadow>
        <sphereGeometry args={[0.32, 28, 28]} />
        <meshStandardMaterial color={visual.tint} roughness={0.45} />
      </mesh>
      {[-0.12, 0.12].map((x) => (
        <group key={x} position={[x, 1.44, 0.27]}>
          <mesh>
            <sphereGeometry args={[0.1, 18, 18]} />
            <meshStandardMaterial color="#ffffff" roughness={0.2} />
          </mesh>
          <mesh position={[0, 0, 0.07]}>
            <sphereGeometry args={[0.045, 14, 14]} />
            <meshStandardMaterial color="#0f172a" roughness={0.2} />
          </mesh>
        </group>
      ))}

      {/* Arms, pivoting at the shoulders. */}
      <group ref={leftArm} position={[-0.26, 1.06, 0]}>
        <mesh position={[0, -0.2, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.28, 6, 12]} />
          <meshStandardMaterial color={visual.tint} roughness={0.55} />
        </mesh>
      </group>
      <group ref={rightArm} position={[0.26, 1.06, 0]}>
        <mesh position={[0, -0.2, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.28, 6, 12]} />
          <meshStandardMaterial color={visual.tint} roughness={0.55} />
        </mesh>
      </group>

      <mesh position={[0, 1.84, 0]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial color={visual.tint} emissive={visual.tint} emissiveIntensity={1} />
      </mesh>
      {visual.posture === 'alert' ? (
        <mesh position={[0, 2.06, 0]}>
          <coneGeometry args={[0.07, 0.18, 10]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.6} />
        </mesh>
      ) : null}
      {visual.posture === 'done' ? (
        <mesh position={[0, 2.06, 0]}>
          <torusGeometry args={[0.1, 0.028, 12, 24]} />
          <meshStandardMaterial color="#34d399" emissive="#34d399" emissiveIntensity={0.7} />
        </mesh>
      ) : null}
    </group>
  );
}

export interface GltfBotProps {
  url: string;
  avatar: ResolvedAvatar;
  mood: BotVisual['mood'];
  scale?: number;
}

/** Plays the manifest-named clip for the current mood, if the asset has it. */
export function GltfBot({ url, avatar, mood, scale = 1 }: GltfBotProps) {
  const gltf = useGLTF(url);
  const group = useRef<Group>(null);
  const { actions } = useAnimations(gltf.animations, group);
  const clip = clipNameFor(avatar, mood);

  useEffect(() => {
    if (clip === null) return;
    const action = actions[clip];
    if (action === undefined || action === null) return;
    action.reset().fadeIn(0.2).play();
    return () => {
      action.fadeOut(0.2);
    };
  }, [actions, clip]);

  return (
    <group ref={group} scale={scale}>
      <primitive object={gltf.scene} />
    </group>
  );
}

interface ModelBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface ModelBoundaryState {
  failed: boolean;
}

/** A missing or broken model asset degrades to the procedural bot, not a crash. */
export class ModelBoundary extends Component<ModelBoundaryProps, ModelBoundaryState> {
  override state: ModelBoundaryState = { failed: false };

  static getDerivedStateFromError(): ModelBoundaryState {
    return { failed: true };
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export interface BotProps {
  name: string;
  department?: string | undefined;
  activity: string;
  visual: BotVisual;
  avatar: ResolvedAvatar;
  selected: boolean;
  position: [number, number, number];
  /** Heading in radians. The bot faces the direction it is being moved. */
  facing: number;
  onSelect(): void;
  onDragStart?(event: ThreeEvent<PointerEvent>): void;
}

interface LabelLine {
  text: string;
  font: string;
  color: string;
}

/**
 * Draws a compact name tag: the agent's name, with department and state on a
 * small second line. There is no filled panel, just a light outline, so the
 * label stays readable and small instead of covering the office floor.
 */
function makeLabelTexture(data: BotLabelData): CanvasTexture {
  const lines: LabelLine[] = [{ text: data.name, font: 'bold 44px sans-serif', color: '#0f172a' }];
  const secondary = [data.department, data.state]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join(' · ');
  if (secondary.length > 0) {
    lines.push({ text: secondary, font: '28px sans-serif', color: '#334155' });
  }

  const canvas = document.createElement('canvas');
  const measure = canvas.getContext('2d');
  let width = 1;
  if (measure !== null) {
    for (const line of lines) {
      measure.font = line.font;
      width = Math.max(width, measure.measureText(line.text).width);
    }
  }

  const padding = 12;
  const lineHeight = 46;
  canvas.width = Math.ceil(width + padding * 2);
  canvas.height = lines.length * lineHeight + padding;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    lines.forEach((line, index) => {
      const y = padding / 2 + lineHeight * (index + 0.5);
      ctx.font = line.font;
      ctx.strokeText(line.text, canvas.width / 2, y);
      ctx.fillStyle = line.color;
      ctx.fillText(line.text, canvas.width / 2, y);
    });
  }
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** A small name tag that always faces the camera, so names stay readable. */
function BotLabel({ data }: { data: BotLabelData }) {
  const texture = useMemo(
    () => makeLabelTexture(data),
    [data.name, data.department, data.state],
  );
  useEffect(() => () => texture.dispose(), [texture]);
  const image = texture.image as { width: number; height: number };
  const aspect = image.height / image.width;
  const width = 1.5;
  return (
    <sprite position={[0, 1.86, 0]} scale={[width, width * aspect, 1]}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}

/**
 * The bot's footprint on the floor. It pulses while the agent is working and is
 * the colour of the current mood, so "busy", "blocked" and "done" read from
 * across the room. A brighter outer ring marks the selected agent.
 */
function StatusRing({ visual, selected }: { visual: BotVisual; selected: boolean }) {
  const ring = useRef<Mesh>(null);
  useFrame((state) => {
    const node = ring.current;
    if (node === null) return;
    const pulse =
      visual.posture === 'busy' ? 1 + Math.sin(state.clock.elapsedTime * 6) * 0.12 : 1;
    node.scale.setScalar(pulse);
  });

  return (
    <group position={[0, 0.02, 0]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 0.52, 40]} />
        <meshBasicMaterial
          color={visual.tint}
          transparent
          opacity={visual.posture === 'busy' ? 0.95 : 0.6}
        />
      </mesh>
      {selected ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <ringGeometry args={[0.56, 0.64, 40]} />
          <meshBasicMaterial color="#e2e8f0" transparent opacity={0.9} />
        </mesh>
      ) : null}
    </group>
  );
}

export function Bot({
  name,
  department,
  activity,
  visual,
  avatar,
  selected,
  position,
  facing,
  onSelect,
  onDragStart,
}: BotProps) {
  const fallback = <ProceduralBot visual={visual} scale={avatar.scale} />;
  const label: BotLabelData = {
    name,
    department,
    state: visual.indicator ?? visual.label,
    activity,
  };

  return (
    <group position={position} rotation={[0, facing, 0]}>
      {/* Name, department and live state travel with the bot so the office is
          readable at a glance: who this is, where they stand, and how they are. */}
      <BotLabel data={label} />

      <ModelBoundary fallback={fallback}>
        {avatar.model !== undefined ? (
          <Suspense fallback={fallback}>
            <GltfBot url={avatar.model} avatar={avatar} mood={visual.mood} scale={avatar.scale} />
          </Suspense>
        ) : (
          fallback
        )}
      </ModelBoundary>

      <StatusRing visual={visual} selected={selected} />

      {/* Pointer target: a generous invisible hitbox, since models vary in size.
          A pointer down selects the agent and starts a drag; the drag itself is
          tracked on the window so it survives leaving the hitbox. */}
      <mesh
        position={[0, 0.85, 0]}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect();
          onDragStart?.(event);
        }}
      >
        <boxGeometry args={[0.9, 1.9, 0.9]} />
        <meshBasicMaterial transparent opacity={selected ? 0.14 : 0} color={visual.tint} />
      </mesh>
    </group>
  );
}
