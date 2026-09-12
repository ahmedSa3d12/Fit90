# FIT90 Legacy Data Migration Design

## Objective

Prepare the supplied legacy member, membership, and potential-member workbooks for a safe, repeatable import into the FIT90 local/test database. The approved target is `tbl_branches.branch_id = 1` (`Fit90`). Production is explicitly out of scope.

## Source inventory

The import uses the following sources, without executing macros, formulas, external links, or embedded code.

| Source | Sheet | Rows excluding header | Meaning |
| --- | --- | ---: | --- |
| `Members-07-09-2026-01-17-42-PM.xlsx` | `Data` | 2,788 | Members |
| `Fit90_Full_Export_2026-09-07.xlsx` | `Memberships` | 5,114 | Membership/subscription history |
| `Fit90_Full_Export_2026-09-07.xlsx` | `Members Data` | 2,788 | Duplicate copy of `Data`; excluded to prevent duplicate members |
| `Fit90_Full_Export_2026-09-07.xlsx` | `Potential Members` | 17,426 | Leads, not members |

All 5,114 subscription rows reference legacy branch `3`. They will map only to target branch `1`; the tool must reject a different requested branch.

No workbook contains formulas, macros, or external links. A review report must still escape text beginning with `=`, `+`, `-`, or `@` so opening it in Excel cannot evaluate it.

## Target model and mapping

### Members

`Data` rows create `club_members` records.

| Source field | Target field | Rule |
| --- | --- | --- |
| `ID` | Import identity only | Retain in the crosswalk; do not use as the target primary key. |
| `NameAR`, `NameEng` | `name` | Arabic name when nonblank, otherwise English name. Reject if both are blank. |
| `PhoneNo` | `phone` | Normalize Arabic numerals, whitespace, punctuation, and `20…` to the system's `01…` form. Reject blank, invalid Egyptian format, or a duplicate within the complete source set. |
| `Gender` | `gender` | Map only verified source values to `male` or `female`; reject any other value. |
| `Code` | `member_code` | Do not insert it: FIT90 generates unique, branch-scoped codes. Preserve as a legacy identifier in the crosswalk. |
| `BirthDate` | `date_of_birth` | Convert only unambiguous Excel or ISO values to `YYYY-MM-DD`; otherwise omit and report. |
| `Email` | `email` | Trim; reject the member row for an invalid nonblank email. |
| `AthleticAddress` | `address` | Trim and preserve UTF-8. |
| `NationalId` | `card_number` | Normalize only if it matches FIT90's 14-digit or child-ID format. A nonblank invalid ID is reported and omitted, not invented. |
| `JobTitle` | `job_title` | Trim and preserve. |
| `Comment` | `notes` | Trim and preserve. |
| constant | `branch_id` | `1` only. |
| `CreationDate` | provenance only | Retain in reports/crosswalk; do not falsify `created_at`. |

Source names, sales names, nationalities, application numbers, home phone, last-call dates, and legacy usernames have no safe target relation without a verified lookup mapping. They are kept in the clean staging files and flagged as unmapped; they are not silently copied into unrelated foreign keys.

### Subscription types and subscriptions

The migration first resolves a source package to a local `club_subscription_types` record by an exact normalized package name, restricted to branch `1` or a type configured for all branches. A missing or ambiguous package match rejects the subscription; it never creates a guessed package.

| Source field | Target field | Rule |
| --- | --- | --- |
| `id` | Import identity only | Retain in crosswalk. |
| `memberId` | `member_id` | Resolve exclusively through the member crosswalk. |
| `contractNo` | `subscription_number` | Preserve when unique and within 30 characters; otherwise use a deterministic legacy-prefixed number and record the reason. |
| `packageName` | `subscription_type_id`, `subscription_type` | Exact normalized lookup only. |
| `startDateAsString` | `subscription_start_date` | Parse unambiguously to `YYYY-MM-DD`; reject on failure. |
| `expirationDateAsString` | `subscription_end_date` | Parse unambiguously to `YYYY-MM-DD`; reject on failure or if before start. |
| `paymentDateAsString` | `registration_date` / receipt date | Parse unambiguously; if unavailable use the separately parsed `creationDate` only when valid, otherwise reject. |
| `price` | `subscription_value` | Decimal only; missing values are not zero-filled. |
| `discountByAmount`, `discount`, `isDiscountPercentage` | `discount_enabled`, `discount_value` | Import a verified monetary discount only. Percentage discounts are computed only when source price and percentage are both valid. Reject a discount greater than price. |
| `totalAmountPaid` | `paid_amount` and initial receipt | Decimal only; it must not exceed price after discount. A positive verified amount creates exactly one legacy receipt. |
| computed | `remaining_amount` | `net subscription value - verified paid amount`. Must reconcile to source remaining/debt fields when those are present. |
| `statusName` | `status` | Derive from start/end date for active, upcoming, and expired. Preserve `Freezed`, `Postponed`, `Cancelled`, `Transfered`, and `Suspended` only as review notes because FIT90 has no equivalent complete historical status model. |
| constant | `branch_id` | `1` only. |

The source does not include event-level attendance, freeze periods, transfer events, or payment installments. Aggregate values such as `attendanceCount`, `suspendedDays`, `totalFreezedDays`, and payment totals cannot safely become historical event rows. They remain in the review/staging output and are not fabricated as `club_attendance`, `club_subscription_freezes`, `club_subscription_transfers`, or multiple `club_receipts` rows.

The migration writes subscriptions and their optional initial receipt directly through Prisma inside one transaction. It does not call the normal member/subscription services, so it cannot create app users, credentials, points, accounting journal entries, notifications, or automations.

### Potential members

`Potential Members` rows create `club_leads` records.

| Source field | Target field | Rule |
| --- | --- | --- |
| `ID` | Import identity only | Retain in crosswalk. |
| `NameAR`, `NameEng` | `name` | Arabic name when nonblank, otherwise English name; reject if both blank. |
| `PhoneNo` | `phone` | Normalize digits and whitespace. A blank/invalid phone is reported rather than guessed. |
| `Email` | `email` | Trim; report invalid nonblank values. |
| `Gender` | `gender` | Preserve only verified values. |
| `SourceName` | `source_id` | Resolve only by exact normalized match in `club_customer_sources`; unmatched names stay null and are reported. |
| `Comment` | `notes` | Preserve UTF-8 text. |
| `LastCallDate` | `follow_up_at` | Convert only unambiguous values. No reminder rows are created. |
| constant | `branch_id` | `1` only. |
| constant | `status` | `new`; legacy call history does not establish a FIT90 lead status. |

## Import state and idempotency

Two new internal tables are required:

- `data_import_batches`: source hashes, target branch, execution mode, timestamps, summary, and terminal status.
- `data_import_records`: unique `(source_file, sheet_name, source_row_number, target_table)` identity, legacy ID, target ID, result, and safe error code.

The script derives idempotency from the source-row identity and source hash, not names or phones. It skips completed rows on a rerun, records rejected rows consistently, and never overwrites an existing target row. The schema migration will be applied only to Local during this task. Production application of any migration or import remains blocked pending explicit approval.

## Safety gates

The command defaults to `--dry-run` and performs no writes. It requires all of the following for a write:

```text
--confirm-import --environment=local --branch-id=1
```

Before database access, the tool validates that `DATABASE_URL` is configured and points to a loopback host. It refuses all remote, unparseable, or production-labeled URLs. It confirms target branch `1` exists inside the transaction boundary. Logs never contain credentials or raw connection strings.

## Outputs

The run writes a timestamped package under `outputs/data-migration/<batch-id>/`:

- `data-analysis-report.json`
- `mapping.md`
- `members-clean.csv`
- `subscriptions-clean.csv`
- `leads-clean.csv`
- `invalid-records.csv` (formula-safe for Excel)
- `reference-mapping.csv` (formula-safe for Excel)
- `reconciliation.json`
- `migration-batch-log.json`
- `README.md`

Clean import data preserves original values in staging columns. Only review and crosswalk files are formula-escaped for spreadsheet safety.

## Verification

The test suite will cover parsing, Arabic/English digit normalization, formula detection, date ambiguity, required values, duplicate source identity, package matching, no-side-effect writes, idempotent reruns, transaction rollback, and explicit confirmation. The local integration test will execute dry run, confirmed import, rerun, and an induced failure rollback against the local database.

The reconciliation reports source, accepted, skipped, duplicate, rejected, and per-target-table counts. It separately lists unresolved package/source/staff mappings and every excluded event-history field.

## Production runbook

Production is not executed by this design. Before a separately approved production run: take a verified backup, run dry-run with the production file hashes, approve unresolved records, apply the reviewed tracking-table migration, run the confirmed import in a maintenance window, reconcile counts and samples, and retain the batch record for rollback. Rollback uses the batch crosswalk to delete only rows created by that batch in dependency order, after reversing any separately approved financial integrations.
