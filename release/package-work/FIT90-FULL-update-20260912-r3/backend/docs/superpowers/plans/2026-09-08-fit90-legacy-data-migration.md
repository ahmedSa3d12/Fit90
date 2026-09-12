# FIT90 Legacy Data Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dry-run-first, local-only importer for legacy members, subscriptions, receipts, and potential members into FIT90 branch 1.

**Architecture:** A pure migration library stages and validates workbook rows. A guarded CLI uses direct Prisma transactions and import crosswalk tables to write only approved records, with no application-service side effects.

**Tech Stack:** TypeScript, Prisma/MySQL, ExcelJS, Jest, Node.js.

**Spec:** `docs/superpowers/specs/2026-09-08-fit90-legacy-data-migration-design.md`

## Global Constraints

- Map legacy branch 3 only to `tbl_branches.branch_id=1`.
- A write requires `--confirm-import --environment=local --branch-id=1`. Dry run is the default.
- Reject absent, remote, malformed, or production-labeled database URLs before creating Prisma.
- Never log credentials, connection URLs, or raw personal data.
- Do not call existing member/subscription/receipt/automation services.
- Never manufacture attendance, freeze, transfer, installment-payment, account, notification, or staff-link events.
- Test first and observe every new test fail before writing its implementation.

---

### Task 1: Import tracking schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260908100000_legacy_data_import_tracking/migration.sql`

**Interfaces:**
- Produces `data_import_batches` and `data_import_records` Prisma delegates.
- A record is unique on `(source_file, sheet_name, source_row_number, target_table)`.

- [ ] **Step 1: Prove the schema is missing the new models**

Run: `npx prisma validate`

Expected: the current schema has no import models.

- [ ] **Step 2: Add the models and SQL**

Create `data_import_batches` with unique batch hash, target branch, environment, dry-run flag, `running|completed|failed` status, JSON summary, safe failure code, and timestamps. Create `data_import_records` with source coordinates, legacy ID, target table/ID, `accepted|skipped|rejected` result, safe error code, and relation to the batch. Add the unique source coordinate key and indexes on batch and target table.

- [ ] **Step 3: Validate and generate Prisma**

Run:
```powershell
npx prisma validate
npx prisma generate
```

Expected: both commands exit 0.

- [ ] **Step 4: Commit only migration-owned files**

```powershell
git add prisma/schema.prisma prisma/migrations/20260908100000_legacy_data_import_tracking/migration.sql
git commit -m "feat: add legacy migration tracking"
```

### Task 2: Pure safety and normalization functions

**Files:**
- Create: `src/migrations/legacy/legacy-import.types.ts`
- Create: `src/migrations/legacy/legacy-import.utils.ts`
- Create: `src/migrations/legacy/legacy-import.utils.spec.ts`

**Interfaces:**
- Produces `assertLocalDatabaseUrl`, `normalizeLegacyText`, `normalizeEgyptPhone`, `parseLegacyDate`, and `escapeSpreadsheetFormula`.
- Consumed by all remaining tasks.

- [ ] **Step 1: Write failing behavior tests**

```ts
it('rejects a remote database URL before database access', () => {
  expect(() => assertLocalDatabaseUrl('mysql://u:p@144.76.74.208:3306/fit90')).toThrow('local');
});
it('normalizes Arabic digits and country prefix', () => {
  expect(normalizeEgyptPhone('٢٠١٠ ١٢٣٤ ٥٦٧٨')).toBe('01012345678');
});
it('escapes a formula-looking review field', () => {
  expect(escapeSpreadsheetFormula('=SUM(1,1)')).toBe("'=SUM(1,1)");
});
```

- [ ] **Step 2: Run the test to observe the missing-export failure**

Run: `npm test -- legacy-import.utils.spec.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the smallest safe functions**

Use `new URL()`; permit only loopback hosts and reject names containing `prod` or `production`, without echoing URLs. Normalize Arabic/Persian digits. Normalize only valid Egyptian mobile numbers. Parse only Excel Date/serial and ISO `YYYY-MM-DD` values. Return null for ambiguous dates. Escape only review/crosswalk fields starting `=`, `+`, `-`, or `@`.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- legacy-import.utils.spec.ts`

Expected: PASS.

```powershell
git add src/migrations/legacy/legacy-import.types.ts src/migrations/legacy/legacy-import.utils.ts src/migrations/legacy/legacy-import.utils.spec.ts
git commit -m "feat: add safe legacy import utilities"
```

### Task 3: Workbook staging and validation

**Files:**
- Create: `src/migrations/legacy/legacy-workbook.reader.ts`
- Create: `src/migrations/legacy/legacy-workbook.reader.spec.ts`

**Interfaces:**
- Produces `analyzeLegacyWorkbooks(sources): Promise<LegacyAnalysis>`.
- `LegacyAnalysis` contains inventory, SHA-256 hashes, members, subscriptions, leads, and source-coordinate issues.

- [ ] **Step 1: Write failing fixture tests**

```ts
it('reads all sheets but excludes the duplicated Members Data member set', async () => {
  const result = await analyzeLegacyWorkbooks(fixtureSources);
  expect(result.inventory.map((x) => x.sheet)).toEqual(expect.arrayContaining([
    'Data', 'Memberships', 'Members Data', 'Potential Members',
  ]));
  expect(result.members).toHaveLength(1);
});
it('sends Potential Members to club_leads staging', async () => {
  const result = await analyzeLegacyWorkbooks(fixtureSources);
  expect(result.leads[0]).toMatchObject({ targetTable: 'club_leads', branchId: 1 });
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- legacy-workbook.reader.spec.ts`

Expected: FAIL because the reader does not exist.

- [ ] **Step 3: Implement staging without formula execution**

Use ExcelJS to inspect every sheet and cell. Treat formula cells as `FORMULA_CELL` issues. Map `Data` to member rows once, `Memberships` to subscription rows, and `Potential Members` to leads. Retain original values and row coordinates. Build duplicate checks across the entire source set. Reject invalid member name/phone/gender/email and subscriptions with missing members, invalid dates, values, or dates out of order. Resolve no packages or foreign keys here.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- legacy-workbook.reader.spec.ts`

Expected: PASS.

```powershell
git add src/migrations/legacy/legacy-workbook.reader.ts src/migrations/legacy/legacy-workbook.reader.spec.ts
git commit -m "feat: stage legacy workbooks safely"
```

### Task 4: Clean import files and review reports

**Files:**
- Create: `src/migrations/legacy/legacy-import.reports.ts`
- Create: `src/migrations/legacy/legacy-import.reports.spec.ts`

**Interfaces:**
- Produces `writeImportPackage(analysis, outputDir)`.
- Outputs analysis, mapping, member/subscription/lead clean CSVs, invalid rows, crosswalk, reconciliation, log, and README.

- [ ] **Step 1: Write a failing report test**

```ts
it('writes required package files and formula-escapes invalid record text', async () => {
  const paths = await writeImportPackage(analysisWithFormulaIssue, tmpDir);
  await expect(fs.readFile(paths.invalidRecordsCsv, 'utf8')).resolves.toContain("'=SUM(1,1)");
  await expect(fs.access(paths.leadsCleanCsv)).resolves.toBeUndefined();
  await expect(fs.access(paths.reconciliationJson)).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- legacy-import.reports.spec.ts`

Expected: FAIL because the writer does not exist.

- [ ] **Step 3: Implement deterministic reports**

Write UTF-8-with-BOM CSVs and JSON/Markdown artifacts below `outputs/data-migration/<batch-id>/`. Preserve source fields in clean staging data. Escape only invalid-record and crosswalk cell strings. Never include secrets or absolute machine paths. Count accepted, rejected, and skipped rows by target table and error code.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- legacy-import.reports.spec.ts`

Expected: PASS.

```powershell
git add src/migrations/legacy/legacy-import.reports.ts src/migrations/legacy/legacy-import.reports.spec.ts
git commit -m "feat: write legacy import package reports"
```

### Task 5: Idempotent Prisma writer

**Files:**
- Create: `src/migrations/legacy/legacy-import.runner.ts`
- Create: `src/migrations/legacy/legacy-import.runner.spec.ts`

**Interfaces:**
- Produces `runLegacyImport(options): Promise<MigrationRunResult>`.
- Writes only `club_members`, `club_leads`, `club_subscriptions`, `club_receipts`, and tracking tables.

- [ ] **Step 1: Write failing runner tests**

```ts
it('writes no business record in dry run', async () => {
  const result = await runLegacyImport({ ...options, dryRun: true, prisma });
  expect(result.written).toBe(0);
  expect(prisma.club_members.create).not.toHaveBeenCalled();
});
it('skips an already completed source record', async () => {
  const result = await runLegacyImport({ ...options, prisma: completedRowPrisma });
  expect(result.skipped).toBe(1);
  expect(completedRowPrisma.club_members.create).not.toHaveBeenCalled();
});
it('rolls back a batch when a dependent write fails', async () => {
  await expect(runLegacyImport({ ...options, prisma: failingPrisma })).rejects.toThrow('IMPORT_WRITE_FAILED');
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- legacy-import.runner.spec.ts`

Expected: FAIL because the runner does not exist.

- [ ] **Step 3: Implement transactional dependency order**

Confirm branch 1 exists. Resolve subscription types only by exact normalized name for branch 1 or all branches, and sources only by exact normalized name. In bounded transactions: create members and crosswalk rows, create leads and crosswalk rows, then linked subscriptions and one positive verified initial receipt. Preserve original contract numbers only when unique and <=30 chars; otherwise create a deterministic legacy-prefixed identifier and log the reason. Do not upsert or modify any existing business record.

- [ ] **Step 4: Add and run no-side-effects regression**

```ts
it('never creates app users, points, journals, or notifications', async () => {
  const result = await runLegacyImport(options);
  expect(result.createdTables).not.toEqual(expect.arrayContaining([
    'api_users', 'club_notifications', 'club_member_points_transactions', 'journal_entries',
  ]));
});
```

Run: `npm test -- legacy-import.runner.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/migrations/legacy/legacy-import.runner.ts src/migrations/legacy/legacy-import.runner.spec.ts
git commit -m "feat: import legacy gym data safely"
```

### Task 6: Guarded CLI and local runbook

**Files:**
- Create: `scripts/import-legacy-fit90.ts`
- Create: `scripts/import-legacy-fit90.spec.ts`
- Modify: `package.json`
- Create: `docs/data-migration/legacy-fit90-import.md`

**Interfaces:**
- Produces `npm run migration:legacy-fit90 -- [flags]`.

- [ ] **Step 1: Write failing CLI guard tests**

```ts
it('refuses writes without the complete confirmation tuple', async () => {
  await expect(runCli(['--environment=local', '--branch-id=1'], env)).rejects.toThrow('confirm-import');
});
it('refuses a remote URL before constructing Prisma', async () => {
  await expect(runCli(['--dry-run', '--environment=local', '--branch-id=1'], remoteEnv)).rejects.toThrow('local');
  expect(remoteEnv.prismaFactory).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- import-legacy-fit90.spec.ts`

Expected: FAIL because the CLI module is absent.

- [ ] **Step 3: Implement flags and runbook**

Default to dry run. Validate URL, environment, confirmation flags, and branch ID before Prisma creation. Generate packages under `outputs/data-migration/<batch-id>/`. Add a package script. Document local dry run, confirmed import, rerun, rollback-test expectations, artifacts, and a production runbook that has no production command.

- [ ] **Step 4: Verify and commit**

Run:
```powershell
npm test -- --runInBand
npm run build
```

Expected: both commands exit 0.

```powershell
git add scripts/import-legacy-fit90.ts scripts/import-legacy-fit90.spec.ts package.json docs/data-migration/legacy-fit90-import.md
git commit -m "feat: add guarded legacy import command"
```

### Task 7: Local-only migration verification

**Files:**
- Create: `outputs/data-migration/<batch-id>/` generated package; do not commit it.
- Modify: `docs/data-migration/legacy-fit90-import.md` only for a factual observed behavior.

- [ ] **Step 1: Run dry run first**

Run:
```powershell
npm run migration:legacy-fit90 -- --dry-run --environment=local --branch-id=1
```

Expected: it only proceeds when `DATABASE_URL` resolves to loopback; otherwise it fails before database access.

- [ ] **Step 2: Apply the tracking migration after that safety check**

Run: `npx prisma migrate deploy`

Expected: only the verified local database receives the tracking tables.

- [ ] **Step 3: Run confirmed import and identical rerun**

```powershell
npm run migration:legacy-fit90 -- --confirm-import --environment=local --branch-id=1
npm run migration:legacy-fit90 -- --confirm-import --environment=local --branch-id=1
```

Expected: the second run creates zero duplicate business rows and marks prior rows skipped.

- [ ] **Step 4: Reconcile and inspect prohibited side effects**

Compare batch counts against `reconciliation.json`. Confirm the four approved target tables are the only business tables written. Confirm no app users, notifications, points, or accounting journals were created by the batch. Inspect formula escaping in the invalid-record CSV.

- [ ] **Step 5: Run final verification**

Run:
```powershell
npm test -- --runInBand
npm run build
```

Expected: both commands exit 0.

