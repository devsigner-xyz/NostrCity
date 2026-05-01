import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { GroupsRouteContainer } from './GroupsRouteContainer';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderGroupsRoute(): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(<GroupsRouteContainer />);
    });

    return { container, root };
}

const mounted: RenderResult[] = [];

beforeAll(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

afterEach(() => {
    for (const entry of mounted) {
        entry.root.unmount();
        entry.container.remove();
    }

    mounted.length = 0;
});

describe('GroupsRouteContainer', () => {
    test('renders the groups placeholder without write actions', async () => {
        const rendered = await renderGroupsRoute();
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-testid="groups-route"]')).not.toBeNull();
        expect(rendered.container.textContent || '').toContain('Grupos');
        expect(rendered.container.textContent || '').toContain('Las acciones de escritura llegarán más adelante.');
        expect(rendered.container.querySelector('button')).toBeNull();
    });
});
