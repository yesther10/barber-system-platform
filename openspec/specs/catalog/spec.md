# Catalog Specification

## Purpose

Tenant-scoped management of services, barbers, and availability: service catalog with prices and durations, barber profiles with specialties, weekly recurring schedules, and one-off exceptions that drive the booking slot grid.

## Requirements

### Requirement: Service Catalog Management

A barbershop_admin MUST be able to create, update, deactivate, and delete tenant-scoped services (name, description, price in BRL, duration). Deactivated services MUST NOT be bookable but MUST NOT alter existing appointments.

#### Scenario: Deactivate a service

- GIVEN an active service with future bookings
- WHEN the admin deactivates it
- THEN the service disappears from public booking
- AND existing appointments remain unchanged

### Requirement: Barber Profiles

A barbershop_admin MUST be able to create and manage barber profiles (linked user, specialties, bio, active flag) scoped to the tenant.

#### Scenario: Create barber profile

- GIVEN an admin with an invited barber account
- WHEN the admin creates the barber profile with specialties
- THEN the barber appears in the booking flow and service assignment lists

### Requirement: Weekly Availability Schedules

Each active barber MUST have a weekly recurring schedule (day of week, start, end). The system MUST NOT offer slots outside the schedule.

#### Scenario: Slot grid respects schedule

- GIVEN a barber scheduled 09:00–12:00 on Tuesdays
- WHEN a client requests Tuesday slots
- THEN no slot is offered after 12:00 minus the service duration

### Requirement: Availability Exceptions

The system MUST support one-off exceptions (holiday, day off) that override the weekly schedule for a given date.

#### Scenario: Day off exception

- GIVEN an exception covering a full Tuesday
- WHEN a client requests slots for that Tuesday
- THEN the system returns no slots

### Requirement: Public Barber Browse by Service

The system MUST expose `GET /api/public/barbershops/{slug}/barbers?serviceId={serviceId}` without authentication, returning only ACTIVE barbers of the tenant who have a `BarberService` assignment for the requested service, each as a `PublicBarberView` (public barber fields: id, specialties, bio, active). An unknown slug MUST return 404 `TENANT_NOT_FOUND`; a deactivated or unknown service MUST return 404 `SERVICE_NOT_FOUND`; a missing or invalid `serviceId` MUST return 400 `INVALID_INPUT`.

#### Scenario: Service-assigned barbers listed publicly

- GIVEN a public slug, an active service, and two active barbers — one assigned to the service, one not
- WHEN a guest requests `GET .../barbers?serviceId=<service>`
- THEN the response is 200 with only the assigned active barber as `PublicBarberView`
- AND no session is required

#### Scenario: Unknown tenant slug

- GIVEN a slug with no matching barbershop
- WHEN a guest requests the barbers endpoint
- THEN the response is 404 with error code `TENANT_NOT_FOUND`

#### Scenario: Inactive or unknown service

- GIVEN a barbershop whose requested service is deactivated or does not exist
- WHEN a guest requests barbers for that service
- THEN the response is 404 with error code `SERVICE_NOT_FOUND`
- AND no barber data is leaked

#### Scenario: Invalid serviceId

- GIVEN a request without `serviceId` or with an empty value
- WHEN a guest requests the barbers endpoint
- THEN the response is 400 with error code `INVALID_INPUT`
