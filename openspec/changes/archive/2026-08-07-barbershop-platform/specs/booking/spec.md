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
