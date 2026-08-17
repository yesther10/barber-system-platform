# Booking Specification

## Purpose

Client-facing scheduling: browse services and prices, check barber + slot availability, book/reschedule/cancel with DB-enforced conflict prevention, and track appointment status through its lifecycle. Login is required to book. Booking endpoints are consumer-agnostic (REST + shared Zod contracts) so future native apps can consume them.

## Requirements

### Requirement: Slot Availability Projection

The system MUST compute available slots for a given service, barber, and date as: weekly schedule − exceptions − existing appointments, at the tenant's configured granularity (15 or 30 minutes). Slots MUST be returned only when the full service duration fits before the barber's shift ends.

#### Scenario: Full day grid

- GIVEN a barber with a 09:00–17:00 schedule, a 30-minute service, and no appointments
- WHEN a client requests the slot grid for that date
- THEN the system returns every 30-minute slot from 09:00 to 16:30

#### Scenario: Past date requested

- GIVEN a date earlier than today in the tenant's timezone
- WHEN a client requests the slot grid
- THEN the system returns an error and no slots

### Requirement: Booking Creation

The system MUST require an authenticated client to create an appointment, MUST snapshot the service price at booking time, and MUST write the appointment and its confirmation outbox row in the same transaction.

#### Scenario: Authenticated booking

- GIVEN an authenticated client, an active service, and a free slot
- WHEN the client submits the booking
- THEN an appointment with status `pending` is created
- AND the price snapshot and outbox confirmation row are persisted atomically

#### Scenario: Unauthenticated booking attempt

- GIVEN no authenticated session
- WHEN a client submits a booking
- THEN the system rejects with 401 and creates no appointment

### Requirement: Booking-to-Login Handoff

When a booking action requires authentication, the client flow MUST send guests to `/login?next=<protected-target>` using only internal application paths. After successful sign-in, the user MUST return to the requested protected booking path or a safe default if the target is invalid.

#### Scenario: Guest starts a protected booking action

- GIVEN a guest tries to continue into a protected booking step
- WHEN the application detects authentication is required
- THEN the guest is sent to `/login` with an internal booking `next` path

#### Scenario: Invalid booking redirect target

- GIVEN a booking flow produces a non-internal redirect target
- WHEN the guest is handed off to login
- THEN the system uses a safe default path instead of that target

### Requirement: Slot Conflict Prevention

The system MUST prevent overlapping appointments for the same barber. Slot validation MUST happen inside the booking transaction under a lock that serializes concurrent bookings for the same barber (application-level locking). Conflicting bookings MUST be rejected.

#### Scenario: Concurrent double-booking

- GIVEN two clients requesting the same free slot simultaneously
- WHEN both bookings are committed in parallel
- THEN exactly one succeeds and the other is rejected with a conflict error

### Requirement: Status Lifecycle

Appointment status MUST follow `pending → confirmed → completed` and `pending|confirmed → cancelled`, plus reschedule transitions. Any other transition MUST be rejected by a domain rule.

#### Scenario: Valid confirmation

- GIVEN an appointment in `pending` status
- WHEN the tenant policy (or the Pix webhook) confirms it
- THEN status becomes `confirmed`

#### Scenario: Invalid transition

- GIVEN a `completed` appointment
- WHEN someone attempts to cancel it
- THEN the system rejects the transition

### Requirement: Reschedule and Cancellation

Reschedule MUST free the old slot and take the new one in a single transaction and MUST respect the tenant's cancellation window. Cancellation MUST free the slot and MUST enqueue the corresponding notification via the outbox.

#### Scenario: Reschedule within window

- GIVEN a confirmed appointment and a free target slot
- WHEN the client reschedules within the allowed window
- THEN the appointment moves atomically and the new slot is taken

#### Scenario: Late cancellation

- GIVEN a 24-hour cancellation window and an appointment starting in 2 hours
- WHEN the client attempts to cancel
- THEN the system rejects the cancellation per the tenant policy

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
