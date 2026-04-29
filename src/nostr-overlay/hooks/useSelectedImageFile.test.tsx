import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { useSelectedImageFile } from './useSelectedImageFile';

interface RenderedHook {
    container: HTMLDivElement;
    root: Root;
    api: ReturnType<typeof useSelectedImageFile>;
}

function renderHookHarness(): RenderedHook {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let api: ReturnType<typeof useSelectedImageFile> | undefined;

    function Harness() {
        api = useSelectedImageFile();

        return <output>{api.selectedImage?.previewUrl ?? 'empty'}</output>;
    }

    act(() => {
        root.render(<Harness />);
    });

    if (!api) {
        throw new Error('Hook did not render');
    }

    return { container, root, api };
}

describe('useSelectedImageFile', () => {
    beforeAll(() => {
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('creates an object URL when selecting a file', () => {
        const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:first');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
        const rendered = renderHookHarness();
        const file = new File(['image'], 'city.png', { type: 'image/png' });

        act(() => {
            rendered.api.setSelectedImageFile(file);
        });

        expect(createObjectURL).toHaveBeenCalledWith(file);
        expect(rendered.container.textContent).toBe('blob:first');

        act(() => {
            rendered.root.unmount();
        });
        rendered.container.remove();
    });

    test('revokes object URLs when replacing, clearing, and unmounting', () => {
        vi.spyOn(URL, 'createObjectURL')
            .mockReturnValueOnce('blob:first')
            .mockReturnValueOnce('blob:second')
            .mockReturnValueOnce('blob:third');
        const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
        const rendered = renderHookHarness();

        act(() => {
            rendered.api.setSelectedImageFile(new File(['first'], 'first.png', { type: 'image/png' }));
        });
        act(() => {
            rendered.api.setSelectedImageFile(new File(['second'], 'second.png', { type: 'image/png' }));
        });
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:first');

        act(() => {
            rendered.api.clearSelectedImage();
        });
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:second');

        act(() => {
            rendered.api.setSelectedImageFile(new File(['third'], 'third.png', { type: 'image/png' }));
        });
        act(() => {
            rendered.root.unmount();
        });

        expect(revokeObjectURL).toHaveBeenCalledWith('blob:third');
        rendered.container.remove();
    });
});
