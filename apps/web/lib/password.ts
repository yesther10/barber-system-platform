/**
 * Password hashing for Credentials sign-in (user-auth spec, task 3.1).
 *
 * bcryptjs is a pure-JS bcrypt implementation: identical algorithm to native
 * bcrypt but no native build step, so it runs everywhere in the monorepo
 * (vitest, Testcontainers, Next build). Swap for native bcrypt later without
 * touching callers — the hash format `$2b$...` is interoperable.
 */
import bcrypt from "bcryptjs";

/** Cost factor — 10 is the bcrypt default and a good dev/prod balance. */
const BCRYPT_ROUNDS = 10;

/** Hashes a plaintext password into a salted bcrypt hash. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** Verifies a plaintext password against a stored bcrypt hash. */
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
