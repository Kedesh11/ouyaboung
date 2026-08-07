// ============================================
// E2E Test Fixtures - Local Supabase only
// ============================================
// These accounts are created by e2e/global-setup.ts against the local
// Supabase stack (`supabase start`). Never point this suite at production -
// see playwright.config.ts webServer.env for the local URL/keys used.

export interface TestUserFixture {
  email: string;
  password: string;
  role: 'user' | 'merchant' | 'farmer' | 'driver' | 'admin';
  fullName: string;
  metadata?: Record<string, unknown>;
}

export const TEST_USERS: Record<string, TestUserFixture> = {
  user: {
    email: 'e2e-user@ouyaboung.test',
    password: 'E2eTest!2026',
    role: 'user',
    fullName: 'E2E Consommateur',
  },
  merchant: {
    email: 'e2e-merchant@ouyaboung.test',
    password: 'E2eTest!2026',
    role: 'merchant',
    fullName: 'E2E Commerce',
    metadata: {
      business_name: 'E2E Commerce Test',
      business_type: 'grocery',
      phone: '+24101020304',
      address: '12 avenue de test',
      city: 'Libreville',
      quartier: 'Louis',
    },
  },
  farmer: {
    email: 'e2e-farmer@ouyaboung.test',
    password: 'E2eTest!2026',
    role: 'farmer',
    fullName: 'E2E Exploitation',
    metadata: {
      farm_name: 'E2E Exploitation Test',
      farmer_type: 'agriculture',
      phone: '+24101020305',
      address: '5 route de test',
      city: 'Libreville',
      quartier: 'Nzeng-Ayong',
    },
  },
  driver: {
    email: 'e2e-driver@ouyaboung.test',
    password: 'E2eTest!2026',
    role: 'driver',
    fullName: 'E2E Chauffeur',
    metadata: {
      full_name: 'E2E Chauffeur',
      vehicle_type: 'moto',
      phone: '+24101020306',
      city: 'Libreville',
      delivery_zone: 'Louis, Nzeng-Ayong',
    },
  },
  admin: {
    email: 'e2e-admin@ouyaboung.test',
    password: 'E2eTest!2026',
    role: 'admin',
    fullName: 'E2E Admin',
  },
};

export const roleHomePath: Record<TestUserFixture['role'], string> = {
  user: '/user',
  merchant: '/merchant',
  farmer: '/farmer',
  driver: '/driver',
  admin: '/admin',
};
