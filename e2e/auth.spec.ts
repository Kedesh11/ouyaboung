import { test, expect } from '@playwright/test';
import { TEST_USERS, roleHomePath } from './fixtures/test-users';
import { loginAs } from './utils/auth-helpers';
import { confirmUserEmail } from './utils/db';

test.describe('Authentification', { tag: '@regression' }, () => {
  for (const key of Object.keys(TEST_USERS) as (keyof typeof TEST_USERS)[]) {
    test(`connexion ${key} redirige vers son espace`, async ({ page }) => {
      const fixture = await loginAs(page, key);
      await expect(page).toHaveURL(new RegExp(`${roleHomePath[fixture.role]}(/|$)`));
    });
  }

  test('une route protégée redirige un visiteur non connecté vers /auth', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForURL(/\/auth(\?.*)?$/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/auth/);
  });

  test('un identifiant invalide affiche une erreur et ne redirige pas', async ({ page }) => {
    await page.goto('/auth');
    await page.locator('#login-email').fill('inconnu@ouyaboung.test');
    await page.locator('#login-password').fill('MauvaisMotDePasse!');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByText(/incorrect|erreur/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/auth/);
  });

  test('inscription chauffeur réelle + confirmation + connexion', async ({ page }) => {
    const email = `e2e-signup-${Date.now()}@ouyaboung.test`;
    const password = 'E2eSignup!2026';

    await page.goto('/driver/register');

    await page.getByLabel('Nom complet *').fill('E2E Nouveau Chauffeur');
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Moto' }).click();
    await page.getByRole('button', { name: 'Suivant' }).click();

    // These fields wrap the <Input> in an icon div, which breaks the
    // shadcn FormLabel<->FormControl id association (Slot clones the id
    // onto the wrapper div, not the input) - placeholder-based locators are
    // the reliable option here rather than getByLabel.
    await page.getByPlaceholder('contact@email.ga').fill(email);
    await page.getByPlaceholder('••••••••').fill(password);
    await page.getByPlaceholder('+241 XX XX XX XX').fill('+24107070707');
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Libreville' }).click();
    await page.getByRole('button', { name: 'Suivant' }).click();

    await page.getByLabel(/J'accepte les/).check();
    await page.getByLabel(/Je m'engage à respecter/).check();
    await page.getByRole('button', { name: /Soumettre ma demande/i }).click();

    await page.waitForURL(/\/auth/, { timeout: 20_000 });

    // Supabase requires email confirmation before login is possible; this
    // project routes auth emails through real SMTP even locally (see
    // supabase/config.toml [auth.email.smtp]), so confirming via the admin
    // API is the reliable, environment-independent way to test this path
    // rather than reading a real inbox.
    await confirmUserEmail(email);

    await page.goto('/auth');
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(password);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.waitForURL(/\/driver(\/|$)/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/driver/);
  });
});
