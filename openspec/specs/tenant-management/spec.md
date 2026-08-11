# Tenant Management Specification

## Purpose

Multi-tenant onboarding and isolation: barbershop signup with initial setup (services, barbers, schedules, policies, Pix credentials), strict `barbershop_id` scoping on all data, and per-tenant policy settings.

## Requirements

### Requirement: Tenant Onboarding

The system MUST allow a barbershop owner to sign up and complete a setup flow (services, barbers, schedules, confirmation/cancellation policies, Pix credentials) before the tenant becomes operational.

#### Scenario: Completed onboarding

- GIVEN an owner who has finished the setup flow
- WHEN they enter the admin panel
- THEN the tenant is active and fully usable

#### Scenario: Incomplete setup

- GIVEN an owner who signed up but skipped mandatory setup steps
- WHEN they access the admin panel
- THEN they are guided through the remaining setup and restricted from other areas

### Requirement: Tenant Isolation

Every tenant-scoped entity MUST carry `barbershop_id`, and every query and write MUST be scoped to the caller's tenant. Cross-tenant access MUST fail.

#### Scenario: Scoped listing

- GIVEN tenants A and B with appointments
- WHEN an admin of A lists appointments
- THEN only A's appointments are returned

#### Scenario: Cross-tenant access attempt

- GIVEN an admin of A requesting a resource owned by B
- WHEN the request is executed
- THEN the system returns 404 and no data leaks

### Requirement: Per-Tenant Policies

Each tenant MUST configure confirmation semantics (`auto` or `manual`) and a cancellation policy (window, fees) independently; booking and admin flows MUST apply the tenant's own configuration.

#### Scenario: Auto vs manual confirmation

- GIVEN tenant A configured auto and tenant B configured manual
- WHEN bookings are created in each
- THEN A's appointment confirms immediately and B's stays `pending` for admin confirmation
