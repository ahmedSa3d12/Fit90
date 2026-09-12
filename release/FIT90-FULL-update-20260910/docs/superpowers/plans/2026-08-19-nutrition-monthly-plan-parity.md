# Nutrition Monthly Plan Parity Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with test-first development and verify each checkpoint before moving to the next task.

**Goal:** Give Nutrition the same monthly-plan calendar, lifecycle, viewing, and booking experience as Personal Training while keeping nutrition availability provider-based and service-independent.

**Architecture:** Introduce a nutrition/provider monthly-plan aggregate whose draft/published/archived lifecycle owns attendance windows. Keep service selection exclusively at booking time, calculate candidate starts from the selected service duration, and retain the existing synthetic `club_schedules` booking record for compatibility. Admin and mobile reads must only expose published plans; existing non-nutrition scheduling remains untouched.

**Tech Stack:** NestJS, Prisma/MySQL, React, TypeScript, TanStack Query, Vitest/Jest, Vite.

**Approved design:** `docs/superpowers/specs/2026-08-19-nutrition-monthly-plan-parity-design.md`

## Scope and invariants

- This change is limited to `nutrition`; SPA, Personal Training, and classes keep their current behavior.
- A nutrition monthly plan belongs to one nutrition specialist and one calendar month; it has no service.
- Draft plans are editable and invisible to customers. Published plans are customer-visible. Archived plans are historical and cannot accept new bookings.
- A booking chooses the service. Its duration determines the end time and which subsequent starts remain available.
- Only free candidate times are displayed. The API must still reject races with HTTP 409.
- A member with entitlement consumes/reserves one session. A member without entitlement may book with `pay_at_branch` / `due_at_branch`.
- Existing nutrition booking history may be absent; no legacy nutrition schedule compatibility is required beyond the new booking's synthetic schedule row.
- The repository Git metadata is currently unavailable, so commits are not part of this run. No destructive Git commands are allowed.

## Task 1: Add provider monthly-plan persistence

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260819160000_nutrition_monthly_plan_parity/migration.sql`

**Steps:**

1. Add a `ProviderMonthlyAvailabilityStatus` enum with `draft`, `published`, and `archived`.
2. Add `club_provider_monthly_availabilities` with specialist, category, month, year, lifecycle timestamps, and a unique key on specialist/category/month/year.
3. Extend `club_availability_slots` with `monthly_availability_id`, `booking_start_at`, `booking_end_at`, `cancelled_at`, and `cancellation_reason`; add the relation and supporting indexes.
4. Extend `club_bookings` with nullable `availability_slot_id` plus relation/index. Keep `schedule_id` required for compatibility.
5. Write forward-only SQL that creates the new table and columns/FKs without changing other departments. Backfill existing valid nutrition windows by grouping them by specialist/month into published plans and linking each slot.
6. Run Prisma formatting, validation, and client generation. Inspect the migration SQL before applying it locally.

**Verification:**

```powershell
cd backend
npx prisma format
npx prisma validate
npx prisma generate
```

Expected: schema validates; generated client contains the new monthly-plan model and relations.

## Task 2: Build the monthly-plan backend API test-first

**Files:**

- Create: `backend/src/modules/club/scheduling/dto/provider-monthly-availability.dto.ts`
- Create: `backend/src/modules/club/scheduling/provider-monthly-availability.service.ts`
- Create: `backend/src/modules/club/scheduling/provider-monthly-availability.service.spec.ts`
- Create: `backend/src/modules/club/scheduling/provider-monthly-availability.controller.ts`
- Modify: `backend/src/modules/club/scheduling/scheduling.module.ts`

**Steps:**

1. Write failing tests for:
   - creating a nutrition plan without a service;
   - rejecting duplicate specialist/month plans;
   - adding one or multiple attendance windows;
   - repeating a day/time window across the remaining weeks of the month;
   - rejecting invalid, cross-month, and overlapping windows;
   - refusing to publish a plan with no active windows;
   - preventing destructive mutation of a booked published window;
   - archiving and deleting only allowed plans.
2. Implement DTO validation for month/year, times, optional booking-open/close timestamps, recurrence, and cancellation reason.
3. Implement plan methods: `create`, `list`, `findOne`, `addWindows`, `updateWindow`, `deleteWindow`, `cancelWindow`, `publish`, `archive`, and `remove`.
4. Enforce nutrition-only provider/category checks, month boundaries, no-service ownership, overlap prevention, and lifecycle rules in the service rather than only in the UI.
5. Expose admin endpoints under `/api/scheduling/provider-monthly-availability` and protect them with the existing scheduling authorization conventions.
6. Run the focused service tests and then the scheduling module tests.

**API shape:**

```text
POST   /scheduling/provider-monthly-availability
GET    /scheduling/provider-monthly-availability
GET    /scheduling/provider-monthly-availability/:id
POST   /scheduling/provider-monthly-availability/:id/windows
PATCH  /scheduling/provider-monthly-availability/:id/windows/:windowId
DELETE /scheduling/provider-monthly-availability/:id/windows/:windowId
POST   /scheduling/provider-monthly-availability/:id/windows/:windowId/cancel
POST   /scheduling/provider-monthly-availability/:id/publish
POST   /scheduling/provider-monthly-availability/:id/archive
DELETE /scheduling/provider-monthly-availability/:id
```

## Task 3: Connect availability and booking to published plans

**Files:**

- Modify: `backend/src/modules/club/availability/availability.service.ts`
- Modify: `backend/src/modules/club/availability/availability.service.spec.ts`
- Modify: `backend/src/modules/club/scheduling/nutrition-bookings.service.ts`
- Modify: `backend/src/modules/club/scheduling/nutrition-bookings.service.spec.ts`

**Steps:**

1. Add failing availability tests showing that draft/archived plans and cancelled windows never produce customer times.
2. Add tests for booking-open and booking-close boundaries.
3. Preserve the 15-minute candidate grid, but calculate each end from the selected nutrition service duration and exclude every candidate that overlaps an active booking.
4. In booking creation, lock the plan, availability window, member entitlement rows, and conflicting bookings inside one transaction.
5. Recheck published status, window activity, booking period, start/end containment, past time, and overlap after locks are acquired.
6. Save `availability_slot_id` on the booking while still creating the synthetic schedule with the selected service and exact calculated start/end.
7. Preserve subscription snapshots and pay-at-branch behavior; return 409 for a just-booked candidate so the UI can refresh.
8. Run focused availability and nutrition booking tests.

## Task 4: Rebuild the Nutrition monthly screen with Personal Training parity

**Files:**

- Create: `frontend/src/pages/scheduling/nutrition-monthly-schedule-launcher.tsx`
- Modify: `frontend/src/pages/scheduling/nutrition-availability-admin.tsx`
- Modify: `frontend/src/pages/scheduling/scheduling-workspace.tsx`
- Reference only: `frontend/src/pages/scheduling/monthly-schedule-launcher.tsx`

**Steps:**

1. Extract/reuse the established Personal Training presentation patterns: create-plan card, plan table, status badges, action buttons, month grid, day cell layout, window editor, weekly repeat, and read-only view dialog.
2. Replace the service selector with the nutrition specialist selector. Keep month/year fields and create plans initially as draft.
3. In the plan calendar, let admins add attendance windows with start/end and optional booking-open/close fields. Do not render or send a service id.
4. Show plan status/actions matching Personal Training: open/edit draft, publish, view published/archived, archive, and delete when allowed.
5. Display per-day attendance windows and booking counts. Show a cancellation action/reason instead of deletion when a published window has bookings.
6. Keep the current nutrition booking dialog but move it into the parity screen as the admin booking action. It must continue to show service duration, entitlement totals/used/remaining, and pay-at-branch messaging.
7. Change `SchedulingWorkspacePage` so Nutrition honors `view=month` and routes to the new launcher instead of unconditionally rendering the old generator/list component.
8. Retain the bookings tab using `DepartmentBookingsAdmin category="nutrition"`.
9. Run the frontend type/build verification.

**Acceptance checks:**

- `.../scheduling/nutrition?tab=schedule&view=month` visually follows Personal Training's monthly-plan workflow.
- No service is selected while creating/editing the monthly plan.
- Customer/admin service selection occurs only in the booking dialog.
- A 30-minute booking at 15:00 permits 15:30; a 45-minute booking at 15:30 makes the next valid start 16:15.

## Task 5: Update the mobile Nutrition contract

**Files:**

- Modify: `backend/src/modules/mobile/mobile-nutrition-appointments.service.ts`
- Modify: `backend/src/modules/mobile/mobile-nutrition-appointments.service.spec.ts`
- Modify: `backend/src/modules/mobile/mobile-nutrition-appointments.controller.ts` only if response routing changes
- Modify: `documentation/mobile-appointments-api.md`

**Steps:**

1. Add tests that provider/month/day results are derived only from published nutrition plans and active windows.
2. Ensure the service-first flow remains: nutrition services → specialists with published availability → month/day → dynamically available times.
3. Return window identifiers and calculated start/end values needed by the booking request, without exposing draft or archived data.
4. Respect booking-open/close periods and omit past/full/overlapping candidates.
5. Preserve eligibility and pay-at-branch fields in the mobile response and booking confirmation.
6. Update API documentation with lifecycle visibility and examples.

## Task 6: Apply migration safely to the local database

**Files:**

- Existing backup: `backend/database/backups/fit90-before-nutrition-availability-20260819.sql`

**Steps:**

1. Confirm the existing backup is readable and non-empty before database mutation.
2. Stop only the local backend process if Prisma/client files or the database schema are locked.
3. Because this database is not Prisma-baselined, apply the reviewed migration SQL directly using the configured MySQL connection; do not use destructive reset commands.
4. Verify table/column/FK creation and confirm non-nutrition booking/schedule counts are unchanged.
5. Restart the backend and check its health/protected endpoint response.

## Task 7: Full verification and visual QA

**Files:**

- Modify only files revealed by failing tests attributable to this feature.

**Steps:**

1. Run focused backend tests for plan lifecycle, availability, nutrition booking, and mobile nutrition.
2. Run full backend tests and build.
3. Run frontend build.
4. Start/confirm both local servers.
5. In the signed-in local browser, exercise:
   - draft creation;
   - weekly Sunday 15:00–20:00 recurrence;
   - publish and read-only view;
   - customer/admin booking with 30- and 45-minute services;
   - entitlement and pay-at-branch outcomes;
   - archive visibility;
   - conflict refresh behavior.
6. Report any browser automation limitation explicitly and provide the exact unverified interaction if visual QA cannot run.

**Final commands:**

```powershell
cd backend
npm test -- --runInBand
npm run build
npx prisma validate

cd ../frontend
npm run build
```

Expected: all tests and builds pass, Prisma validates, and both localhost services respond.
