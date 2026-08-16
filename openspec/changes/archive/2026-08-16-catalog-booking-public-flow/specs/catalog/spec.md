# Delta for catalog

Adds the public barber browse endpoint so the booking flow can offer barbers by service. No changes to services, barber profiles, schedules, or exceptions behavior.

## ADDED Requirements

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