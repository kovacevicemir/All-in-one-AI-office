import type { FurnitureKind } from './floorplan.js';
import { FURNITURE_CATALOGUE, catalogueLabel } from './furniture-catalogue.js';
import type { LayoutDocument } from './layout-document.js';
import type { ImportStatus } from './layout-file.js';

export interface LayoutEditorProps {
  document: LayoutDocument;
  editing: boolean;
  pendingKind: FurnitureKind | null;
  /** Quarter-turn index the next placed item will use. */
  pendingRotation: number;
  /** Floor position under the pointer, when a placement is pending. */
  preview: { x: number; y: number } | null;
  selectedItemId: string | null;
  status: ImportStatus | null;
  onToggleEditing(): void;
  onSelectKind(kind: FurnitureKind): void;
  onPlaceSelected(): void;
  onSelectItem(id: string): void;
  onRotate(): void;
  onRemove(): void;
  onReset(): void;
  onExport(): void;
  onImport(): void;
}

/**
 * The keyboard-reachable layout controls. Everything here works without the
 * scene, so the office can be arranged (and reset, exported, imported) with no
 * pointer and no WebGL. Pointer placement and dragging live in the scene.
 */
export function LayoutEditor({
  document,
  editing,
  pendingKind,
  pendingRotation,
  preview,
  selectedItemId,
  status,
  onToggleEditing,
  onSelectKind,
  onPlaceSelected,
  onSelectItem,
  onRotate,
  onRemove,
  onReset,
  onExport,
  onImport,
}: LayoutEditorProps) {
  return (
    <section className="layout-editor" aria-label="Office layout editor">
      <header className="subheader">
        <h3>Layout</h3>
        <button type="button" className="link" aria-pressed={editing} onClick={onToggleEditing}>
          {editing ? 'Done editing' : 'Edit layout'}
        </button>
      </header>

      {editing ? (
        <div className="layout-editor-body">
          <fieldset className="catalogue">
            <legend>Furniture catalogue</legend>
            {FURNITURE_CATALOGUE.map((group) => (
              <div key={group.id} className="catalogue-group">
                <span className="catalogue-label">{group.label}</span>
                {group.kinds.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className="chip"
                    aria-pressed={pendingKind === kind}
                    onClick={() => onSelectKind(kind)}
                  >
                    {catalogueLabel(kind)}
                  </button>
                ))}
              </div>
            ))}
          </fieldset>

          <div className="layout-actions">
            <button type="button" onClick={onPlaceSelected} disabled={pendingKind === null}>
              {pendingKind === null ? 'Place item' : `Place ${catalogueLabel(pendingKind)}`}
            </button>
            <button type="button" onClick={onRotate} disabled={selectedItemId === null && pendingKind === null}>
              Rotate 90°
            </button>
            <button type="button" onClick={onRemove} disabled={selectedItemId === null}>
              Remove
            </button>
            <button type="button" onClick={onReset}>
              Reset to default
            </button>
            <button type="button" onClick={onExport}>
              Export
            </button>
            <button type="button" onClick={onImport}>
              Import
            </button>
          </div>

          {pendingKind !== null ? (
            <p className="layout-preview" role="status" data-testid="layout-preview">
              Placing {catalogueLabel(pendingKind)} · {pendingRotation * 90}°
              {preview === null ? '' : ` at ${preview.x.toFixed(1)}, ${preview.y.toFixed(1)}`}
            </p>
          ) : null}

          {status !== null ? (
            <p
              role={status.tone === 'error' ? 'alert' : 'status'}
              className={`layout-status ${status.tone}`}
            >
              {status.text}
            </p>
          ) : null}

          <ul className="layout-items" aria-label="Placed furniture">
            {document.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="item-chip"
                  aria-pressed={selectedItemId === item.id}
                  onClick={() => onSelectItem(item.id)}
                >
                  <span className="item-kind">{catalogueLabel(item.kind)}</span>
                  <span className="item-id">{item.id}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
