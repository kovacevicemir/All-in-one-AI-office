// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LayoutEditor } from '../src/office/LayoutEditor.js';
import { LAYOUT_VERSION, type LayoutDocument } from '../src/office/layout-document.js';

afterEach(cleanup);

const DOCUMENT: LayoutDocument = {
  version: LAYOUT_VERSION,
  items: [
    { id: 'desk_1', kind: 'desk', x: 0, y: 0, rotation: 0 },
    { id: 'plant_1', kind: 'plant', x: 1, y: 1, rotation: 0 },
  ],
};

const noop = () => undefined;

function renderEditor(overrides: Partial<Parameters<typeof LayoutEditor>[0]> = {}) {
  return render(
    <LayoutEditor
      document={DOCUMENT}
      editing
      pendingKind={null}
      pendingRotation={0}
      preview={null}
      selectedItemId={null}
      status={null}
      onToggleEditing={noop}
      onSelectKind={noop}
      onPlaceSelected={noop}
      onSelectItem={noop}
      onRotate={noop}
      onRemove={noop}
      onReset={noop}
      onExport={noop}
      onImport={noop}
      {...overrides}
    />,
  );
}

describe('LayoutEditor', () => {
  it('toggles edit mode and hides the controls when not editing', () => {
    const onToggleEditing = vi.fn();
    renderEditor({ editing: false, onToggleEditing });
    fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }));
    expect(onToggleEditing).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Reset to default' })).toBeNull();
  });

  it('offers every catalogue kind and reflects the pending selection', () => {
    const onSelectKind = vi.fn();
    renderEditor({ onSelectKind });
    const chair = screen.getByRole('button', { name: 'Chair' });
    fireEvent.click(chair);
    expect(onSelectKind).toHaveBeenCalledWith('chair');
    expect(screen.getAllByRole('button', { name: 'Desk' }).length).toBeGreaterThan(0);
  });

  it('adds, removes and resets through focusable controls', () => {
    const onPlaceSelected = vi.fn();
    const onRemove = vi.fn();
    const onReset = vi.fn();
    renderEditor({
      pendingKind: 'chair',
      selectedItemId: 'desk_1',
      onPlaceSelected,
      onRemove,
      onReset,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Place Chair' }));
    expect(onPlaceSelected).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    expect(onReset).toHaveBeenCalled();

    for (const name of ['Place Chair', 'Remove', 'Reset to default']) {
      const button = screen.getByRole('button', { name }) as HTMLButtonElement;
      expect(button.disabled, name).toBe(false);
    }
  });

  it('disables placement and removal until something is chosen', () => {
    renderEditor();
    expect((screen.getByRole('button', { name: 'Place item' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('rotates the pending item when only a kind is selected', () => {
    const onRotate = vi.fn();
    renderEditor({ pendingKind: 'chair', onRotate });
    const rotate = screen.getByRole('button', { name: 'Rotate 90°' }) as HTMLButtonElement;
    expect(rotate.disabled).toBe(false);
    fireEvent.click(rotate);
    expect(onRotate).toHaveBeenCalled();
  });

  it('shows the pending item, its orientation and the pointer position', () => {
    const { unmount } = renderEditor({ pendingKind: 'chair' });
    expect(screen.getByTestId('layout-preview').textContent).toContain('Placing Chair · 0°');
    unmount();
    renderEditor({ pendingKind: 'chair', pendingRotation: 3, preview: { x: 1.25, y: -2.5 } });
    const readout = screen.getByTestId('layout-preview').textContent ?? '';
    expect(readout).toContain('Placing Chair · 270°');
    expect(readout).toContain('at 1.3, -2.5');
  });

  it('lists placed items and marks the selected one', () => {
    const onSelectItem = vi.fn();
    renderEditor({ selectedItemId: 'plant_1', onSelectItem });
    const items = screen.getAllByRole('button', { name: /plant_1|desk_1/ });
    expect(items).toHaveLength(2);
    const plant = screen.getByRole('button', { name: /plant_1/ });
    expect(plant.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /desk_1/ }));
    expect(onSelectItem).toHaveBeenCalledWith('desk_1');
  });

  it('reports progress and errors with the right role', () => {
    const { unmount } = renderEditor({
      status: { tone: 'error', text: 'The file is not a layout document.' },
    });
    expect(screen.getByRole('alert').textContent).toContain('not a layout document');
    unmount();
    renderEditor({ status: { tone: 'info', text: 'Layout imported.' } });
    expect(screen.getByRole('status').textContent).toContain('Layout imported.');
  });

  it('triggers export and import actions', () => {
    const onExport = vi.fn();
    const onImport = vi.fn();
    renderEditor({ onExport, onImport });
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(onExport).toHaveBeenCalled();
    expect(onImport).toHaveBeenCalled();
  });
});
