# Delta for payments

Adds a session-gated payment status read for the Pix confirmation screen and the QR image rendering helper. No changes to Pix generation, webhook confirmation, or manual-payment behavior.

## ADDED Requirements

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