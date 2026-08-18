# Delta for Booking

## ADDED Requirements

### Requirement: Directory Entry Step

When a guest lands on `/booking` without a `slug`, the public booking flow MUST present a PT-BR barbershop picker as the first step, listing listable barbershops from the public directory endpoint, BEFORE any catalog step. Selecting a barbershop MUST set the slug and proceed to the existing services step. When a `slug` is present in the URL, the flow MUST remain unchanged and MUST NOT show the picker. The safe-default `/booking` target used after login handoff MUST land on a navigable picker state, never a dead end.

#### Scenario: Guest lands on /booking without a slug

- GIVEN a guest opens `/booking` with no slug and listable barbershops exist
- WHEN the flow loads
- THEN the first step is the picker listing listable barbershops
- AND no services step renders before a barbershop is selected

#### Scenario: Guest selects a barbershop

- GIVEN the picker step showing listable barbershops
- WHEN the guest selects one
- THEN the slug is set for the selection
- AND the flow proceeds to the existing services step

#### Scenario: Guest lands with a slug

- GIVEN a guest opens `/booking?slug=<valid>`
- WHEN the flow loads
- THEN the picker step is skipped
- AND the flow starts at the services step as before

#### Scenario: Login handoff safe-default lands on the picker

- GIVEN a guest is sent to `/login` whose `next` falls back to the safe default `/booking` (no slug)
- WHEN the guest returns after sign-in
- THEN the picker step is shown and navigable
- AND the guest can select a barbershop and continue the flow
