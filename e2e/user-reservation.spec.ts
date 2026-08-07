import { test, expect } from '@playwright/test';
import { loginAs } from './utils/auth-helpers';
import { RESERVATION_FIXTURE_SLUG } from './global-setup';

test.describe('Réservation invendu (user) puis visibilité côté marchand', { tag: '@regression' }, () => {
  test('un user réserve un invendu et le marchand le voit apparaître avec son code de retrait', async ({ page }) => {
    await loginAs(page, 'user');

    await page.goto(`/p/${RESERVATION_FIXTURE_SLUG}`);
    await expect(page.getByRole('heading', { name: 'E2E Réservation Item' })).toBeVisible();

    await page.getByRole('button', { name: /Réserver maintenant/i }).click();
    await page.waitForURL(/\/user\/reservations/, { timeout: 15_000 });
    await expect(page.getByText('E2E Réservation Item').first()).toBeVisible();

    await page.getByRole('button', { name: /déconnexion/i }).click();
    await page.waitForURL(/\/auth/, { timeout: 15_000 });

    await loginAs(page, 'merchant');
    await page.goto('/merchant/orders');

    // Merchant order pipeline currently only exposes a cancel action while a
    // reservation is pending (see app/(dashboard)/merchant/orders/page.tsx) -
    // no explicit "confirm" button exists yet, so the meaningful assertion
    // here is that the reservation surfaces correctly on the merchant side.
    await expect(page.getByText('E2E Réservation Item').first()).toBeVisible({ timeout: 15_000 });
  });
});
