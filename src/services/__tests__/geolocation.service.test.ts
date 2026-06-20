import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveUserLocation } from '../geolocation.service';

const installLocalStorage = () => {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
    removeItem: vi.fn((key: string) => store.delete(key)),
  };

  vi.stubGlobal('window', { localStorage });
};

describe('geolocation.service', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses IP fallback during passive loading without prompting for GPS permission', async () => {
    installLocalStorage();

    const getCurrentPosition = vi.fn();
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition },
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'prompt' }),
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: {
            latitude: 0.4162,
            longitude: 9.4673,
            city: 'Libreville',
            country: 'GA',
            source: 'ip_lookup',
            isApproximate: true,
          },
        }),
      })
    );

    const result = await resolveUserLocation({
      forceRefresh: true,
      requestBrowserPermission: false,
      fallbackToIp: true,
    });

    expect(result.success).toBe(true);
    expect(result.data?.source).toBe('ip_lookup');
    expect(result.data?.isApproximate).toBe(true);
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('retries with lower accuracy when high accuracy GPS times out', async () => {
    installLocalStorage();

    const positionOptions: PositionOptions[] = [];
    const getCurrentPosition = vi.fn(
      (
        success: PositionCallback,
        error: PositionErrorCallback,
        options?: PositionOptions
      ) => {
        positionOptions.push(options ?? {});
        if (positionOptions.length === 1) {
          error({ code: 3, message: 'timeout' } as GeolocationPositionError);
          return;
        }

        success({
          coords: {
            latitude: 0.4162,
            longitude: 9.4673,
            accuracy: 42,
          },
        } as GeolocationPosition);
      }
    );

    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition },
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'granted' }),
      },
    });

    const result = await resolveUserLocation({
      forceRefresh: true,
      enableHighAccuracy: true,
      timeoutMs: 12000,
      fallbackToIp: false,
      requestBrowserPermission: true,
      retryLowAccuracy: true,
    });

    expect(result.success).toBe(true);
    expect(result.data?.source).toBe('browser');
    expect(positionOptions).toHaveLength(2);
    expect(positionOptions[0].enableHighAccuracy).toBe(true);
    expect(positionOptions[1].enableHighAccuracy).toBe(false);
  });
});
