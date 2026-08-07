// ============================================
// Artillery Playwright-engine scenarios for authenticated-flows.yml
// Local Supabase fixture accounts only - see e2e/fixtures/test-users.ts
// (kept as plain JS credentials here since Artillery's processor loads this
// file directly with Node, outside the Playwright/TS test runner).
// ============================================

const USER = { email: 'e2e-user@ouyaboung.test', password: 'E2eTest!2026' };
const MERCHANT = { email: 'e2e-merchant@ouyaboung.test', password: 'E2eTest!2026' };

async function login(page, { email, password }) {
  await page.goto('/auth');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL(/\/(user|merchant)(\/|$)/, { timeout: 15000 });
}

async function userSearchFlow(page) {
  await login(page, USER);
  await page.goto('/search');
  await page.waitForLoadState('networkidle');
}

async function merchantFarmOrdersFlow(page) {
  await login(page, MERCHANT);
  await page.goto('/merchant/farm-orders');
  await page.waitForLoadState('networkidle');
}

module.exports = { userSearchFlow, merchantFarmOrdersFlow };
