# Delta for user-auth

Frontend-only slice: exposes the existing consent-gated `POST /api/auth/register` endpoint through a public registration UI. No schema, contract, or API changes.

## ADDED Requirements

### Requirement: Public Registration UI

The `/register` page MUST offer a public client signup form with name, e-mail, optional phone, password, confirm-password, and LGPD consent fields using PT-BR copy. The form MUST validate that confirm-password equals password before any submission. The consent checkbox MUST be required, MUST display the `CURRENT_CONSENT_POLICY_VERSION`, and MUST link to `/privacidade`.

#### Scenario: Valid registration payload

- GIVEN a guest on `/register` with valid fields, matching passwords, and consent checked
- WHEN the guest submits the form
- THEN client-side validation passes and the registration request is sent

#### Scenario: Password mismatch

- GIVEN a guest on `/register` with differing password and confirm-password values
- WHEN the guest submits the form
- THEN submission is blocked and a PT-BR error appears on the confirm-password field

#### Scenario: Consent unchecked

- GIVEN a guest on `/register` with consent unchecked
- WHEN the guest submits the form
- THEN submission is blocked and a PT-BR error appears on the consent checkbox

### Requirement: Registration Error Mapping

The system MUST surface registration failures as clear PT-BR messages: a 409 response MUST show a duplicate-e-mail message ("e-mail já cadastrado") on the e-mail field, a 400 consent error MUST show a message on the consent checkbox, and any other 400 MUST show field-level messages. No account MUST be created on any error response.

#### Scenario: Duplicate e-mail

- GIVEN a guest submits an e-mail that already has an account
- WHEN the API returns 409
- THEN the form stays on `/register` and shows "e-mail já cadastrado"

#### Scenario: Server rejects consent

- GIVEN a registration request without explicit consent
- WHEN the API returns 400 with a consent error
- THEN the form shows the consent message and no account is created

### Requirement: Post-Registration Sign-In, Redirect Safety, and Entry Point

After a successful registration the system MUST sign the user in automatically via the credentials provider and MUST redirect only to sanitized internal `next` paths, falling back to the safe default for external or malformed targets. Authenticated users MUST NOT remain on `/register`. The `/login` page MUST offer a "Criar conta" link to `/register`.

#### Scenario: Auto sign-in with safe redirect

- GIVEN registration succeeded and `next` is an internal path
- WHEN the client signs in and replaces the route
- THEN the user lands on the sanitized `next` path with an active session

#### Scenario: Unsafe post-register redirect target

- GIVEN registration succeeded and `next` is external or malformed
- WHEN the client attempts to redirect
- THEN the user lands on the safe default path

#### Scenario: Authenticated user reaches register

- GIVEN an authenticated session already exists
- WHEN the user navigates to `/register`
- THEN the system redirects the user away from the registration page

#### Scenario: Guest discovers registration

- GIVEN a guest on `/login`
- WHEN the guest selects the "Criar conta" link
- THEN the guest is taken to `/register`
