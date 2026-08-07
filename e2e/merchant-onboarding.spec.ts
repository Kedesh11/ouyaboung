import { test, expect } from '@playwright/test';
import { loginAs } from './utils/auth-helpers';
import { createPendingMerchant } from './utils/db';

test.describe('Validation admin des commerçants', { tag: '@regression' }, () => {
  test("l'admin valide une demande de commerce en attente", async ({ page }) => {
    const businessName = `E2E Commerce Valide ${Date.now()}`;
    await createPendingMerchant(businessName);

    await loginAs(page, 'admin');
    await page.goto('/admin/validations');
    await page.getByRole('tab', { name: /Commerçants/i }).click();

    await page.getByPlaceholder('Rechercher un commerce...').fill(businessName);
    const card = page.getByText(businessName).first();
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card
      .locator('xpath=ancestor::div[contains(@class, "p-4")][1]')
      .getByRole('button', { name: 'Valider' })
      .click();
    await page.getByRole('button', { name: /Confirmer la validation/i }).click();

    await expect(page.getByText(/validé avec succès/i)).toBeVisible({ timeout: 15_000 });
  });

  test("l'admin refuse une demande de commerce avec un motif obligatoire", async ({ page }) => {
    const businessName = `E2E Commerce Refuse ${Date.now()}`;
    await createPendingMerchant(businessName);

    await loginAs(page, 'admin');
    await page.goto('/admin/validations');
    await page.getByRole('tab', { name: /Commerçants/i }).click();

    await page.getByPlaceholder('Rechercher un commerce...').fill(businessName);
    const card = page.getByText(businessName).first();
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card
      .locator('xpath=ancestor::div[contains(@class, "p-4")][1]')
      .getByRole('button', { name: 'Refuser' })
      .click();

    // Confirm button stays disabled until a reason is provided.
    const confirmRefuse = page.getByRole('button', { name: /Confirmer le refus/i });
    await expect(confirmRefuse).toBeDisabled();

    await page.getByPlaceholder(/Indiquez le motif du refus/i).fill('Documents incomplets (test E2E)');
    await confirmRefuse.click();

    await expect(page.getByText(/a été notifié|refusé/i)).toBeVisible({ timeout: 15_000 });
  });
});
