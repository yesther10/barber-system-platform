# LGPD Compliance Specification

## Purpose

Brazilian data-protection compliance: explicit consent capture, privacy policy, PII handling with regional residency, and client data export/deletion rights.

## Requirements

### Requirement: Consent Capture

The system MUST record explicit consent with a timestamp and the accepted policy version, MUST store it with the user, and MUST honor a later withdrawal by ceasing non-essential processing.

#### Scenario: Consent stored at signup

- GIVEN a user who accepted the privacy policy during registration
- WHEN the account is inspected
- THEN a consent record with timestamp and policy version exists

#### Scenario: Consent withdrawal

- GIVEN a user who withdraws consent
- WHEN the system would run non-essential processing (e.g., marketing)
- THEN no such processing occurs for that user

### Requirement: Privacy Policy

The system MUST present the privacy policy in PT-BR at signup and before any consent capture.

#### Scenario: Policy shown before consent

- GIVEN a registration form
- WHEN the user reaches the consent step
- THEN the current privacy policy is displayed with the consent control

### Requirement: PII Handling

The system MUST store personal data in a Brazil (São Paulo) region and MUST collect only the minimum PII required for the service.

### Requirement: Data Export

A client MUST be able to request an export of their personal data, and the system MUST deliver it in a structured, portable format within a defined period.

#### Scenario: Export request

- GIVEN an authenticated client
- WHEN they request their data export
- THEN a structured export of their PII and appointment history is delivered

### Requirement: Data Deletion

A client MUST be able to request deletion of their personal data. The system MUST delete or anonymize PII, except where retention is legally required, and MUST resolve outstanding appointments before deleting.

#### Scenario: Deletion with open appointments

- GIVEN a client with a future appointment who requests deletion
- WHEN the deletion is processed
- THEN the appointment is cancelled first and the client's PII is anonymized or deleted

#### Scenario: Deletion of an empty account

- GIVEN a deletion request for an account with no associated data
- WHEN it is processed
- THEN the system confirms deletion without error
