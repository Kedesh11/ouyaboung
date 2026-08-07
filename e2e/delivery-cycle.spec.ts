import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { loginAs } from './utils/auth-helpers';
import { createReadyFarmOrder, getFarmOrderStatus } from './utils/db';
import { TEST_USERS } from './fixtures/test-users';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROOF_PHOTO_PATH = path.join(__dirname, 'fixtures', 'proof-photo.png');

// Libreville coordinates - inside GABON_LOCATION_BOUNDS, used by useDriverLocationTracking.
const LIBREVILLE_POSITION = { latitude: 0.4162, longitude: 9.4673 };

test.describe('Cycle de livraison chauffeur (agriculteur -> commerçant)', { tag: '@regression' }, () => {
  test('le chauffeur accepte, récupère, met en route et confirme la livraison avec photo', async ({ page, context }) => {
      const { farmOrderId, productName } = await createReadyFarmOrder(
        TEST_USERS.farmer.email,
        TEST_USERS.merchant.email
      );

      await context.grantPermissions(['geolocation']);
      await context.setGeolocation(LIBREVILLE_POSITION);

      await loginAs(page, 'driver');
      await page.goto('/driver/deliveries');

      // The pool can accumulate other unassigned deliveries left over from
      // other test runs. Both filters below are checked independently
      // against any descendant, so an outer wrapper containing *all*
      // delivery cards can satisfy both (this card's heading + some other
      // stale card's button) - .last() picks the innermost/most specific
      // matching container instead of that wrapper.
      const deliveryCard = page
        .locator('div')
        .filter({ has: page.getByRole('heading', { name: productName, exact: true }) })
        .filter({ has: page.getByRole('button', { name: 'Accepter' }) })
        .last();
      await expect(deliveryCard).toBeVisible({ timeout: 15_000 });
      await deliveryCard.getByRole('button', { name: 'Accepter' }).click();
    await expect(page.getByText(/livraison acceptée/i)).toBeVisible({ timeout: 15_000 });

    await expect(page.getByRole('heading', { name: 'Livraison en cours' })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Marquer récupérée' }).click();
    await expect(page.getByText(/récupérée/i)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'En route' }).click();
    await expect(page.getByText(/en route/i)).toBeVisible({ timeout: 15_000 });

    await page.locator('input[type="file"]').setInputFiles(PROOF_PHOTO_PATH);
    await page.getByRole('button', { name: /Confirmer la livraison/i }).click();
    await expect(page.getByText(/livraison confirmée/i)).toBeVisible({ timeout: 20_000 });

    await expect
      .poll(() => getFarmOrderStatus(farmOrderId), { timeout: 15_000 })
      .toBe('delivered');
  });
});
