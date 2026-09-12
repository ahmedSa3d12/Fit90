# Spa Provider Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Schedule SPA provider attendance without a service, then select and charge/cover the service at booking time.

**Architecture:** Generalize the existing provider-monthly-availability domain from nutrition-only to nutrition and SPA. Add a SPA booking path that mirrors the nutrition transaction but derives eligibility from `includes_spa/spa_count`; it creates the compatibility schedule only after a service is selected.

**Tech Stack:** NestJS, Prisma, Jest, React, TypeScript, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-09-01-spa-provider-availability-design.md`

## Global Constraints

- Existing nutrition and non-SPA booking flows must remain unchanged.
- SPA credit is reserved at booking and is released only by cancellation.
- Paid SPA bookings use `pay_at_branch` and `due_at_branch`.

---

### Task 1: Generalize provider monthly availability

**Files:**
- Modify: `backend/src/modules/scheduling/dto/provider-monthly-availability.dto.ts`
- Modify: `backend/src/modules/scheduling/provider-monthly-availability.service.ts`
- Modify: `backend/src/modules/scheduling/provider-monthly-availability.controller.ts`
- Test: `backend/src/modules/scheduling/provider-monthly-availability.service.spec.ts`

- [ ] Write tests proving a `spa` plan is created and listed independently of nutrition.
- [ ] Run the focused Jest test and observe the SPA case fail.
- [ ] Add a validated category parameter and make plan/window queries use the stored plan category.
- [ ] Run the focused Jest test and confirm it passes.

### Task 2: Create atomic SPA provider bookings

**Files:**
- Create: `backend/src/modules/scheduling/spa-provider-bookings.service.ts`
- Create: `backend/src/modules/scheduling/spa-provider-bookings.service.spec.ts`
- Modify: `backend/src/modules/scheduling/dto/nutrition-booking.dto.ts`
- Modify: `backend/src/modules/scheduling/bookings.controller.ts`
- Modify: `backend/src/modules/scheduling/scheduling.module.ts`

- [ ] Write failing tests for covered, paid, duplicate-credit, and cancelled SPA bookings.
- [ ] Run the focused Jest test and observe the expected failures.
- [ ] Implement service selection, overlap validation, free-session eligibility, snapshots, and cancellation release.
- [ ] Expose `spa/eligibility`, `POST spa`, and `PATCH spa/:id/status` endpoints.
- [ ] Run the focused Jest test and confirm it passes.

### Task 3: Convert SPA monthly schedules and booking board

**Files:**
- Modify: `frontend/src/pages/scheduling/nutrition-monthly-schedule-launcher.tsx`
- Modify: `frontend/src/pages/scheduling/nutrition-appointments-admin.tsx`
- Modify: `frontend/src/pages/scheduling/scheduling-workspace.tsx`
- Modify: `frontend/src/pages/scheduling/department-admin.tsx`

- [ ] Generalize the provider monthly calendar component with category-specific labels.
- [ ] Route SPA month view to the provider-only calendar and SPA booking board.
- [ ] Add required primary-service selection, eligibility state, payment copy, and SPA endpoint calls in the booking dialog.
- [ ] Run `npm run build` in `frontend` and fix TypeScript errors.

### Task 4: Verify affected server workflows

**Files:**
- Test: `backend/src/modules/scheduling/spa-provider-bookings.service.spec.ts`
- Test: `backend/src/modules/scheduling/provider-monthly-availability.service.spec.ts`

- [ ] Run focused server tests.
- [ ] Run `npm run build` in `backend` and `frontend`.
- [ ] Manually exercise draft, publish, credit-covered booking, paid booking, and cancellation in the local app.
