// Pure, dependency-injected webhook auth logic — no Deno/network imports —
// so it runs identically in the Edge Function and under vitest (Node).

export type WebhookAuthInput = {
  expectedSecret: string;
  providedSecret: string;
  allowInsecureOverride: boolean;
  isLocalEnvironment: boolean;
};

export type WebhookAuthResult = { authorized: boolean; reason: string };

// Constant-time comparison so the response does not leak the secret's
// content through byte-by-byte `===` timing differences.
export const timingSafeEqual = (a: string, b: string): boolean => {
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  const length = Math.max(bufA.length, bufB.length, 1);
  let diff = bufA.length === bufB.length ? 0 : 1;

  for (let i = 0; i < length; i++) {
    diff |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  }

  return diff === 0;
};

// A real Supabase project URL is always https://<ref>.supabase.co; only the
// local CLI stack points at localhost/127.0.0.1/kong. This is used to make
// the insecure-webhook override only take effect against a local dev stack,
// regardless of how ALLOW_INSECURE_WEBHOOKS is set in a real project's
// secrets.
export const isLocalSupabaseUrl = (url: string): boolean => {
  const normalized = url.toLowerCase();
  return (
    normalized.includes("127.0.0.1") ||
    normalized.includes("localhost") ||
    normalized.includes("kong:")
  );
};

export const evaluateWebhookAuthorization = (
  input: WebhookAuthInput
): WebhookAuthResult => {
  if (!input.expectedSecret) {
    const authorized = input.allowInsecureOverride && input.isLocalEnvironment;
    return {
      authorized,
      reason: authorized
        ? "insecure_local_override"
        : "missing_secret_configuration",
    };
  }

  if (!input.providedSecret) {
    return { authorized: false, reason: "missing_provided_secret" };
  }

  const authorized = timingSafeEqual(input.providedSecret, input.expectedSecret);
  return { authorized, reason: authorized ? "secret_match" : "secret_mismatch" };
};
