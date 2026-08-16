# Payments Specification

## Purpose

Pix payments for appointments via a provider-agnostic module (provider choice — Mercado Pago vs PagSeguro — is a design decision). Payment generation on booking, idempotent webhook confirmation, payment status on appointments, and a manual in-shop fallback.

## Requirements

### Requirement: Pix Payment Generation

On booking, the system MUST generate a Pix payment with an expiration time and return the QR payload for display. Generation failure MUST NOT lose the appointment; payment MUST be retryable.

#### Scenario: Payment generated on booking

- GIVEN a booking created under a tenant with Pix credentials configured
- WHEN the client proceeds to payment
- THEN a Pix payment with status `pending` and QR payload is created and returned

#### Scenario: Provider unavailable at generation

- GIVEN the payment provider returns an error
- WHEN payment generation is attempted
- THEN the appointment persists and payment can be retried or taken manually in-shop

### Requirement: Idempotent Webhook Confirmation

The system MUST authenticate provider webhooks and MUST process each payment event exactly once. On the first `paid` event, payment status MUST become `paid` and the appointment MUST be confirmed per tenant policy.

#### Scenario: First paid event

- GIVEN a pending Pix payment
- WHEN a valid `paid` webhook arrives
- THEN the payment is marked `paid`
- AND the appointment transitions to `confirmed` under auto policy

#### Scenario: Duplicate webhook delivery

- GIVEN an already-processed `paid` webhook
- WHEN the provider retries the same payload
- THEN the system acknowledges it without changing any state

#### Scenario: Invalid webhook signature

- GIVEN a webhook with an invalid signature
- WHEN it is delivered
- THEN the system rejects it with 401 and ignores it

### Requirement: Payment Status on Appointments

Every appointment MUST expose a payment status (`pending | paid | expired | refunded`). A barbershop_admin MUST be able to mark a payment paid manually (in-shop Pix) and MUST be able to record a refund.

#### Scenario: Manual in-shop payment

- GIVEN a pending appointment (walk-in or unpaid booking)
- WHEN the admin records the in-shop payment
- THEN the payment status becomes `paid`

### Requirement: Payment Status Read

The system MUST expose `GET /api/payments/{id}` to an authenticated client, returning a `PaymentStatusView` carrying the payment status (`pending | paid | expired | refunded`) and the appointment status of the caller's appointment. The `{id}` MUST resolve the appointment by matching `providerPaymentId` first, then `appointmentId` (including the `pix_`-prefixed payment id form). An id that matches no appointment, or an appointment that does not belong to the caller, MUST return 404 `PAYMENT_APPOINTMENT_NOT_FOUND`.

#### Scenario: Status via provider payment id

- GIVEN an authenticated client whose appointment has `providerPaymentId = provider_abc` and a paid webhook processed
- WHEN the client requests `GET /api/payments/provider_abc`
- THEN the response is 200 with payment status `paid` and the appointment status

#### Scenario: Status via pix payment id

- GIVEN a Pix payment returned `id = pix_abc` for the caller's appointment
- WHEN the client requests `GET /api/payments/pix_abc`
- THEN the response resolves the appointment and returns its current payment status

#### Scenario: Unknown or foreign payment id

- GIVEN an id matching no appointment, or an appointment of another client
- WHEN any client requests `GET /api/payments/{id}`
- THEN the response is 404 with error code `PAYMENT_APPOINTMENT_NOT_FOUND`
- AND no ownership information leaks

#### Scenario: Unauthenticated read

- GIVEN no active session
- WHEN a guest requests `GET /api/payments/{id}`
- THEN the response is 401 with error code `SESSION_REQUIRED`

### Requirement: Pix QR Rendering

The system MUST render the Pix EMV payload (`qrCode`) as a QR image for display and MUST offer a fallback that copies the payload string to the clipboard. Rendering MUST be independent of the payment status endpoint.

#### Scenario: EMV payload rendered

- GIVEN a payment with a non-empty `qrCode` EMV string
- WHEN the confirmation screen renders the payment
- THEN a QR image is displayed from the payload
- AND the copy action places the payload on the clipboard

#### Scenario: QR unavailable

- GIVEN a payment with a null or empty `qrCode`
- WHEN the confirmation screen renders the payment
- THEN the screen shows the copy fallback and no broken image
