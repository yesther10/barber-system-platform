# User Auth Specification

## Purpose

Authentication and authorization for all actors: clients, barbershop admins, and barbers. Dual sign-in (email/password + Google OAuth via Auth.js v5), server-enforced roles, barber invitations, and LGPD consent capture at signup.

## Requirements

### Requirement: Dual Authentication

The system MUST support sign-in with email/password and with Google OAuth. New Google users MUST be provisioned automatically with the `client` role. The `/login` page MUST always offer email/password sign-in and MUST show Google sign-in only when Google auth is available for the running environment.

#### Scenario: Email/password sign-in

- GIVEN a registered user with valid credentials
- WHEN the user signs in with email/password
- THEN a session is created and the user is redirected per role

#### Scenario: Google OAuth new user

- GIVEN a Google account not yet registered
- WHEN the user signs in with Google
- THEN an account with role `client` is created and the session starts

#### Scenario: Google sign-in unavailable

- GIVEN Google auth is not configured for the running environment
- WHEN a guest opens `/login`
- THEN the page shows email/password sign-in without a Google sign-in action

### Requirement: Role Enforcement

The system MUST define roles `client`, `barber`, and `barbershop_admin`, MUST scope each role to exactly one tenant, and MUST enforce role-based access server-side on every protected operation.

#### Scenario: Admin-only operation

- GIVEN an authenticated user with role `client`
- WHEN the user calls an admin-only endpoint
- THEN the system returns 403 and performs no operation

### Requirement: Login Required to Book

The booking creation endpoint MUST reject unauthenticated requests.

#### Scenario: Unauthenticated booking

- GIVEN no active session
- WHEN a booking request is submitted
- THEN the system returns 401

### Requirement: Login Page Feedback and Redirect Safety

The `/login` page MUST validate required credentials, MUST surface authentication failures clearly, MUST prevent authenticated users from staying on the guest login flow, and MUST honor post-login redirects only for internal `next` paths. External URLs, absolute URLs, or malformed redirect targets MUST be ignored in favor of a safe default destination.

#### Scenario: Invalid credentials on login

- GIVEN a guest on `/login`
- WHEN the guest submits invalid email/password credentials
- THEN the page stays on `/login` and shows a clear authentication error

#### Scenario: Unsafe redirect target

- GIVEN a guest opens `/login?next=https://evil.example`
- WHEN the guest signs in successfully
- THEN the system ignores that `next` value and redirects to the safe default page

#### Scenario: Authenticated user reaches login

- GIVEN an authenticated session already exists
- WHEN the user navigates to `/login`
- THEN the system redirects the user away from the guest login page

### Requirement: Barber Invitations

A barbershop_admin MUST be able to invite a barber by email; the invitation MUST create a `barber` account scoped to that tenant and MUST be single-use.

#### Scenario: Invite accepted once

- GIVEN a valid invite token
- WHEN the invited email registers and consumes the token
- THEN a `barber` account is created scoped to the tenant and the token is invalidated

#### Scenario: Reused invite token

- GIVEN an already-consumed token
- WHEN it is presented again
- THEN the system rejects it

### Requirement: Consent Capture at Signup

The system MUST capture explicit LGPD consent (timestamp and policy version) during registration and MUST refuse registration until consent is given.

#### Scenario: Registration without consent

- GIVEN a signup form with consent unchecked
- WHEN the user submits
- THEN registration is blocked and no account is created
