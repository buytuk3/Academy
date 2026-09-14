/**
 * CORE-15 — tenant/student context guards. Canonical error strings,
 * identical contract to the rest of the platform (CORE-05/14).
 */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function assertNumeracyContext(tenantId: string | undefined, studentId: string | undefined): void {
  if (tenantId === undefined || tenantId.trim() === "") throw new Error("TENANT_CONTEXT_MISSING");
  if (!UUID_RE.test(tenantId)) throw new Error("INVALID_TENANT_ID");
  if (studentId === undefined || studentId.trim() === "") throw new Error("STUDENT_CONTEXT_MISSING");
  if (!UUID_RE.test(studentId)) throw new Error("INVALID_STUDENT_ID");
}
