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
import { placementFromItem, type FurnitureKind } from './floorplan.js';
import { layoutAgents } from './layout.js';
import { Furniture } from './furniture.js';
import { GhostFurniture } from './GhostFurniture.js';
import { LayoutEditor } from './LayoutEditor.js';
import type { LayoutDocument, LayoutItem } from './layout-document.js';
import {
  applyImport,
  browserLayoutFile,
  exportLayout,
  importLayout,
  type ImportStatus,
  type LayoutFilePort,
} from './layout-file.js';
import { useOfficeLayout } from './use-office-layout.js';
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
  /** Injected in tests; defaults to the browser download/upload port. */
  layoutFile?: LayoutFilePort;
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
  roomWidth: number;
  roomDepth: number;
  manifest: AvatarManifest;
  layout: LayoutDocument;
  editing: boolean;
  pendingKind: FurnitureKind | null;
  pendingRotation: number;
  preview: { x: number; y: number } | null;
  selectedItemId: string | null;
  onSelect(agentId: string): void;
  onMovePose(agentId: string, x: number, y: number): void;
  onPlace(x: number, y: number): void;
  onPreview(point: { x: number; y: number } | null): void;
  onSelectItem(id: string): void;
  onRemoveItem(id: string): void;
  onMoveItem(id: string, x: number, y: number): void;
  onHover(communication: AgentCommunication, clientX: number, clientY: number): void;
  onLeave(): void;
}

/**
 * The floor itself, inside the canvas. A drag is raycast against the floor plane
 * from window-level pointer events, so it continues after the pointer leaves the
 * bot and the pan/zoom controls never see a left-button drag. Furniture drags
 * start from an item and are only possible in edit mode; agent drags always work.
 */
function Room({
  agents,
  departments,
  communications,
  selectedAgentId,
  poses,
  centerX,
  roomWidth,
  roomDepth,
  manifest,
  layout,
  editing,
  pendingKind,
  pendingRotation,
  preview,
  selectedItemId,
  onSelect,
  onMovePose,
  onPlace,
  onPreview,
  onSelectItem,
  onRemoveItem,
  onMoveItem,
  onHover,
  onLeave,
}: RoomProps) {
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new Raycaster(), []);
  const pointer = useMemo(() => new Vector2(), []);
  const floor = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new Vector3(), []);
  // The pointer keeps the grab offset from the object's centre, so picking
  // something up never teleports it and a plain click does not move it at all.
  const dragInfo = useRef<{ grabX: number; grabY: number } | null>(null);
  const dragCleanup = useRef<(() => void) | null>(null);
  const moveAgentRef = useRef(onMovePose);
  moveAgentRef.current = onMovePose;
  const moveItemRef = useRef(onMoveItem);
  moveItemRef.current = onMoveItem;

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
  // so the drag survives leaving the small hitbox.
  const beginFloorDrag = (
    point: { x: number; y: number },
    grab: { grabX: number; grabY: number },
    apply: (x: number, y: number) => void,
  ) => {
    endDrag();
    dragInfo.current = grab;
    const handleMove = (event: PointerEvent) => {
      const active = dragInfo.current;
      if (active === null) return;
      const next = pointFromClient(event.clientX, event.clientY);
      if (next === null) return;
      apply(next.x + active.grabX, next.y + active.grabY);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', endDrag);
    dragCleanup.current = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', endDrag);
    };
  };

  const startAgentDrag = (agentId: string, pose: AgentPose, clientX: number, clientY: number) => {
    const point = pointFromClient(clientX, clientY);
    if (point === null) return;
    beginFloorDrag(point, { grabX: pose.x - point.x, grabY: pose.y - point.y }, (x, y) =>
      moveAgentRef.current(agentId, x, y),
    );
  };

  const startItemDrag = (item: LayoutItem, clientX: number, clientY: number) => {
    const point = pointFromClient(clientX, clientY);
    if (point === null) return;
    beginFloorDrag(point, { grabX: item.x - point.x, grabY: item.y - point.y }, (x, y) =>
      moveItemRef.current(item.id, x, y),
    );
  };

  useEffect(() => endDrag, []);

  const anchors: Record<string, Vec3> = {};
  for (const agent of agents) {
    const pose = poses[agent.id];
    if (pose !== undefined) anchors[agent.id] = [pose.x, 0.95, pose.y];
  }
  const segments = communicationSegments(communications, anchors);
  const { placed, zones } = layoutAgents(agents, departments);
  const selected = layout.items.find((item) => item.id === selectedItemId) ?? null;

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
              startAgentDrag(agent.id, pose, event.nativeEvent.clientX, event.nativeEvent.clientY)
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

      {layout.items.map((item) => (
        <group
          key={item.id}
          onPointerDown={(event) => {
            if (!editing || event.nativeEvent.button !== 0) return;
            event.stopPropagation();
            onSelectItem(item.id);
            startItemDrag(item, event.nativeEvent.clientX, event.nativeEvent.clientY);
          }}
          onContextMenu={(event) => {
            if (!editing) return;
            event.stopPropagation();
            event.nativeEvent.preventDefault();
            onRemoveItem(item.id);
          }}
        >
          <Furniture placement={placementFromItem(item)} />
        </group>
      ))}

      {editing && pendingKind !== null && preview !== null ? (
        <GhostFurniture
          placement={placementFromItem({
            kind: pendingKind,
            x: preview.x,
            y: preview.y,
            rotation: pendingRotation,
          })}
        />
      ) : null}

      {editing && selected !== null ? (
        <mesh position={[selected.x, 0.02, selected.y]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.45, 0.62, 32]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
      ) : null}

      {/* An invisible box catches a click on the floor while a kind is pending,
          so pointer placement uses the same raycast as dragging. */}
      {editing && pendingKind !== null ? (
        <mesh
          position={[centerX, 0, 0]}
          onPointerMove={(event) => {
            const point = pointFromClient(event.nativeEvent.clientX, event.nativeEvent.clientY);
            if (point !== null) onPreview(point);
          }}
          onPointerOut={() => onPreview(null)}
          onPointerDown={(event) => {
            event.stopPropagation();
            const point = pointFromClient(event.nativeEvent.clientX, event.nativeEvent.clientY);
            if (point !== null) onPlace(point.x, point.y);
          }}
        >
          <boxGeometry args={[roomWidth, 0.06, roomDepth]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ) : null}

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
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
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
 * agents is drawn as a dashed link with an envelope at its midpoint. The floor
 * plan comes from an editable layout document, so furniture is data now.
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
  layoutFile,
}: OfficeViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<HoveredMarker | null>(null);
  const { document: layout, bounds: layoutBounds, dispatch, reset } = useOfficeLayout(
    agents,
    departments,
  );
  const filePort = useMemo(() => layoutFile ?? browserLayoutFile(), [layoutFile]);
  const [editing, setEditing] = useState(false);
  const [pendingKind, setPendingKind] = useState<FurnitureKind | null>(null);
  const [pendingRotation, setPendingRotation] = useState(0);
  const [preview, setPreview] = useState<{ x: number; y: number } | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [layoutStatus, setLayoutStatus] = useState<ImportStatus | null>(null);

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

  const toggleEditing = (): void => {
    const next = !editing;
    setEditing(next);
    if (!next) {
      setPendingKind(null);
      setPendingRotation(0);
      setPreview(null);
      setSelectedItemId(null);
    }
  };

  const selectKind = (kind: FurnitureKind): void => {
    setPendingKind(kind);
    setPendingRotation(0);
    setPreview(null);
    setSelectedItemId(null);
  };

  const selectItem = (id: string): void => {
    setSelectedItemId(id);
    setPendingKind(null);
    setPreview(null);
  };

  const placeAt = (x: number, y: number): void => {
    if (pendingKind === null) return;
    dispatch({ type: 'add', kind: pendingKind, x, y, rotation: pendingRotation });
  };

  const placeSelected = (): void => {
    if (pendingKind === null) return;
    dispatch({
      type: 'add',
      kind: pendingKind,
      x: (layoutBounds.minX + layoutBounds.maxX) / 2,
      y: (layoutBounds.minY + layoutBounds.maxY) / 2,
      rotation: pendingRotation,
    });
  };

  const moveLayoutItem = (id: string, x: number, y: number): void => {
    dispatch({ type: 'move', id, x, y });
  };

  const removeLayoutItem = (id: string): void => {
    dispatch({ type: 'remove', id });
    setSelectedItemId((current) => (current === id ? null : current));
  };

  const rotateLayoutItem = (): void => {
    if (selectedItemId !== null) {
      dispatch({ type: 'rotate', id: selectedItemId });
      return;
    }
    setPendingRotation((value) => (value + 1) % 4);
  };

  const resetLayout = (): void => {
    reset();
    setSelectedItemId(null);
    setLayoutStatus({ tone: 'info', text: 'Layout reset to the default office.' });
  };

  const exportLayoutFile = (): void => {
    exportLayout(filePort, layout);
    setLayoutStatus({ tone: 'info', text: 'Layout exported.' });
  };

  const importLayoutFile = async (): Promise<void> => {
    const outcome = await importLayout(filePort, layoutBounds);
    const applied = applyImport(layout, outcome);
    if (applied.document !== layout) {
      dispatch({ type: 'replace', document: applied.document });
      setSelectedItemId(null);
    }
    setLayoutStatus(applied.status);
  };

  return (
    <section className="office-view" aria-label="Office">
      <header className="subheader">
        <h2>Office</h2>
        <button type="button" className="link" onClick={onToggleView}>
          Switch to list view
        </button>
      </header>

      {webglAvailable ? (
        <div
          className="canvas-wrap"
          ref={wrapRef}
          onContextMenu={(event) => {
            if (editing) event.preventDefault();
          }}
        >
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
              roomWidth={roomWidth}
              roomDepth={roomDepth}
              manifest={manifest}
              layout={layout}
              editing={editing}
              pendingKind={pendingKind}
              pendingRotation={pendingRotation}
              preview={preview}
              selectedItemId={selectedItemId}
              onSelect={onSelect}
              onMovePose={onMovePose}
              onPlace={placeAt}
              onPreview={setPreview}
              onSelectItem={selectItem}
              onRemoveItem={removeLayoutItem}
              onMoveItem={moveLayoutItem}
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

      <LayoutEditor
        document={layout}
        editing={editing}
        pendingKind={pendingKind}
        pendingRotation={pendingRotation}
        preview={preview}
        selectedItemId={selectedItemId}
        status={layoutStatus}
        onToggleEditing={toggleEditing}
        onSelectKind={selectKind}
        onPlaceSelected={placeSelected}
        onSelectItem={selectItem}
        onRotate={rotateLayoutItem}
        onRemove={() => {
          if (selectedItemId !== null) removeLayoutItem(selectedItemId);
        }}
        onReset={resetLayout}
        onExport={exportLayoutFile}
        onImport={() => void importLayoutFile()}
      />

      <AgentRail agents={agents} selectedAgentId={selectedAgentId} onSelect={onSelect} />

      {!webglAvailable ? listFallback : null}
    </section>
  );
}
