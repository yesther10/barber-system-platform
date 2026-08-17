# Reporting Specification

## Purpose

Tenant-scoped operational reports: appointment volumes, performance, and revenue over a period, filterable by barber and service, with CSV export.

## Requirements

### Requirement: Appointment Reports

The system MUST produce tenant-scoped reports for a date period counting appointments by status, grouped by barber and/or service, including completion and cancellation rates.

#### Scenario: Period report

- GIVEN a tenant with appointments across two weeks
- WHEN the admin requests a report for week one
- THEN counts and rates reflect only week-one appointments for that tenant

#### Scenario: Empty period

- GIVEN a period with no appointments
- WHEN a report is requested
- THEN the system returns zeroed counts and does not error

### Requirement: Revenue Reporting

The system MUST report revenue from `paid` appointments within the period, per barber and service, using the price snapshot at booking.

#### Scenario: Revenue totals

- GIVEN paid appointments at booked price snapshots
- WHEN the admin requests revenue for the period
- THEN totals match the sum of snapshots for paid appointments in that period

### Requirement: CSV Export

The system MUST export report data as CSV, UTF-8 encoded with a BOM for spreadsheet compatibility.

#### Scenario: CSV download

- GIVEN a generated report
- WHEN the admin downloads it as CSV
- THEN a valid CSV file is returned containing the report rows
