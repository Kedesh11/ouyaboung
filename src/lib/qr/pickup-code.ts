export const MAX_PICKUP_CODE_LENGTH = 64;

export const normalizePickupCode = (value: string): string =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const isLikelyPickupCode = (value: string): boolean =>
  /^[A-Z0-9]{6,64}$/.test(value);

const extractCodeFromParsedPayload = (parsed: unknown): string => {
  if (!parsed || typeof parsed !== "object") return "";
  const record = parsed as Record<string, unknown>;
  const rawCode =
    typeof record.pickup_code === "string"
      ? record.pickup_code
      : typeof record.pickupCode === "string"
        ? record.pickupCode
        : typeof record.code === "string"
          ? record.code
          : "";
  return rawCode ? normalizePickupCode(rawCode) : "";
};

export const decodeBase64Payload = (value: string): string | null => {
  const compact = value.replace(/\s+/g, "");
  if (!compact) return null;

  const base64Candidate = compact.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = base64Candidate.length % 4;
  const padded =
    remainder === 0 ? base64Candidate : `${base64Candidate}${"=".repeat(4 - remainder)}`;

  try {
    return atob(padded);
  } catch {
    return null;
  }
};

export const extractPickupCode = (rawValue: string): string => {
  const trimmed = rawValue.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const queryCode = url.searchParams.get("pickup_code") || url.searchParams.get("code");
    if (queryCode) return normalizePickupCode(queryCode);

    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      const hashCode = hashParams.get("pickup_code") || hashParams.get("code");
      if (hashCode) return normalizePickupCode(hashCode);
    }

    const pathSegments = url.pathname.split("/").filter(Boolean).reverse();
    for (const segment of pathSegments) {
      const decodedSegment = decodeURIComponent(segment);
      const normalizedSegment = normalizePickupCode(decodedSegment);
      if (isLikelyPickupCode(normalizedSegment)) {
        return normalizedSegment;
      }
    }
  } catch {
    // Not a URL payload.
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsedCode = extractCodeFromParsedPayload(JSON.parse(trimmed));
      if (parsedCode) return parsedCode;
    } catch {
      // Not a JSON payload.
    }
  }

  const decodedBase64 = decodeBase64Payload(trimmed);
  const hasPickupPayloadHints =
    !!decodedBase64 &&
    (decodedBase64.includes("{") ||
      decodedBase64.includes("http") ||
      /pickup[_-]?code/i.test(decodedBase64));

  if (decodedBase64 && decodedBase64 !== trimmed && hasPickupPayloadHints) {
    const decodedCode = extractPickupCode(decodedBase64);
    if (decodedCode) return decodedCode;
  }

  return normalizePickupCode(trimmed);
};
