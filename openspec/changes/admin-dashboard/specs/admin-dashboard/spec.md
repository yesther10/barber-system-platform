# Admin Dashboard Specification

## Purpose

Tenant-scoped admin frontend for a barbershop: a guarded shell with persistent navigation, a home showing onboarding status and day metrics, and six domain pages (services, barbers, schedules/exceptions, reports, invites, agenda), all with PT-BR copy. The admin backend surface already exists under `/api/admin/*`; this capability adds the UI that consumes it.

## Requirements

### Requirement: Admin Shell Guard and Navigation

The admin shell MUST render only for an authenticated session with role `barbershop_admin` and a tenant (`barbershopId`). The shell MUST provide persistent navigation to every admin page and a sign-out action. A guest MUST be redirected to `/login?next=<internal admin path>`; a session with another role or without a tenant MUST be blocked from admin content.

#### Scenario: Guest redirected to login

- GIVEN no authenticated session
- WHEN the guest opens an admin page
- THEN the guest is redirected to `/login` with an internal `next` path
- AND no admin content renders

#### Scenario: Non-admin blocked

- GIVEN an authenticated session without the `barbershop_admin` role
- WHEN that session opens an admin page
- THEN the page is blocked and no admin content renders

#### Scenario: Navigation and sign-out render

- GIVEN an authorized admin on any admin page
- WHEN the shell renders
- THEN links to all admin pages and a sign-out action are present

### Requirement: Dashboard Home

The dashboard home MUST show the tenant's onboarding status (complete or the list of missing setup areas) and day metrics — today's appointment count, pending confirmation count, and today's revenue — fetched from the admin API.

#### Scenario: Incomplete onboarding

- GIVEN a tenant missing required setup areas
- WHEN the home loads
- THEN the onboarding card lists the missing areas

#### Scenario: Empty day metrics

- GIVEN no appointments today
- WHEN the home loads
- THEN the metrics render zeroed values without error

### Requirement: Admin Services Page

The services page MUST list services including inactive ones, and MUST support create, edit, and deactivate from the admin UI. An empty list MUST render a PT-BR empty state; a delete conflict (409) MUST surface the deactivate guidance.

#### Scenario: Create and list a service

- GIVEN an authorized admin on the services page
- WHEN the admin creates a service with price and duration
- THEN the service appears in the list

#### Scenario: Empty service list

- GIVEN a tenant with no services
- WHEN the services page loads
- THEN a PT-BR empty state renders

### Requirement: Admin Barbers Page

The barbers page MUST list barbers with the linked user's name and email, MUST support creating a profile from an invited user, editing it, and toggling service assignments via the read-only assignment matrix.

#### Scenario: Toggle a service assignment

- GIVEN a barber with a rendered assignment matrix
- WHEN the admin toggles a service assignment
- THEN the assignment persists through the existing assignment endpoints

#### Scenario: Empty barber list

- GIVEN a tenant with no barbers
- WHEN the barbers page loads
- THEN a PT-BR empty state renders

### Requirement: Admin Schedules and Exceptions Pages

The schedules and exceptions pages MUST manage each barber's weekly schedule (day-of-week grid) and one-off exceptions (date, window, optional reason).

#### Scenario: Add a weekly schedule

- GIVEN an authorized admin and a barber
- WHEN the admin saves a weekly window
- THEN the schedule appears for that barber

#### Scenario: Add a day-off exception

- GIVEN a barber with a weekly schedule
- WHEN the admin saves a full-day exception for a date
- THEN the exception is listed and overrides that date

### Requirement: Admin Reports Page

The reports page MUST let an admin pick a date range and grouping (day, barber, or service), view report rows, and download the CSV export.

#### Scenario: Download CSV

- GIVEN a generated report
- WHEN the admin downloads it as CSV
- THEN a CSV file containing the report rows is downloaded

#### Scenario: Empty report period

- GIVEN a period with no appointments
- WHEN the admin views the report
- THEN zeroed rows render without error

### Requirement: Admin Invites Page

The invites page MUST send a barber invite by email; an invalid email MUST surface a PT-BR error and create no invite.

#### Scenario: Invite by email

- GIVEN an authorized admin and a valid email
- WHEN the invite is submitted
- THEN the invite is created and a success message renders

#### Scenario: Invalid email

- GIVEN a malformed email
- WHEN the invite is submitted
- THEN a PT-BR validation error renders and no invite is created

### Requirement: Admin Agenda Page

The agenda page MUST list appointments filtered by status, date, and barber, ordered by start time, and MUST confirm payment for a pending appointment via the existing pay action. Empty results MUST render a PT-BR empty state.

#### Scenario: Filtered agenda

- GIVEN appointments across statuses and barbers
- WHEN the admin filters by status and barber
- THEN only matching appointments render, ordered by start time

#### Scenario: Pay a pending appointment

- GIVEN a pending appointment in the agenda
- WHEN the admin confirms payment
- THEN the pay action succeeds and the appointment leaves the pending set

#### Scenario: Empty agenda result

- GIVEN no appointments matching the filters
- WHEN the agenda loads
- THEN a PT-BR empty state renders

### Requirement: Admin PT-BR Copy

All admin UI copy MUST be PT-BR and MUST resolve from the `admin` section of the shared i18n dictionary.

#### Scenario: Admin strings resolve

- GIVEN any admin page rendering
- WHEN UI copy is displayed
- THEN each string resolves from the `admin` i18n section in PT-BR
