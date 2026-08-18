# Delta for Catalog

## ADDED Requirements

### Requirement: Public Barbershop Directory

The system MUST expose `GET /api/public/barbershops` without authentication, returning every listable barbershop as a `PublicBarbershopView` containing only `slug` and `name`. A barbershop is listable when it has at least one ACTIVE service. The response MUST NOT include internal identity fields (id, userId, pix configuration) and MUST NOT support pagination, search, or filtering in this version.

#### Scenario: List returns listable barbershops

- GIVEN two barbershops, each with at least one active service
- WHEN a guest requests `GET /api/public/barbershops`
- THEN the response is 200 with both entries as `PublicBarbershopView` (slug and name)
- AND no session is required

#### Scenario: Tenant with no active services is excluded

- GIVEN one barbershop with only deactivated services and another with an active service
- WHEN a guest requests the list
- THEN only the barbershop with the active service is returned

#### Scenario: Empty result set

- GIVEN no barbershop has at least one active service
- WHEN a guest requests the list
- THEN the response is 200 with an empty array

#### Scenario: Public-view discipline

- GIVEN a listable barbershop with internal fields (id, userId, pix configuration)
- WHEN the list is returned
- THEN each entry contains only `slug` and `name`
- AND no internal identity or payment fields are present
