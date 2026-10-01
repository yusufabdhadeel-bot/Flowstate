import bcrypt from "bcrypt";

/**
 * Cost factor for bcrypt. 12 is the current OWASP recommendation and costs
 * roughly 250-400ms per hash on commodity hardware.
 */
const SALT_ROUNDS = 12;

/** Minimum acceptable password length. */
export const MIN_PASSWORD_LENGTH = 12;

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * Hash a plaintext password with bcrypt.
 * Callers should pass a plaintext password, never an already-hashed value.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("Password is required");
  }
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

/**
 * Verify a plaintext password against a stored bcrypt hash.
 *
 * Returns false (rather than throwing) for any malformed or missing hash so
 * that callers cannot accidentally distinguish "no such user" from "bad hash"
 * and leak account existence.
 */
export async function verifyPassword(
  plaintext: string,
  storedHash: string | null | undefined,
): Promise<boolean> {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    return false;
  }
  if (typeof storedHash !== "string" || !BCRYPT_HASH_PATTERN.test(storedHash)) {
    return false;
  }
  try {
    return await bcrypt.compare(plaintext, storedHash);
  } catch {
    return false;
  }
}

/**
 * True when a stored value is a legacy plaintext or placeholder password
 * (for example the original seed data) rather than a real bcrypt hash.
 */
export function isLegacyPlaintextPassword(
  storedHash: string | null | undefined,
): boolean {
  return (
    typeof storedHash !== "string" || !BCRYPT_HASH_PATTERN.test(storedHash)
  );
}
