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
