import { test, expect } from '@playwright/test';
import { loginAs } from './utils/auth-helpers';
import { createPendingDriver } from './utils/db';

test.describe('Validation admin des chauffeurs', { tag: '@regression' }, () => {
  test("l'admin valide une demande de chauffeur en attente", async ({ page }) => {
    const fullName = `E2E Chauffeur Valide ${Date.now()}`;
    await createPendingDriver(fullName);

    await loginAs(page, 'admin');
    await page.goto('/admin/validations');
    await page.getByRole('tab', { name: /Chauffeurs/i }).click();

    await page.getByPlaceholder('Rechercher un chauffeur...').fill(fullName);
    const card = page.getByText(fullName).first();
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card
      .locator('xpath=ancestor::div[contains(@class, "p-4")][1]')
      .getByRole('button', { name: 'Valider' })
      .click();
    await page.getByRole('button', { name: /Confirmer la validation/i }).click();

    await expect(page.getByText(/validé avec succès/i)).toBeVisible({ timeout: 15_000 });
  });

  test("l'admin refuse une demande de chauffeur avec un motif obligatoire", async ({ page }) => {
    const fullName = `E2E Chauffeur Refuse ${Date.now()}`;
    await createPendingDriver(fullName);

    await loginAs(page, 'admin');
    await page.goto('/admin/validations');
    await page.getByRole('tab', { name: /Chauffeurs/i }).click();

    await page.getByPlaceholder('Rechercher un chauffeur...').fill(fullName);
    const card = page.getByText(fullName).first();
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card
      .locator('xpath=ancestor::div[contains(@class, "p-4")][1]')
      .getByRole('button', { name: 'Refuser' })
      .click();

    const confirmRefuse = page.getByRole('button', { name: /Confirmer le refus/i });
    await expect(confirmRefuse).toBeDisabled();

    await page.getByPlaceholder(/Indiquez le motif du refus/i).fill('Permis de conduire manquant (test E2E)');
    await confirmRefuse.click();

    await expect(page.getByText(/a été notifié|refusé/i)).toBeVisible({ timeout: 15_000 });
  });
});
