import { useEffect, useMemo, useReducer } from 'react';
import type { AgentView, Department } from '@ai-office/contracts';
import { defaultLayout } from './default-layout.js';
import type { FurnitureKind } from './floorplan.js';
import {
  addItem,
  layoutBounds,
  moveItem,
  removeItem,
  rotateItem,
  type LayoutBounds,
  type LayoutDocument,
} from './layout-document.js';
import { loadLayout, saveLayout, type LayoutStorage } from './layout-storage.js';

export interface LayoutContext {
  bounds: LayoutBounds;
  defaultDocument: LayoutDocument;
}

export type LayoutAction =
  | { type: 'replace'; document: LayoutDocument }
  | { type: 'add'; kind: FurnitureKind; x: number; y: number; rotation?: number }
  | { type: 'move'; id: string; x: number; y: number }
  | { type: 'rotate'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'reset' };

/** Pure: every edit and the reset are expressible without React or storage. */
export function layoutReducer(
  state: LayoutDocument,
  action: LayoutAction,
  context: LayoutContext,
): LayoutDocument {
  switch (action.type) {
    case 'replace':
      return action.document;
    case 'add':
      return addItem(state, action.kind, action.x, action.y, context.bounds, action.rotation ?? 0);
    case 'move':
      return moveItem(state, action.id, action.x, action.y, context.bounds);
    case 'rotate':
      return rotateItem(state, action.id);
    case 'remove':
      return removeItem(state, action.id);
    case 'reset':
      return context.defaultDocument;
  }
}

function browserStorage(): LayoutStorage | null {
  if (typeof window === 'undefined' || window.localStorage === undefined) return null;
  return window.localStorage;
}

export interface OfficeLayout {
  document: LayoutDocument;
  bounds: LayoutBounds;
  dispatch(action: LayoutAction): void;
  reset(): void;
}

/**
 * Owns the working layout: the default when nothing is stored, the stored
 * layout otherwise, and every change written back through the storage port so
 * it survives a view switch and a reload.
 */
export function useOfficeLayout(
  agents: AgentView[],
  departments: Department[],
  storage: LayoutStorage | null = browserStorage(),
): OfficeLayout {
  const defaultDocument = useMemo(() => defaultLayout(agents, departments), [agents, departments]);
  const bounds = useMemo(() => layoutBounds(defaultDocument), [defaultDocument]);
  const context = useMemo<LayoutContext>(
    () => ({ bounds, defaultDocument }),
    [bounds, defaultDocument],
  );
  const reducer = useMemo(
    () => (state: LayoutDocument, action: LayoutAction) => layoutReducer(state, action, context),
    [context],
  );
  const [document, dispatch] = useReducer(reducer, undefined, () =>
    storage === null ? defaultDocument : loadLayout(storage, defaultDocument, bounds),
  );

  // A structural change shifts the default. The key is content-based so an
  // inline `[]` prop (always a new reference) does not re-run the reconcile
  // effect on every render.
  const structureKey = useMemo(
    () =>
      JSON.stringify([
        agents.map((agent) => [agent.id, agent.departmentId]),
        departments.map((department) => department.id),
      ]),
    [agents, departments],
  );

  useEffect(() => {
    dispatch({
      type: 'replace',
      document: storage === null ? defaultDocument : loadLayout(storage, defaultDocument, bounds),
    });
    // structureKey stands in for agents/departments by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey, storage]);

  useEffect(() => {
    if (storage === null) return;
    saveLayout(storage, document);
  }, [document, storage]);

  return { document, bounds, dispatch, reset: () => dispatch({ type: 'reset' }) };
}
