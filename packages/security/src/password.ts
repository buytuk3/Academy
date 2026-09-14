/**
 * @workspace/security — password.ts
 * Canonical password hashing. Chosen implementation: bcrypt (native dep of
 * the reading engine; bcryptjs remains only in api-server until P5, then
 * migrated to this owner — documented in P3 report §16).
 */
import bcrypt from "bcryptjs";

export async function hashPassword(plain: string, rounds = 10): Promise<string> {
  return bcrypt.hash(plain, rounds);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
