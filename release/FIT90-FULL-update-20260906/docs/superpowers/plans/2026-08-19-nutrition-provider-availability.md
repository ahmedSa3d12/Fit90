# Nutrition Provider Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace service-bound nutrition schedules with provider attendance windows and variable-duration bookings that use subscription credit or pay at the branch.

**Architecture:** Add nutrition-only provider availability tables and a shared scheduling domain used by the admin UI and Mobile API. Keep the legacy schedule path for other departments, but delete legacy nutrition bookings/schedules/plans in the migration. Compute time and entitlement atomically when creating a booking.

**Tech Stack:** NestJS 10, Prisma 5, MySQL, Jest/ts-jest, React 18, TypeScript, TanStack Query, Vite.

**Spec:** `docs/superpowers/specs/2026-08-19-nutrition-provider-availability-design.md`

> **Authoritative implementation decision (2026-08-19):** The implementation reuses `club_availability_slots` for nutrition provider attendance and creates a compatibility `club_schedules` row only when a booking is confirmed. Attendance is active immediately rather than draft/publish. Entitlement state is derived transactionally from booking snapshots and audited restoration fields, with a member row lock preventing double use of the final credit. The original table-by-table tasks below are retained as planning history and are superseded where they conflict with this note. Legacy nutrition schedule/booking APIs reject nutrition; other departments remain unchanged.

## Global Constraints

- New behavior is limited to `nutrition`; do not change class, zumba, spa, personal-training, inbody, or additional scheduling.
- Back up the local database before the destructive migration. Delete only rows whose linked service/category is `nutrition`.
- Candidate starts are every 15 minutes plus existing booking end times; intervals are half-open `[start,end)`.
- No credit means `pay_at_branch`, never a booking rejection.
- `no_show` consumes credit; admin restoration requires a reason and audit fields.
- Flutter source is absent from this repository: implement and document Mobile API here; Flutter UI work belongs in its own repository.
- `.git` is currently invalid; commit steps run only after Git is restored with user approval.

## File map

- Data: `backend/prisma/schema.prisma`, new migration `20260819130000_nutrition_provider_availability`.
- Domain: new `appointment-time.util.ts`, `provider-availability.service.ts`, `service-entitlements.service.ts` and tests/DTO/controller.
- Booking: modify scheduling booking DTO/service/controller/tests and module wiring.
- Admin: new `nutrition-availability-admin.tsx`, `nutrition-booking-dialog.tsx`; modify workspace, services, shared types, bookings and locale JSON.
- Mobile: modify mobile appointment DTO/service/controller/tests/module and API/Postman documentation.

---

### Task 1: Prisma schema and scoped migration

**Files:** Modify `backend/prisma/schema.prisma:2931`; create `backend/prisma/migrations/20260819130000_nutrition_provider_availability/migration.sql`.

**Produces:** provider monthly plan/window models, entitlement ledger, service entitlement key, nullable legacy schedule relation, booking time/price/coverage snapshots.

- [ ] Back up the database to `backend/database/backups/fit90-before-nutrition-availability-20260819.sql` without printing credentials; verify the dump is non-empty.
- [ ] Add enums `ProviderAvailabilityStatus(draft,published,archived)`, `ProviderWindowStatus(available,cancelled,hidden)`, `BookingCoverageType(subscription,pay_at_branch)`, `BookingPaymentStatus(not_required,due_at_branch,paid,waived)`, and `EntitlementLedgerStatus(reserved,consumed,released,restored_by_admin)`.
- [ ] Add `club_provider_monthly_availabilities` unique on employee/category/month/year; add `club_provider_availability_windows` indexed by employee/date/status; add `club_service_entitlement_ledger` indexed by member/subscription/service/status.
- [ ] Add `club_services.entitlement_key`. Make `club_bookings.schedule_id` nullable and add `availability_window_id`, appointment start/end, duration/price snapshots, coverage/payment status and entitlement reservation relation.
- [ ] Start migration SQL with: `DELETE b FROM club_bookings b JOIN club_services s ON s.id=b.service_id WHERE s.category='nutrition';`, then delete nutrition schedules, then nutrition monthly plans. Do not drop shared tables.
- [ ] Run `cd backend && npx prisma validate && npx prisma generate && npx prisma migrate deploy`. Expected: all exit 0 and non-nutrition counts stay unchanged.
- [ ] Commit: `git commit -m "feat(nutrition): add provider availability data model"` after Git restoration.

### Task 2: Pure time engine (TDD)

**Files:** Create `backend/src/modules/scheduling/appointment-time.util.ts` and `.spec.ts`.

**Produces:** `toMinutes`, `toClock`, `intervalsOverlap`, `availableAppointmentTimes(window,durationMin,occupied,stepMin=15)`.

- [ ] Write failing tests: adjacency `15:00-15:30` vs `15:30-16:15` is not overlap; partial overlap is true; a 15:30-16:15 booking permits 16:15; 45 minutes in 15:00-16:00 yields only 15:00 and 15:15.
- [ ] Run `cd backend && npm test -- appointment-time.util.spec.ts --runInBand`; expect module-not-found failure.
- [ ] Implement minute normalization, invalid-window rejection, 15-minute candidates, occupied-end candidates, sort/deduplicate, `end<=windowEnd`, and overlap rejection using `start < occupiedEnd && end > occupiedStart`.
- [ ] Re-run the focused test; expect PASS.
- [ ] Commit: `git commit -m "feat(nutrition): calculate variable appointment times"`.
### Task 3: Provider monthly availability domain/API (TDD)

**Files:** Create `dto/provider-availability.dto.ts`, `provider-availability.service.ts`, `.spec.ts`, `.controller.ts`; modify `scheduling.module.ts`.

**Produces:** plan CRUD/publish/archive; window CRUD/cancel; weekly generation; `/scheduling/provider-availability` admin endpoints.

- [ ] Define DTOs: employee id; category fixed to nutrition; month 1-12/year 2000-2100; date/start/end/optional branch and booking-open/close; weekly weekdays/date range.
- [ ] Write failing tests for duplicate plan, non-nutrition rejection, `end<=start`, overlapping provider window, all Sundays generated, publish without windows rejected, and deleting a window with active bookings rejected.
- [ ] Run `npm test -- provider-availability.service.spec.ts --runInBand`; expect failure because the service is absent.
- [ ] Implement scope checks using `EmployeeDataScopeService`. Detect overlap with `start_time < newEnd` and `end_time > newStart`. Generate dates deterministically and return `{created,skipped}`.
- [ ] Add guarded controller routes matching existing `club.fitness:view/create/update/delete` permissions; register/export service and controller in `SchedulingModule`.
- [ ] Run focused tests and `npm run build`; expect PASS/exit 0.
- [ ] Commit: `git commit -m "feat(nutrition): manage provider attendance windows"`.

### Task 4: Service entitlement and ledger (TDD)

**Files:** Modify `dto/upsert-service.dto.ts`, `services.service.ts`; create `dto/member-service-eligibility.dto.ts`, `service-entitlements.service.ts`, `.spec.ts`; modify module.

**Produces:** `EligibilitySummary {coverageType,total,used,reserved,remaining,amountDue,sources}`; `checkEligibility`, `reserve`, `consumeForBooking`, `releaseForBooking`, `restoreNoShow`.

- [ ] Write failing tests for `nutrition_session` from `benefits.nutritionSessions`; `inbody` from `benefits.inBody` with `inbody_count` fallback; expired/frozen exclusion; reserved+consumed subtraction; zero credit returning pay-at-branch and service price.
- [ ] Run `npm test -- service-entitlements.service.spec.ts --runInBand`; expect module-not-found failure.
- [ ] Allow only `nutrition_session`, `inbody`, or null as `entitlementKey`; map/persist `entitlement_key` in service CRUD.
- [ ] Implement eligibility against subscriptions covering appointment date. Sum the chosen benefit and count ledger `reserved` and `consumed`. Reserve one unit only for subscription coverage.
- [ ] Implement transitions: cancellation -> released; completed/no_show -> consumed; restore -> restored_by_admin with actor/reason/timestamp.
- [ ] Run focused tests and backend build; expect PASS/exit 0.
- [ ] Commit: `git commit -m "feat(nutrition): track subscription service entitlement"`.

### Task 5: Dynamic available-times query (TDD)

**Files:** Modify provider availability service/controller/spec.

**Produces:** `availableTimes(query,user?)` and `GET /scheduling/provider-availability/available-times?serviceId=&employeeId=&date=&branchId=`.

- [ ] Add failing fixture tests: published 15:00-20:00 window, 30-minute service, occupied 15:30-16:15; assert 15:00 and 16:15 available, 15:15/15:30 unavailable, 19:45 unavailable, cancelled booking does not block, draft window returns no public time.
- [ ] Run focused spec and confirm new assertions fail.
- [ ] Validate active nutrition service/provider/published window; load occupying statuses `pending`, `confirmed`, `completed`; call the pure time engine; never return member/booking identity.
- [ ] Add `GET available-times` before parameterized `:id` routes to avoid route capture.
- [ ] Run focused test and backend build; expect PASS.
- [ ] Commit: `git commit -m "feat(nutrition): expose dynamic appointment availability"`.
### Task 6: Variable nutrition booking and lifecycle (TDD)

**Files:** Modify `dto/upsert-booking.dto.ts`, `bookings.service.ts`, `.spec.ts`, `bookings.controller.ts`.

**Consumes:** time engine, provider windows and entitlement service. **Produces:** dynamic booking plus eligibility and no-show-restore endpoints.

- [ ] Add failing tests: covered booking snapshots; zero-credit pay-at-branch; exact adjacency accepted; overlap rejected; duration beyond window rejected; concurrent attempts serialize; cancellation releases; completion/no-show consumes; restore requires admin reason.
- [ ] Run `npm test -- bookings.service.spec.ts --runInBand`; expect failures on new cases.
- [ ] Extend `CreateBookingDto`: optional legacy `scheduleId`, plus optional `availabilityWindowId`, `serviceId`, `startTime`. Validate exactly one path; provider path only accepts nutrition service/window.
- [ ] In `prisma.$transaction`, lock the chosen availability row with `SELECT id ... FOR UPDATE`, reload window/service/occupying bookings, calculate end, recheck overlap and availability, calculate eligibility, create snapshot fields, then create/link a ledger reservation when covered.
- [ ] Return HTTP 409 on time conflict. Do not create a waitlist for variable one-to-one nutrition appointments.
- [ ] Make booking mapping tolerate nullable schedule: prefer appointment snapshot start/end and fall back to legacy schedule; expose coverage/payment/price/duration fields.
- [ ] Wire status transitions. Add `GET member-service-eligibility` and admin `POST :id/restore-no-show-entitlement` with required reason.
- [ ] Run focused booking tests and backend build; ensure legacy booking tests still pass.
- [ ] Commit: `git commit -m "feat(nutrition): book variable provider appointments"`.

### Task 7: Admin provider schedule UI

**Files:** Modify `frontend/src/pages/scheduling/shared.ts`, create `nutrition-availability-admin.tsx`, modify `scheduling-workspace.tsx`, both fitness locale JSON files.

**Consumes:** provider availability endpoints. **Produces:** nutrition schedule screen with provider/month only.

- [ ] Add exact camelCase types for monthly plans, windows, available times and eligibility.
- [ ] Build plan form with provider/month/year only and list draft/published/archived plans.
- [ ] Build date/window dialog with start/end, optional branch/open/close; weekly repeat posts weekday and month range.
- [ ] Render month cells with attendance windows and booking counts; provide publish/archive/cancel actions with server error messages.
- [ ] Route nutrition schedule tab to the new page; keep the current scheduler for every other category.
- [ ] Add Arabic/English keys for attendance, repeat, publishing, booking windows and conflicts.
- [ ] Run `cd frontend && npm run build`; expect exit 0.
- [ ] Commit: `git commit -m "feat(nutrition): add provider attendance calendar"`.

### Task 8: Admin booking flow and service configuration

**Files:** Create `nutrition-booking-dialog.tsx`; modify `service-settings.tsx`, `department-admin.tsx`, `shared.ts`, and fitness locale JSON.

**Consumes:** services, providers, available-times, eligibility and booking endpoints.

- [ ] For nutrition services show required entitlement selector (`nutrition_session` or `inbody`), positive duration, and non-negative price; submit `entitlementKey`.
- [ ] Build booking order member -> service -> provider/date -> available time -> coverage confirmation. Changing an earlier selection clears all dependent selections.
- [ ] Show calculated start/end. Show total/used/reserved/remaining when covered; otherwise show price and “pay at branch”.
- [ ] Post `{availabilityWindowId,serviceId,startTime,memberId,status:'confirmed'}`. On 409 refetch times, clear the selected time and display a localized conflict message.
- [ ] Extend booking list with end time, duration, coverage/payment state and amount due. Add no-show and admin restore dialog with mandatory reason.
- [ ] Run frontend build; expect TypeScript/Vite exit 0.
- [ ] Commit: `git commit -m "feat(nutrition): add admin variable booking flow"`.
### Task 9: Mobile nutrition API (TDD)

**Files:** Modify `backend/src/modules/mobile/dto/mobile-appointment.dto.ts`, mobile appointment service/controller/spec/module.

**Consumes:** shared provider availability, entitlement and booking services. **Produces:** authenticated member nutrition endpoints.

- [ ] Add failing mobile contract tests for active nutrition services, providers with published windows, available times, own-member eligibility, covered booking, pay-at-branch booking, and sanitized 409 response.
- [ ] Run `npm test -- mobile-appointments.service.spec.ts --runInBand`; expect new cases to fail.
- [ ] Add query DTOs for service/provider/date/optional branch and booking DTO for window/service/start. Derive member id from authenticated app user; never accept another member id.
- [ ] Delegate all arithmetic and booking to scheduling-domain services; mobile service only maps response copy/shape.
- [ ] Run focused mobile tests and backend build; expect PASS/exit 0.
- [ ] Commit: `git commit -m "feat(mobile): expose nutrition provider booking API"`.

### Task 10: Docs, regression and acceptance

**Files:** Modify `documentation/MOBILE_APP_API.txt.md` and `documentation/FIT90-Mobile-App.postman_collection.json`.

- [ ] Document exact services/providers/times/eligibility/create requests and covered/pay-at-branch/409 responses. State that unavailable periods contain no member details.
- [ ] Add Postman requests with variables `nutritionServiceId`, `nutritionProviderId`, `availabilityWindowId`, `nutritionDate`, `nutritionStartTime`.
- [ ] Run `cd backend && npm test -- --runInBand && npm run build && npx prisma validate`; expect all suites/build/schema checks to pass.
- [ ] Run `cd frontend && npm run build`; expect exit 0.
- [ ] Manual acceptance: publish every Sunday 15:00-20:00; create 30-minute InBody and 45-minute session; book 15:00-15:30 then 15:30-16:15; verify next start 16:15; verify covered/pay-at-branch, cancellation release, no-show consumption and admin restoration.
- [ ] Non-nutrition regression: open class, spa and personal-training pages and verify listing plus one create/cancel flow still uses legacy `scheduleId`.
- [ ] Final commit after Git restoration: `git commit -m "feat(nutrition): replace service slots with provider availability"`.

## Completion evidence

Before claiming completion, record the migration result, nutrition-only delete counts, preserved non-nutrition counts, focused Jest results, full Jest summary, backend build, frontend build, Prisma validation and manual acceptance observations in the final handoff.