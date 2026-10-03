import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { CanvasTexture } from 'three';
import type { AgentCommunication } from '@ai-office/contracts';
import {
  COMMUNICATION_STATUS_COLOR,
  markerPosition,
  type CommunicationSegment,
} from './communication-links.js';

export interface HoveredMarker {
  communication: AgentCommunication;
  x: number;
  y: number;
}

export interface CommunicationLinksProps {
  segments: CommunicationSegment[];
  onHover(segment: CommunicationSegment, clientX: number, clientY: number): void;
  onLeave(): void;
}

/** An envelope glyph drawn into a camera-facing sprite. No asset needed. */
function makeEnvelopeTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.beginPath();
    ctx.arc(64, 64, 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 62px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✉', 64, 70);
  }
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Dashed links between communicating bots with an envelope at each midpoint.
 * The dashed line and envelope colour follow the communication's lifecycle, and
 * hovering the envelope drives a DOM popover owned by the scene wrapper.
 */
export function CommunicationLinks({ segments, onHover, onLeave }: CommunicationLinksProps) {
  const texture = useMemo(makeEnvelopeTexture, []);

  return (
    <group>
      {segments.map((segment) => {
        const color = COMMUNICATION_STATUS_COLOR[segment.communication.status];
        const marker = markerPosition(segment);
        return (
          <group key={segment.id}>
            <Line
              points={[segment.from, segment.to]}
              color={color}
              lineWidth={1.5}
              dashed
              dashSize={0.18}
              gapSize={0.12}
              transparent
              opacity={segment.communication.status === 'open' ? 0.95 : 0.55}
            />
            <pointLight position={marker} color={color} intensity={0.6} distance={2.5} />
            <sprite
              position={marker}
              scale={[0.7, 0.7, 1]}
              onPointerOver={(event) => {
                event.stopPropagation();
                onHover(segment, event.nativeEvent.clientX, event.nativeEvent.clientY);
              }}
              onPointerOut={() => onLeave()}
            >
              <spriteMaterial map={texture} transparent depthTest={false} />
            </sprite>
          </group>
        );
      })}
    </group>
  );
}
