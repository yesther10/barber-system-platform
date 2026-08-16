# Delta for booking

Adds the public multi-step booking UI (services → barber → date/slot → confirm → login gate → booking → Pix → status). Backend booking, slots, and webhook logic is unchanged.

## ADDED Requirements

### Requirement: Public Booking Flow UI

The public booking page MUST present a step-wise flow (services → barber → date/slot → confirm) driven by the public catalog, barbers, and slots endpoints, using PT-BR copy, and MUST let guests browse all steps before authentication is required. After booking and Pix generation, the flow MUST show a confirmation screen with the QR image and MUST poll the payment status with backoff until `paid` ("Pagamento recebido") or `expired`.

#### Scenario: Guest browses the full flow

- GIVEN a guest on a public booking page for a barbershop with active services
- WHEN the guest selects a service, an assigned barber, and an available slot and confirms
- THEN the flow reaches the login gate without losing the selection

#### Scenario: Empty catalog step

- GIVEN a barbershop with no active services, or a service with no assigned barbers or no slots
- WHEN the guest reaches that step
- THEN the step shows a PT-BR empty state and the flow cannot proceed

#### Scenario: Payment confirmed

- GIVEN a booking created and a Pix payment generated
- WHEN the webhook marks the payment `paid`
- THEN the status screen shows "Pagamento recebido" after polling

### Requirement: Booking Login Gate and Redirect Safety

Before creating a booking, the UI MUST require an authenticated session. A guest MUST be sent to `/login?next=<internal booking path>` where the `next` path preserves the barbershop slug and the selected service/barber/date/slot, sanitized by the internal-path rule; unsafe targets MUST fall back to the safe default path.

#### Scenario: Guest gated at booking

- GIVEN a guest with a completed selection on the confirm step
- WHEN the guest attempts to create the booking
- THEN the guest is redirected to `/login` with a sanitized `next` that preserves the selection
- AND after sign-in the guest returns to the same booking step

#### Scenario: Unsafe next target

- GIVEN a `next` value that is external or malformed
- WHEN the redirect is built
- THEN the safe default booking path is used instead

### Requirement: Slot Selection and Error Mapping

The UI MUST render slot times by converting UTC ISO instants to local HH:MM in the fixed `America/Sao_Paulo` timezone and MUST block past dates client-side before any slot request. Booking API errors MUST be surfaced as PT-BR messages, mapping at least `SLOT_CONFLICT` (409), `PAST_DATE` (400), `SERVICE_INACTIVE`, and `BARBER_INACTIVE`; a `SLOT_CONFLICT` MUST return the guest to the slot step.

#### Scenario: Slot rendered in BR timezone

- GIVEN a slot returned as UTC ISO `2026-08-20T12:00:00.000Z`
- WHEN the slot grid is displayed
- THEN the slot is shown as 09:00 (America/Sao_Paulo, UTC-3)

#### Scenario: Past date blocked

- GIVEN a guest selects a calendar date before today in America/Sao_Paulo
- WHEN the slot step renders
- THEN the date is blocked client-side and no slot request is sent

#### Scenario: Slot conflict surfaced

- GIVEN the booking API rejects with 409 `SLOT_CONFLICT` (slot taken concurrently)
- WHEN the guest attempts to create the booking
- THEN the guest sees a PT-BR conflict message and returns to the slot step