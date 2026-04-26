// ==========================================
// Test Setup - Global Test Configuration
// ==========================================

import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
    if (typeof document !== 'undefined') {
        cleanup();
    }
});

// Mock environment variables
vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

// Mock navigator when running in DOM-like environments
if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'navigator', {
        value: {
            userAgent: 'Mozilla/5.0 (Test Browser)',
        },
        writable: true,
    });
}

// Mock crypto for testing
if (!global.crypto) {
    global.crypto = {
        getRandomValues: (arr: Uint8Array) => {
            for (let i = 0; i < arr.length; i++) {
                arr[i] = Math.floor(Math.random() * 256);
            }
            return arr;
        },
        subtle: {
            digest: async (algorithm: string, data: BufferSource) => {
                // Simple mock hash
                return new ArrayBuffer(32);
            },
        } as SubtleCrypto,
    } as Crypto;
}

// Extend expect with custom matchers if needed
expect.extend({
    toBeValidEmail(received: string) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const pass = emailRegex.test(received);

        return {
            pass,
            message: () =>
                pass
                    ? `expected ${received} not to be a valid email`
                    : `expected ${received} to be a valid email`,
        };
    },
});
