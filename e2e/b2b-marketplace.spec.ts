import { test, expect } from '@playwright/test';
import { loginAs, logout } from './utils/auth-helpers';

test.describe('Marché B2B agriculteur <-> commerçant', { tag: '@regression' }, () => {
  test('un agriculteur publie un produit, un commerçant commande, l\'agriculteur confirme et prépare', async ({ page }) => {
    const productName = `E2E B2B Product ${Date.now()}`;

    // 1. Farmer publishes a catalogue product.
    await loginAs(page, 'farmer');
    await page.goto('/farmer/products');
    await page.getByRole('button', { name: 'Nouveau produit' }).click();

    await page.getByLabel('Nom du produit *').fill(productName);
    await page.getByLabel('Prix par unité (XAF) *').fill('1500');
    await page.getByLabel('Quantité disponible *').fill('50');
    await page.getByRole('button', { name: 'Créer le produit' }).click();
    await expect(page.getByText(/créé/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: productName })).toBeVisible();

    await logout(page);

    // 2. Merchant finds the farmer and places an order.
    await loginAs(page, 'merchant');
    await page.goto('/merchant/farmers');
    await page.getByPlaceholder('Rechercher une exploitation...').fill('E2E Exploitation Test');
    await page.getByText('E2E Exploitation Test').first().click();

    await page.waitForURL(/\/merchant\/farmers\/.+/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: productName })).toBeVisible({ timeout: 15_000 });
    // The farmer's catalogue can accumulate other products left over from
    // other test runs, so scope to the card for this test's product
    // specifically rather than assuming there's only one "Commander"
    // button. Both filters below are checked independently against any
    // descendant, so an outer wrapper containing *all* product cards can
    // satisfy both (this card's heading + some other card's button) -
    // .last() picks the innermost/most specific matching container instead
    // of that wrapper.
    const productCard = page
      .locator('div')
      .filter({ has: page.getByRole('heading', { name: productName, exact: true }) })
      .filter({ has: page.getByRole('button', { name: 'Commander' }) })
      .last();
    await productCard.getByRole('button', { name: 'Commander' }).click();
    await page.getByRole('button', { name: 'Envoyer la commande' }).click();

    await page.waitForURL(/\/merchant\/farm-orders/, { timeout: 15_000 });
    await expect(page.getByText(productName)).toBeVisible({ timeout: 15_000 });

    await logout(page);

    // 3. Farmer confirms then marks the order ready.
    await loginAs(page, 'farmer');
    await page.goto('/farmer/orders');
    await page.getByText(productName).first().click();
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.getByText(/confirmée/i)).toBeVisible({ timeout: 15_000 });

    await page.getByText(productName).first().click();
    await page.getByRole('button', { name: /Marquer comme prête/i }).click();
    await expect(page.getByText(/marquée comme prête/i)).toBeVisible({ timeout: 15_000 });
  });
});
