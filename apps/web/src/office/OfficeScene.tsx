import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import { MOUSE, Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { AgentCommunication, AgentView, Department, Task } from '@ai-office/contracts';
import { Bot } from './Bot.js';
import { AgentRail } from './AgentRail.js';
import { CommunicationLinks } from './CommunicationLinks.js';
import { communicationSegments, type Vec3 } from './communication-links.js';
import { resolveAvatar, type AvatarManifest } from './manifest.js';
import { planOffice } from './floorplan.js';
import { Furniture } from './furniture.js';
import { departmentNameFor } from './identity.js';
import { visualForAgent } from './visuals.js';
import type { AgentPose, PoseMap, RoomBounds } from './placement.js';
import { CommunicationSummary } from '../components/CommunicationMarker.js';

export interface OfficeViewProps {
  agents: AgentView[];
  departments: Department[];
  tasks: Task[];
  communications: AgentCommunication[];
  selectedAgentId: string | null;
  onSelect(agentId: string): void;
  poses: PoseMap;
  bounds: RoomBounds;
  onMovePose(agentId: string, x: number, y: number): void;
  manifest: AvatarManifest;
  webglAvailable: boolean;
  /** Rendered instead of the canvas when the office cannot be shown. */
  listFallback: React.ReactNode;
  onToggleView(): void;
}

interface HoveredMarker {
  communication: AgentCommunication;
  x: number;
  y: number;
}

interface RoomProps {
  agents: AgentView[];
  departments: Department[];
  communications: AgentCommunication[];
  selectedAgentId: string | null;
  poses: PoseMap;
  centerX: number;
  manifest: AvatarManifest;
  onSelect(agentId: string): void;
  onMovePose(agentId: string, x: number, y: number): void;
  onHover(communication: AgentCommunication, clientX: number, clientY: number): void;
  onLeave(): void;
}

/**
 * The floor itself, inside the canvas. A drag is raycast against the floor plane
 * from window-level pointer events, so it continues after the pointer leaves the
 * bot and the pan/zoom controls never see a left-button drag.
 */
function Room({
  agents,
  departments,
  communications,
  selectedAgentId,
  poses,
  centerX,
  manifest,
  onSelect,
  onMovePose,
  onHover,
  onLeave,
}: RoomProps) {
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new Raycaster(), []);
  const pointer = useMemo(() => new Vector2(), []);
  const floor = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new Vector3(), []);
  // The pointer keeps the grab offset from the bot's centre, so picking a bot up
  // never teleports it and a plain click does not move it at all.
  const dragInfo = useRef<{ grabX: number; grabY: number } | null>(null);
  const dragCleanup = useRef<(() => void) | null>(null);
  const moveRef = useRef(onMovePose);
  moveRef.current = onMovePose;
  const { placed, furniture, zones } = planOffice(agents, departments);

  const pointFromClient = (
    clientX: number,
    clientY: number,
  ): { x: number; y: number } | null => {
    const rect = gl.domElement.getBoundingClientRect();
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const point = raycaster.ray.intersectPlane(floor, hit);
    return point === null ? null : { x: point.x, y: point.z };
  };

  const endDrag = () => {
    dragInfo.current = null;
    if (dragCleanup.current !== null) {
      dragCleanup.current();
      dragCleanup.current = null;
    }
  };

  // Listeners attach synchronously on pointer down (not from an effect), so no
  // first move is lost while React schedules a render. They live on the window
  // so the drag survives leaving the bot's small hitbox.
  const startDrag = (agentId: string, pose: AgentPose, clientX: number, clientY: number) => {
    const point = pointFromClient(clientX, clientY);
    if (point === null) return;
    endDrag();
    dragInfo.current = { grabX: pose.x - point.x, grabY: pose.y - point.y };
    const handleMove = (event: PointerEvent) => {
      const grab = dragInfo.current;
      if (grab === null) return;
      const next = pointFromClient(event.clientX, event.clientY);
      if (next === null) return;
      moveRef.current(agentId, next.x + grab.grabX, next.y + grab.grabY);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', endDrag);
    dragCleanup.current = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', endDrag);
    };
  };

  useEffect(() => endDrag, []);

  const anchors: Record<string, Vec3> = {};
  for (const agent of agents) {
    const pose = poses[agent.id];
    if (pose !== undefined) anchors[agent.id] = [pose.x, 0.95, pose.y];
  }
  const segments = communicationSegments(communications, anchors);

  return (
    <group>
      {placed.map(({ agent }) => {
        const pose = poses[agent.id];
        if (pose === undefined) return null;
        return (
          <Bot
            key={agent.id}
            name={agent.name}
            department={departmentNameFor(agent.departmentId, departments)}
            activity={agent.activity}
            visual={visualForAgent(agent)}
            avatar={resolveAvatar(manifest, agent.id)}
            selected={agent.id === selectedAgentId}
            position={[pose.x, 0, pose.y]}
            facing={pose.facing}
            onSelect={() => onSelect(agent.id)}
            onDragStart={(event) =>
              startDrag(agent.id, pose, event.nativeEvent.clientX, event.nativeEvent.clientY)
            }
          />
        );
      })}

      <CommunicationLinks
        segments={segments}
        onHover={(segment, clientX, clientY) =>
          onHover(segment.communication, clientX, clientY)
        }
        onLeave={onLeave}
      />

      {/* Zones, furniture and the room shell are placed from the same pure plan,
          so desk, zone and bot positions always agree. */}
      {zones.map((zone) => (
        <mesh
          key={zone.key}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[zone.x, 0.02, 0]}
          receiveShadow
        >
          <planeGeometry args={[5.4, 4.6]} />
          <meshStandardMaterial color="#e6d8bf" roughness={1} />
        </mesh>
      ))}
      {furniture.map((placement, index) => (
        <Furniture key={`${placement.kind}-${index}`} placement={placement} />
      ))}

      <Controls centerX={centerX} />
    </group>
  );
}

/** Fixed isometric pan/zoom: rotation is disabled so the view stays a 2.5D map. */
function Controls({ centerX }: { centerX: number }) {
  return (
    <MapControls
      makeDefault
      target={[centerX, 0.6, 0]}
      enableRotate={false}
      minZoom={8}
      maxZoom={70}
      mouseButtons={{ LEFT: undefined, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
    />
  );
}

/** The room shell: a flat floor with a grid and two walls behind the work area. */
function RoomShell({ width, depth, centerX }: { width: number; depth: number; centerX: number }) {
  const wallZ = -depth / 2;
  const wallX = centerX - width / 2;
  const wallHeight = 3.2;
  const wallColor = '#eef2f6';
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#d9c4a3" roughness={1} />
      </mesh>
      <gridHelper args={[Math.max(width, depth), Math.max(width, depth), '#cbb894', '#cdbb9d']} position={[centerX, 0.01, 0]} />

      <mesh position={[centerX, wallHeight / 2, wallZ]} receiveShadow>
        <boxGeometry args={[width, wallHeight, 0.24]} />
        <meshStandardMaterial color={wallColor} roughness={0.95} />
      </mesh>
      <mesh position={[wallX, wallHeight / 2, 0]} receiveShadow>
        <boxGeometry args={[0.24, wallHeight, depth]} />
        <meshStandardMaterial color={wallColor} roughness={0.95} />
      </mesh>
      <mesh position={[centerX, 0.09, wallZ + 0.16]}>
        <boxGeometry args={[width, 0.18, 0.08]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.9} />
      </mesh>
    </group>
  );
}

/**
 * The office: an isometric 2.5D view of a flat floor. Bots keep their `x`/`y`
 * floor position and 360° facing, and can be dragged; communication between two
 * agents is drawn as a dashed link with an envelope at its midpoint.
 */
export function OfficeView({
  agents,
  departments,
  tasks,
  communications,
  selectedAgentId,
  onSelect,
  poses,
  bounds,
  onMovePose,
  manifest,
  webglAvailable,
  listFallback,
  onToggleView,
}: OfficeViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<HoveredMarker | null>(null);

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const roomWidth = Math.max(12, bounds.maxX - bounds.minX + 4);
  const roomDepth = Math.max(10, bounds.maxY - bounds.minY + 4);
  const camera = useMemo(
    () => ({
      position: [centerX + 18, 22, 24] as [number, number, number],
      zoom: 30,
      near: 0.1,
      far: 600,
    }),
    [centerX],
  );

  return (
    <section className="office-view" aria-label="Office">
      <header className="subheader">
        <h2>Office</h2>
        <button type="button" className="link" onClick={onToggleView}>
          Switch to list view
        </button>
      </header>

      {webglAvailable ? (
        <div className="canvas-wrap" ref={wrapRef}>
          <Canvas orthographic shadows={false} camera={camera} dpr={[1, 2]}>
            <color attach="background" args={['#dbe7f2']} />
            <hemisphereLight intensity={1.15} groundColor="#cbd5e1" />
            <ambientLight intensity={0.6} />
            <directionalLight position={[-9, 13, 7]} intensity={1.6} />
            <RoomShell width={roomWidth} depth={roomDepth} centerX={centerX} />
            <Room
              agents={agents}
              departments={departments}
              communications={communications}
              selectedAgentId={selectedAgentId}
              poses={poses}
              centerX={centerX}
              manifest={manifest}
              onSelect={onSelect}
              onMovePose={onMovePose}
              onHover={(communication, clientX, clientY) => {
                const rect = wrapRef.current?.getBoundingClientRect();
                setHovered({
                  communication,
                  x: clientX - (rect?.left ?? 0),
                  y: clientY - (rect?.top ?? 0),
                });
              }}
              onLeave={() => setHovered(null)}
            />
          </Canvas>
          {hovered !== null ? (
            <div
              className="comm-scene-popover"
              role="tooltip"
              data-testid="comm-scene-popover"
              style={{ left: hovered.x, top: hovered.y }}
            >
              <CommunicationSummary
                communication={hovered.communication}
                agents={agents}
                tasks={tasks}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <div role="status" className="notice">
          The office view is unavailable because this environment has no WebGL. The accessible
          list view below shows the same information.
        </div>
      )}

      <AgentRail agents={agents} selectedAgentId={selectedAgentId} onSelect={onSelect} />

      {!webglAvailable ? listFallback : null}
    </section>
  );
}
