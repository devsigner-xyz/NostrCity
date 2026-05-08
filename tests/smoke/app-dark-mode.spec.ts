import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { seedReadonlyDarkSession, visibleSurfaceLuminance, waitForOverlayRoute } from './helpers/overlay-session';

const AUDITED_ROUTES = [
    {
        path: '/app/city-stats',
        marker: 'Occupied buildings',
    },
    {
        path: '/app/relays',
        marker: 'Configured relays',
    },
    {
        path: '/app/relays/detail?url=wss%3A%2F%2Frelay.one&source=configured&type=nip65Both',
        marker: 'Relay detail',
    },
    {
        path: '/app/discover',
        marker: 'Discover',
    },
] as const;

test('dark mode routed surfaces stay dark, accessible, and keyboard-visible', async ({ page }) => {
    await seedReadonlyDarkSession(page);

    for (const route of AUDITED_ROUTES) {
        await page.goto(route.path, { waitUntil: 'domcontentloaded' });
        await waitForOverlayRoute(page, route.marker);

        const surface = page.getByTestId('overlay-surface-content');
        await expect(surface).toBeVisible();

        const htmlHasDarkClass = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        expect(htmlHasDarkClass).toBe(true);
        expect(await visibleSurfaceLuminance(surface)).toBeLessThan(0.35);

        if (route.path === '/app/discover') {
            const firstMissionCard = page.getByTestId('discover-mission-card').first();
            await expect(firstMissionCard).toBeVisible();
            expect(await visibleSurfaceLuminance(firstMissionCard)).toBeLessThan(0.35);
        }

        if (route.path === '/app/city-stats') {
            const firstKpiCard = page.getByTestId('city-stats-kpi-card').first();
            const firstChartCard = page.getByTestId('city-stats-chart-card').first();

            await expect(firstKpiCard).toBeVisible();
            await expect(firstChartCard).toBeVisible();
            expect(await visibleSurfaceLuminance(firstKpiCard)).toBeLessThan(0.35);
            expect(await visibleSurfaceLuminance(firstChartCard)).toBeLessThan(0.35);
        }

        const accessibilityScan = await new AxeBuilder({ page })
            .include('[data-testid="overlay-surface-content"]')
            .analyze();

        expect(accessibilityScan.violations).toEqual([]);

        if (route.path === '/app/relays') {
            const focusTarget = surface.getByRole('button').first();
            await expect(focusTarget).toBeVisible();
            await focusTarget.focus();

            const focusStyles = await page.evaluate(() => {
                const activeElement = document.activeElement as HTMLElement | null;
                if (!activeElement) {
                    return null;
                }

                const styles = getComputedStyle(activeElement);
                return {
                    boxShadow: styles.boxShadow,
                    outlineWidth: styles.outlineWidth,
                };
            });

            expect((focusStyles?.boxShadow && focusStyles.boxShadow !== 'none') || focusStyles?.outlineWidth !== '0px').toBe(true);
        }
    }
});
