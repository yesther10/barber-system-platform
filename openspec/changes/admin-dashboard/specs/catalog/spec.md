# Delta for Catalog

## ADDED Requirements

### Requirement: Barber Service Assignment Matrix

The system MUST expose `GET /api/admin/barbers/:id/services` returning the read-only assignment matrix for a tenant's barber: every service of the tenant with whether the barber is assigned to it. This endpoint MUST NOT modify assignments. A barber id that does not exist or belongs to another tenant MUST return 404 with no assignment data leaked.

#### Scenario: Matrix with mixed assignments

- GIVEN a barber assigned to two of three tenant services
- WHEN an admin requests `GET /api/admin/barbers/:id/services`
- THEN the response is 200 with all three services and their assigned flags
- AND no data is modified

#### Scenario: Barber with no assignments

- GIVEN a barber assigned to no services
- WHEN an admin requests the matrix
- THEN the response is 200 with every tenant service marked unassigned

#### Scenario: Unknown or foreign barber

- GIVEN a barber id that does not exist or belongs to another tenant
- WHEN an admin requests the matrix
- THEN the response is 404 and no assignment data leaks

## MODIFIED Requirements

### Requirement: Barber Profiles

A barbershop_admin MUST be able to create and manage barber profiles (linked user, specialties, bio, active flag) scoped to the tenant. The admin barber list MUST return each barber as a `BarberView` including the linked user's name and email so the UI can identify barbers.
(Previously: `BarberView` exposed only the linked `userId`, with no user name or email.)

#### Scenario: Create barber profile

- GIVEN an admin with an invited barber account
- WHEN the admin creates the barber profile with specialties
- THEN the barber appears in the booking flow and service assignment lists

#### Scenario: Admin list includes user identity

- GIVEN a tenant with barbers linked to users
- WHEN an admin requests `GET /api/admin/barbers`
- THEN each `BarberView` includes the linked user's name and email
- AND no other tenant's barbers appear in the response

#### Scenario: Non-admin denied

- GIVEN a session without the `barbershop_admin` role
- WHEN the caller requests the admin barber list
- THEN the system rejects with 403 and returns no barber data
