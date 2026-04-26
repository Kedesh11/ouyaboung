export const normalizeStatus = (value: unknown): string =>
  typeof value === "string" ? value.trim().toUpperCase() : "";

export const normalizeCode = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const resolveFinalStatus = (
  status: unknown,
  code: unknown
): "SUCCESS" | "FAILED" | "PENDING" => {
  const normalizedStatus = normalizeStatus(status);
  const normalizedCode = normalizeCode(code);

  if (normalizedStatus === "SUCCESS" && (normalizedCode === null || normalizedCode === 200)) {
    return "SUCCESS";
  }

  if (
    normalizedStatus === "FAILED" ||
    normalizedStatus === "ERROR" ||
    normalizedStatus === "CANCELLED"
  ) {
    return "FAILED";
  }

  return "PENDING";
};
