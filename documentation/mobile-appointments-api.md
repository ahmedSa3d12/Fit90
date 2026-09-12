# Mobile appointment APIs

All endpoints require the bearer token returned by `/api/mobile/app/login`. The member ID is always taken from the customer token and is never accepted from the request body.

## Nutrition (provider-attendance model)

Base path: `/api/mobile/app/nutrition`

The admin creates active nutrition-provider attendance windows without choosing a service. The customer chooses the service, and its configured duration is used to calculate the available start and end times dynamically.

### Endpoints

- `GET /services` — active nutrition services with `durationMin`, `price`, and `entitlementKey`.
- `GET /providers` — specialists who have future nutrition attendance windows.
- `GET /schedule?serviceId=8&trainerId=2&year=2026&month=8` — available times grouped by date. Each time contains `windowId`, `startTime`, and `endTime`.
- `GET /eligibility?serviceId=8&date=2026-08-23` — subscription totals, used/reserved/remaining counts, and whether the booking is covered or payable at the branch.
- `POST /bookings` — create a confirmed booking.
- `GET /bookings/my?scope=upcoming` — the customer’s nutrition bookings, including coverage/payment and duration snapshots.
- `PATCH /bookings/:bookingId/cancel` — cancel before the appointment starts.

Booking request:

```json
{
  "availabilitySlotId": 41,
  "serviceId": 8,
  "startTime": "15:00",
  "notes": "optional"
}
```

A covered booking returns:

```json
{
  "coverageType": "subscription",
  "paymentStatus": "not_required",
  "amountDue": "0.00",
  "total": 4,
  "used": 1,
  "reserved": 1,
  "remaining": 2
}
```

When no applicable balance remains, booking is still accepted and returns:

```json
{
  "coverageType": "pay_at_branch",
  "paymentStatus": "due_at_branch",
  "amountDue": "130.00"
}
```

The app should show only the returned available times. If another customer takes a time before confirmation, the API returns HTTP 409 and the app should refresh the schedule. Payment for uncovered nutrition bookings is collected at the branch.

## SPA and personal training

Dedicated base paths:

- SPA: `/api/mobile/app/spa`
- Personal training: `/api/mobile/app/personal-training`

Both expose `services`, `trainers`, `schedule`, `slots/:scheduleId`, `bookings`, `bookings/my`, and `bookings/:bookingId/cancel`. Their existing published-monthly-schedule/capacity behavior remains unchanged.

The generic `/api/mobile/app/appointments` endpoints remain available for backward compatibility with the existing SPA and personal-training clients. New nutrition clients must use `/api/mobile/app/nutrition`.
## Nutrition monthly-plan lifecycle

Nutrition availability is provider-based and service-independent. The customer selects the nutrition service at booking time, and that service duration determines the appointment end and the next available start.

Only provider plans with status published are returned to the app. Draft and archived plans, cancelled attendance windows, inactive specialists, past starts, closed booking windows, and occupied times are omitted.

The monthly schedule response includes:

- plan: id, employeeId, status, year, month, and publishedAt.
- Each time: availabilitySlotId (also returned as legacy-compatible windowId), monthlyAvailabilityId, startTime, endTime, bookingStartAt, and bookingEndAt.

Send availabilitySlotId, serviceId, and startTime when booking. If the member has no remaining entitlement, booking still succeeds with coverageType pay_at_branch and paymentStatus due_at_branch.