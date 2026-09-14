/**
 * CORE-08 — Actor authorization for teacher decisions.
 * "Not every user can make a Teacher Decision." Uses the EXISTING role model
 * (contracts + users.roleEnum) — no new permission system. Extensible later to
 * lead-teacher / specialist / principal without schema change.
 */
import { ClassifiedError, recordSecurityEvent, createLogger, getMetrics } from "@workspace/observability";

const log = createLogger({ name: "teacher-decision-rbac" });

export const DECISION_ROLES = ["teacher", "principal", "lead-teacher", "admin"] as const;

export function assertActorCanDecide(actorRole: string): void {
  if (!(DECISION_ROLES as readonly string[]).includes(actorRole)) {
    recordSecurityEvent(log, getMetrics(), "authorization-failure", {
      detail: { actorRole, reason: "role-not-allowed-to-decide" },
    });
    throw new ClassifiedError("authorization", "ACTOR_ROLE_NOT_AUTHORIZED");
  }
}
