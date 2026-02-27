import type { Session } from "@supabase/supabase-js";
import { supabaseClient } from "@/api/supabaseClient";

const TOKEN_REFRESH_GRACE_MS = 60 * 1000;

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

  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  const currentSession = sessionData.session;

  if (!sessionError && currentSession?.access_token && !isTokenExpiringSoon(currentSession)) {
    return currentSession;
  }

  const { data: refreshedData, error: refreshError } = await supabaseClient.auth.refreshSession();
  if (refreshError || !refreshedData.session?.access_token) {
    return null;
  }

  return refreshedData.session;
};

const parseJsonSafely = async <T>(response: Response): Promise<T | null> => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

export const callEdgeFunctionWithAuth = async <T>({
  functionName,
  body,
  retryOnUnauthorized = true,
}: {
  functionName: string;
  body: Record<string, unknown>;
  retryOnUnauthorized?: boolean;
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
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const payload = await parseJsonSafely<T & EdgeFunctionErrorPayload>(response);
    return { response, payload };
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

  let { response, payload } = await execute(session.access_token);

  if (response.status === 401 && retryOnUnauthorized) {
    const { data: refreshedData, error: refreshError } = await supabaseClient.auth.refreshSession();
    if (!refreshError && refreshedData.session?.access_token) {
      session = refreshedData.session;
      ({ response, payload } = await execute(session.access_token));
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

