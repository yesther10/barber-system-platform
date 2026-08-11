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
