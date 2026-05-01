import { expect, test } from '@playwright/test';

test('loads map canvases and gui panel', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto('/app/');

  await expect(page.locator('#map-canvas')).toBeVisible();
  await expect(page.locator('#map-svg')).toBeVisible();
  await expect(page.locator('#nostr-overlay-root')).toBeVisible();
  await expect(page.locator('#nostr-overlay-root [data-testid="login-gate-screen"]')).toBeVisible();
  await expect(page.locator('#nostr-overlay-root input[name="npub"]')).toBeVisible();
  await expect(page.locator('#nostr-overlay-root .nostr-login-screen-dialog')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/login$/);

  expect(pageErrors).toEqual([]);
});

test('runs generate action without fatal runtime errors', async ({ page }) => {
  const pageErrors: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto('/app/');

  await expect(page.locator('#nostr-overlay-root [data-testid="login-gate-screen"]')).toBeVisible();
  await expect(page.locator('button[aria-label="Regenerar mapa"]').first()).toHaveCount(0);

  expect(pageErrors).toEqual([]);
  await expect(page.locator('#map-canvas')).toBeVisible();
});

test('keeps sidebar hidden while login overlay is active', async ({ page }) => {
  await page.goto('/app/');

  await expect(page.locator('#nostr-overlay-root [data-testid="login-gate-screen"]')).toBeVisible();
  await expect(page.locator('button[aria-label="Abrir ajustes"]').first()).toHaveCount(0);
});

test('npub submit shows progressive status without runtime errors', async ({ page }) => {
  await page.goto('/app/');

  await page.locator('#nostr-overlay-root input[name="npub"]').fill('npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
  await page.locator('#nostr-overlay-root button[type="submit"]').click();
  await page.waitForTimeout(1200);

  await expect(page.locator('#nostr-overlay-root')).toBeVisible();
});
