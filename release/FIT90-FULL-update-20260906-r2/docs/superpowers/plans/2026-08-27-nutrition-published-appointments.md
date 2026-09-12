# Nutrition Published Appointments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow managers to add and edit unbooked nutrition attendance windows in published monthly plans, while requiring cancellation for booked windows and notifying affected members.

**Architecture:** Keep provider monthly availability as the source of truth. Enforce published-plan and active-booking rules in the NestJS service transaction, then expose add/edit controls in the nutrition booking board. Reuse the existing cancellation transaction and notification service.

**Tech Stack:** NestJS, Prisma, Jest, React, TypeScript, TanStack Query.

**Spec:** User-approved behavior in the 2026-08-27 task conversation.

## Global Constraints

- A window with an active `pending`, `confirmed`, or `wait` booking cannot be edited.
- A booked window can only be cancelled; cancellation must cancel linked bookings and notify members.
- Published plans accept new future windows and edits to future unbooked windows.
- Archived plans remain immutable.

---

### Task 1: Backend policy

**Files:**
- Modify: `backend/src/modules/scheduling/provider-monthly-availability.service.spec.ts`
- Modify: `backend/src/modules/scheduling/provider-monthly-availability.service.ts`

**Interfaces:**
- Consumes: existing `addWindows`, `updateWindow`, and `cancelWindow` service methods.
- Produces: published-plan add/edit behavior and a stable conflict message for booked edits.

- [ ] Add failing tests for adding to a published plan, editing an unbooked published window, and rejecting a booked edit.
- [ ] Run the focused Jest suite and verify the new cases fail for the expected policy checks.
- [ ] Update the service guards while retaining transaction locks, overlap checks, and branch/provider access.
- [ ] Run the focused Jest suite and verify it passes.

### Task 2: Nutrition board controls

**Files:**
- Modify: `frontend/src/pages/scheduling/nutrition-appointments-admin.tsx`

**Interfaces:**
- Consumes: `POST /scheduling/provider-monthly-availability/:id/windows` and `PATCH .../:windowId`.
- Produces: add/edit dialog; booked edit shows `غير مسموح بتعديل هذا الموعد لوجود حجوزات بالفعل`.

- [ ] Add editor state and form validation for date, attendance times, and optional booking window.
- [ ] Add an “إضافة موعد” action for published plans and a “تعديل الموعد” action in appointment management.
- [ ] Prevent opening edit for booked windows and show the approved Arabic message.
- [ ] Refresh the board after saving and preserve the cancellation-only path for booked windows.

### Task 3: Verification

**Files:**
- Verify only the files above.

**Interfaces:**
- Consumes: backend tests and frontend TypeScript build.
- Produces: evidence that policy and UI compile together.

- [ ] Run the provider monthly availability Jest suite.
- [ ] Run backend build.
- [ ] Run frontend build.
- [ ] Review the final diff for unrelated changes.
