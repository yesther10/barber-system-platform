/**
 * Session user mapping (user-auth spec, task 3.1).
 *
 * Auth.js sessions carry a `SessionUser` (contract) with role and tenant so
 * every route can scope to the caller's `barbershopId` and enforce roles
 * server-side. The DB stores roles as UPPER_SNAKE enums; the session and
 * every API boundary use the lowercase contract roles.
 */
import type { Role as DbRole, User } from "@barber/db";
import type { Role, SessionUser } from "@barber/contracts";

const DB_ROLE_TO_CONTRACT: Record<DbRole, Role> = {
  CLIENT: "client",
  BARBER: "barber",
  BARBERSHOP_ADMIN: "barbershop_admin",
};

const CONTRACT_ROLE_TO_DB: Record<Role, DbRole> = {
  client: "CLIENT",
  barber: "BARBER",
  barbershop_admin: "BARBERSHOP_ADMIN",
};

/** Maps a DB role enum to the lowercase contract role used in sessions. */
export function mapRoleToContract(role: DbRole): Role {
  return DB_ROLE_TO_CONTRACT[role];
}

/** Maps a contract role back to the DB enum (e.g. when creating users). */
export function mapRoleToDb(role: Role): DbRole {
  return CONTRACT_ROLE_TO_DB[role];
}

/**
 * Builds the Auth.js session user from a persisted user row. `name` stays
 * nullable (Google/Credentials may not supply one) and clients have a null
 * tenant until they are invited or onboarded.
 */
export function toSessionUser(
  user: Pick<User, "id" | "email" | "name" | "role" | "barbershopId">,
): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: mapRoleToContract(user.role),
    barbershopId: user.barbershopId,
  };
}
