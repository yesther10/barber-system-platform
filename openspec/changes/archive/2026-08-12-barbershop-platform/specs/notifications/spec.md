# Notifications Specification

## Purpose

Transactional email notifications (confirmation, reminder, reschedule, cancellation) in PT-BR, via the transactional-outbox pattern with an in-repo worker scanning the outbox. Durable, idempotent, retryable.

## Requirements

### Requirement: Transactional Outbox

The system MUST write a notification row in the same database transaction as the event that triggers it (booking, status change, reschedule, cancellation).

#### Scenario: Crash after event commit

- GIVEN a booking committed but the email not yet sent
- WHEN the worker next scans the outbox
- THEN the confirmation email is sent from the persisted outbox row

### Requirement: Outbox Worker Delivery

The in-repo worker MUST scan the outbox, send each queued email in PT-BR, and mark it `sent` or `failed`. Failed rows MUST be retried with backoff; emails MUST NOT be dropped after a transient provider error.

#### Scenario: Provider failure and retry

- GIVEN an outbox row whose first send attempt fails
- WHEN the retry scan runs again
- THEN the email is re-sent and eventually marked `sent`

### Requirement: Reminders

The system MUST schedule a reminder at `startsAt − configured lead` (default 24h, per tenant) and MUST send each reminder at most once.

#### Scenario: Reminder sent once

- GIVEN a confirmed appointment due for a reminder and two worker scans before it
- WHEN both scans process the row
- THEN exactly one reminder email is sent

#### Scenario: Reminder after appointment start

- GIVEN an appointment whose start time has passed
- WHEN the worker scans
- THEN no reminder is sent for it

### Requirement: PT-BR Content

All notification emails MUST be in Brazilian Portuguese; code and identifiers MAY remain in English.

#### Scenario: Confirmation email content

- GIVEN a confirmed booking
- WHEN the confirmation email is generated
- THEN its content is in PT-BR and includes service, barber, date, and payment status
