/**
 * LGPD consent policy versioning (user-auth spec).
 *
 * Every consent capture records the policy version the user agreed to. The
 * current version is stamped on auto-provisioned accounts (Google sign-in);
 * registration sends the version the client showed on the signup form.
 */
export const CURRENT_CONSENT_POLICY_VERSION = "2026-08-03";
