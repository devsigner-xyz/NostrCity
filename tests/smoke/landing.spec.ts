import { expect, test } from '@playwright/test';

test('landing muestra manifiesto y CTA principal', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: /Explora Nostr como ciudad open source/i })).toBeVisible();
  const primaryCta = page.getByRole('link', { name: 'Entrar a la aplicacion' }).first();
  await expect(primaryCta).toBeVisible();
  await expect(primaryCta).toHaveAttribute('href', '/app/');
  await expect(page.getByRole('link', { name: 'Documentacion' }).first()).toHaveAttribute('href', '/docs/');
});

test('landing incluye seccion para usuarios nostr y filosofia no comercial', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Features para explorar Nostr/i })).toBeVisible();
  await expect(page.getByText(/sin animo de lucro/i).first()).toBeVisible();
  await expect(page.getByText(/Mapa generativo/i).first()).toBeVisible();
});

test('landing renders english copy when ui language is en', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('nostr.overlay.ui.v1', JSON.stringify({ language: 'en' }));
  });

  await page.goto('/');

  await expect(page.getByRole('link', { name: 'Documentation' }).first()).toHaveAttribute('href', '/docs/');
  await expect(page.getByRole('link', { name: 'Open the app' }).first()).toHaveAttribute('href', '/app/');
  await expect(page.getByRole('heading', { name: /Explore Nostr as an open-source city/i })).toBeVisible();
});
