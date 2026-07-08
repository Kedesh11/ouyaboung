import {
  evaluateWebhookAuthorization,
  isLocalSupabaseUrl,
  timingSafeEqual,
} from "./webhook-auth";

describe("webhook-auth", () => {
  describe("timingSafeEqual", () => {
    it("returns true for identical strings", () => {
      expect(timingSafeEqual("s3cr3t", "s3cr3t")).toBe(true);
    });

    it("returns false for different strings of the same length", () => {
      expect(timingSafeEqual("s3cr3t", "s3cr3x")).toBe(false);
    });

    it("returns false for different lengths", () => {
      expect(timingSafeEqual("short", "much-longer-secret")).toBe(false);
    });

    it("returns false when comparing against an empty string", () => {
      expect(timingSafeEqual("s3cr3t", "")).toBe(false);
      expect(timingSafeEqual("", "")).toBe(true);
    });
  });

  describe("isLocalSupabaseUrl", () => {
    it("recognizes local Supabase CLI URLs", () => {
      expect(isLocalSupabaseUrl("http://127.0.0.1:54321")).toBe(true);
      expect(isLocalSupabaseUrl("http://localhost:54321")).toBe(true);
      expect(isLocalSupabaseUrl("http://kong:8000")).toBe(true);
    });

    it("rejects real hosted project URLs", () => {
      expect(isLocalSupabaseUrl("https://geqvbpghvmcglzfkqmvj.supabase.co")).toBe(
        false
      );
    });
  });

  describe("evaluateWebhookAuthorization", () => {
    it("refuses a callback in production when no secret is configured, even if the override flag is set", () => {
      const result = evaluateWebhookAuthorization({
        expectedSecret: "",
        providedSecret: "",
        allowInsecureOverride: true,
        isLocalEnvironment: false,
      });
      expect(result.authorized).toBe(false);
      expect(result.reason).toBe("missing_secret_configuration");
    });

    it("refuses a callback when no secret is configured and the override flag is off, even locally", () => {
      const result = evaluateWebhookAuthorization({
        expectedSecret: "",
        providedSecret: "",
        allowInsecureOverride: false,
        isLocalEnvironment: true,
      });
      expect(result.authorized).toBe(false);
    });

    it("allows a callback with no secret only when both local and the override flag are set", () => {
      const result = evaluateWebhookAuthorization({
        expectedSecret: "",
        providedSecret: "",
        allowInsecureOverride: true,
        isLocalEnvironment: true,
      });
      expect(result.authorized).toBe(true);
      expect(result.reason).toBe("insecure_local_override");
    });

    it("refuses a callback with no provided secret when a secret is configured", () => {
      const result = evaluateWebhookAuthorization({
        expectedSecret: "expected-secret",
        providedSecret: "",
        allowInsecureOverride: false,
        isLocalEnvironment: false,
      });
      expect(result.authorized).toBe(false);
      expect(result.reason).toBe("missing_provided_secret");
    });

    it("refuses a callback with an incorrect secret", () => {
      const result = evaluateWebhookAuthorization({
        expectedSecret: "expected-secret",
        providedSecret: "wrong-secret",
        allowInsecureOverride: false,
        isLocalEnvironment: false,
      });
      expect(result.authorized).toBe(false);
      expect(result.reason).toBe("secret_mismatch");
    });

    it("authorizes a callback with the correct secret", () => {
      const result = evaluateWebhookAuthorization({
        expectedSecret: "expected-secret",
        providedSecret: "expected-secret",
        allowInsecureOverride: false,
        isLocalEnvironment: false,
      });
      expect(result.authorized).toBe(true);
      expect(result.reason).toBe("secret_match");
    });
  });
});
