# Delta for Booking

## ADDED Requirements

### Requirement: Admin Appointment Listing

The system MUST expose `GET /api/admin/appointments` returning tenant-scoped appointments with optional `status`, `date`, and `barberId` filters, in ascending start-time order. A missing or invalid filter value MUST return 400 with error code `INVALID_INPUT`. Only appointments of the caller's tenant MUST be returned.

#### Scenario: Agenda lists a day's appointments

- GIVEN a tenant with appointments across several dates
- WHEN an admin requests the list with `date=<today>`
- THEN the response is 200 with only that day's appointments

#### Scenario: Status and barber filters combined

- GIVEN appointments with mixed statuses and barbers
- WHEN an admin requests the list with `status=confirmed&barberId=<id>`
- THEN only that barber's confirmed appointments are returned

#### Scenario: Empty result set

- GIVEN no appointments matching the filters
- WHEN an admin requests the list
- THEN the response is 200 with an empty array

#### Scenario: Invalid filter value

- GIVEN a request with an invalid date, an unknown status, or a malformed barberId
- WHEN an admin requests the list
- THEN the response is 400 with error code `INVALID_INPUT`

#### Scenario: Tenant isolation

- GIVEN appointments belonging to other tenants
- WHEN an admin requests the list
- THEN only the caller's tenant appointments are returned
- AND no foreign appointment data leaks

## MODIFIED Requirements

### Requirement: Status Lifecycle

Appointment status MUST follow `pending → confirmed → completed` and `pending|confirmed → cancelled`, plus reschedule transitions. Any other transition MUST be rejected by a domain rule. A barbershop_admin MUST be able to confirm payment for a pending appointment via `POST /api/admin/appointments/:id/pay`, transitioning it to `confirmed` with payment status `paid`; paying a non-pending appointment MUST be rejected with 409 and an unknown appointment id with 404.
(Previously: status transitions were driven only by tenant policy and the Pix webhook; the admin pay action was not part of the specified lifecycle.)

#### Scenario: Valid confirmation

- GIVEN an appointment in `pending` status
- WHEN the tenant policy (or the Pix webhook) confirms it
- THEN status becomes `confirmed`

#### Scenario: Invalid transition

- GIVEN a `completed` appointment
- WHEN someone attempts to cancel it
- THEN the system rejects the transition

#### Scenario: Admin pays a pending appointment

- GIVEN a pending appointment listed in the agenda
- WHEN the admin confirms payment via `POST /api/admin/appointments/:id/pay`
- THEN status becomes `confirmed` and payment status becomes `paid`

#### Scenario: Pay on a non-pending appointment

- GIVEN an appointment already `confirmed` or `completed`
- WHEN the admin confirms payment
- THEN the system rejects with 409 and the appointment is unchanged

#### Scenario: Pay on an unknown appointment

- GIVEN an appointment id that does not exist
- WHEN the admin confirms payment
- THEN the system rejects with 404
