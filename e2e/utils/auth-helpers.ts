import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { TEST_USERS, roleHomePath, type TestUserFixture } from '../fixtures/test-users';

/**
 * Logs in via the real /auth form (login tab is the default tab) and waits
 * for AuthRedirectHandler/middleware to land on the role's home page.
 */
export async function loginAs(page: Page, fixtureKey: keyof typeof TEST_USERS) {
  const fixture = TEST_USERS[fixtureKey];
  await page.goto('/auth');
  await page.locator('#login-email').fill(fixture.email);
  await page.locator('#login-password').fill(fixture.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL(new RegExp(`${roleHomePath[fixture.role]}(/|$)`), { timeout: 15_000 });
  return fixture;
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: /déconnexion/i }).click();
  await page.waitForURL(/\/auth(\?.*)?$/, { timeout: 15_000 });
}

export function expectOnRoleHome(page: Page, fixture: TestUserFixture) {
  return expect(page).toHaveURL(new RegExp(`${roleHomePath[fixture.role]}(/|$)`));
}
