import type { Session } from "@supabase/supabase-js";
import { supabaseClient } from "@/api/supabaseClient";

const TOKEN_REFRESH_GRACE_MS = 60 * 1000;
const AUTH_TIMEOUT_MS = 7000;

interface EdgeFunctionErrorPayload {
  success?: boolean;
  error?: string;
  code?: string;
  message?: string;
}

export interface EdgeFunctionCallResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: EdgeFunctionErrorPayload | null;
}

const isTokenExpiringSoon = (session: Session): boolean => {
  if (!session.expires_at) return true;
  return session.expires_at * 1000 - Date.now() <= TOKEN_REFRESH_GRACE_MS;
};

export const getFreshSession = async (): Promise<Session | null> => {
  if (!supabaseClient) return null;

  try {
    const { data: sessionData, error: sessionError } = await withTimeout(
      supabaseClient.auth.getSession(),
      AUTH_TIMEOUT_MS,
      "AUTH_TIMEOUT_GET_SESSION"
    );
    const currentSession = sessionData.session;

    if (!sessionError && currentSession?.access_token && !isTokenExpiringSoon(currentSession)) {
      return currentSession;
    }

    const { data: refreshedData, error: refreshError } = await withTimeout(
      supabaseClient.auth.refreshSession(),
      AUTH_TIMEOUT_MS,
      "AUTH_TIMEOUT_REFRESH_SESSION"
    );
    if (refreshError || !refreshedData.session?.access_token) {
      return null;
    }

    return refreshedData.session;
  } catch {
    return null;
  }
};

const parseJsonSafely = async <T>(response: Response): Promise<T | null> => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, code: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(code)), timeoutMs);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export const callEdgeFunctionWithAuth = async <T>({
  functionName,
  body,
  retryOnUnauthorized = true,
  timeoutMs = 15000,
}: {
  functionName: string;
  body: Record<string, unknown>;
  retryOnUnauthorized?: boolean;
  timeoutMs?: number;
}): Promise<EdgeFunctionCallResult<T>> => {
  if (!supabaseClient) {
    return {
      ok: false,
      status: 500,
      data: null,
      error: { code: "SUPABASE_NOT_INITIALIZED", error: "Supabase client not initialized" },
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return {
      ok: false,
      status: 500,
      data: null,
      error: { code: "SUPABASE_CONFIG_ERROR", error: "Supabase configuration missing" },
    };
  }

  const execute = async (accessToken: string) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const payload = await parseJsonSafely<T & EdgeFunctionErrorPayload>(response);
      return { response, payload };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  let session = await getFreshSession();
  if (!session?.access_token) {
    return {
      ok: false,
      status: 401,
      data: null,
      error: {
        code: "SESSION_EXPIRED",
        error: "Session expiree. Veuillez vous reconnecter.",
      },
    };
  }

  let response: Response;
  let payload: (T & EdgeFunctionErrorPayload) | null;

  try {
    ({ response, payload } = await execute(session.access_token));
  } catch (error) {
    const isAbortError = (error as { name?: string } | null)?.name === "AbortError";
    return {
      ok: false,
      status: 0,
      data: null,
      error: {
        code: isAbortError ? "REQUEST_TIMEOUT" : "NETWORK_ERROR",
        error: isAbortError
          ? "La requete a expire. Verifiez la connexion et reessayez."
          : "Erreur reseau lors de l'appel Edge Function.",
      },
    };
  }

  if (response.status === 401 && retryOnUnauthorized) {
    try {
      const { data: refreshedData, error: refreshError } = await withTimeout(
        supabaseClient.auth.refreshSession(),
        AUTH_TIMEOUT_MS,
        "AUTH_TIMEOUT_REFRESH_SESSION"
      );
      if (!refreshError && refreshedData.session?.access_token) {
        session = refreshedData.session;
        try {
          ({ response, payload } = await execute(session.access_token));
        } catch (error) {
          const isAbortError = (error as { name?: string } | null)?.name === "AbortError";
          return {
            ok: false,
            status: 0,
            data: null,
            error: {
              code: isAbortError ? "REQUEST_TIMEOUT" : "NETWORK_ERROR",
              error: isAbortError
                ? "La requete a expire. Verifiez la connexion et reessayez."
                : "Erreur reseau lors de l'appel Edge Function.",
            },
          };
        }
      }
    } catch {
      return {
        ok: false,
        status: 0,
        data: null,
        error: {
          code: "AUTH_TIMEOUT_REFRESH_SESSION",
          error: "La session n'a pas pu etre rafraichie a temps. Reessayez.",
        },
      };
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      data: null,
      error: payload ?? { code: "EDGE_FUNCTION_ERROR", error: "Edge function request failed" },
    };
  }

  return {
    ok: true,
    status: response.status,
    data: payload as T,
    error: null,
  };
};
