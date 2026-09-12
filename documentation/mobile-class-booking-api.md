# Mobile class booking API

Base path: `/mobile/app/classes`

All endpoints require the customer bearer token returned by `POST /mobile/app/login`.
The member identity is always read from that token; clients must not send a `memberId`.

## Browse

### `GET /catalog`

Returns class types that have a published future schedule.

### `GET /trainers?classId=7`

Returns trainers with published future slots. `classId` is optional.

### `GET /schedule?trainerId=12&year=2026&month=7&classId=7`

Returns the trainer's monthly schedule grouped by Cairo calendar day. Each slot includes:

- class and trainer data;
- class and booking-window date/times;
- capacity and remaining capacity;
- the member's booking, including wait-list position;
- free-session eligibility from the member's active session subscriptions;
- an `availability.status` value.

Availability values:

- `BOOKING_AVAILABLE`
- `WAITLIST_ONLY`
- `BOOKING_NOT_STARTED`
- `BOOKING_WINDOW_NOT_CONFIGURED`
- `BOOKING_CLOSED`
- `CLASS_STARTED`
- `UNAVAILABLE`
- `CANCELLED`

### `GET /slots/:slotId`

Returns the same member-aware data for one slot.

## Booking

### `POST /bookings`

Body:

```json
{ "slotId": 150 }
```

When capacity exists, the response contains `status: "confirmed"` and
`code: "BOOKING_CONFIRMED"`. When the class is full, a real booking is created with
`status: "wait"`, `code: "CLASS_FULL_WAITLISTED"`, and `waitlistPosition`.

The operation locks the slot before counting confirmed bookings, preventing two
concurrent requests from taking the same last seat.

### `GET /bookings/my?status=wait&scope=upcoming`

Returns the authenticated member's bookings. `status` is optional and supports
`confirmed`, `wait`, `cancelled`, `completed`, and `no_show`. `scope` supports
`upcoming` (default), `past`, and `all`.

### `PATCH /bookings/:bookingId/cancel`

Cancels the authenticated member's confirmed or waiting booking. Cancelling a
confirmed booking automatically promotes the oldest waiting booking and creates an
in-app confirmation notification for that member.

## Notifications

### `GET /notifications`

Returns the latest 50 class-booking notifications for the authenticated member.
