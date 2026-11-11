# Ramsløk planning (planlegging) — design spec

Date: 2026-11-11
Status: Owner-approved feature scope; implementation decisions below ready for review
Builds on: `2026-11-10-ramslok-regnskap-design.md` and the existing admin system
Branch: `planlegging`

## 1. Purpose

Give Ramsløk one place to plan work, clock actual time, review hours and estimated pay,
and assign practical tasks. Owners plan and correct; pickers, sellers and owners clock
their own work on a phone. The monthly Excel file gives whoever runs payroll a readable
working basis. It does not post wages into Regnskap or run payroll.

### What the owner decided

- **Vaktplan:** owners create shifts for any active profile, copy a week to the next,
  edit and cancel. Everyone sees their own shifts this week and next with planned totals.
  Owners see a week grid with one row per person.
- **Stemple:** every role has a large Start/Stopp button. A clock-in inside the person's
  planned shift links automatically; other work is unplanned. One open entry per person,
  enforced in Postgres. Owners see entries open for more than 14 hours and can correct
  start/end with a mandatory reason. Clock timestamps come from database `now()`.
- **Timer:** owners set an integer-øre hourly rate on Brukere. Each person can read only
  their own rate, hours and amount; owners see everyone and export a month to Excel.
- **Oppgaver:** owners alone see and manage the full Å gjøre / Pågår / Ferdig board.
  Workers see assigned tasks and may only mark their own tasks Ferdig. Owners see the
  completion time and actor. Due dates, an important flag and overdue highlighting help
  prioritize. Tasks are archived, shifts cancelled and time entries retained.
- Database RLS, grants and guards enforce access; `picker` and `seller` are equally
  workers here. No anonymous access. Old and new values are audited.
- UI is Norwegian bokmål; code, identifiers and comments are English.

### Success criteria

- An active picker, seller or owner can start or stop their own clock in one phone tap.
  Two tabs and retried requests cannot create two open entries or stop a later entry.
- A worker's direct PostgREST requests reveal no other person's shifts, time, rates or
  unassigned tasks, including aggregates, embedded relations and guessed UUIDs.
- An owner can copy next week's schedule, resolve a forgotten clock-out with a reason,
  and inspect the original timestamps and correction in history.
- Weekly/monthly worked totals equal their daily lines; the Excel values equal the UI
  for the same data. Missing rates and open entries remain visible, never silently zero.
- Cancelling a shift or archiving a task preserves the row and its history. No role can
  delete these records through the app/API, and delete triggers also block maintenance SQL.
- Every rule below has pgTAP coverage; pure time/pay logic has Vitest cases; phone flows
  and protected URLs have Playwright coverage.

## 2. Concepts and implementation decisions

| UI term | Meaning |
|---|---|
| Vakt / Mine vakter | Planned interval assigned to one person / the caller's schedule |
| Høsting / Pakking / Marked / Annet | Shift types `harvest`, `packing`, `market`, `other` |
| Stemple / Start / Stopp | Record actual work using database time |
| Uplanlagt | Time entry with no matching shift at clock-in |
| Glemt å stemple ut? | Open entry strictly older than 14 elapsed hours |
| Timesats / Beløp | Øre per hour / estimated gross work amount, without payroll additions |
| Mine oppgaver | Non-archived tasks currently assigned to the caller |

### Decisions needed to make the approved scope implementable

1. Weeks run Monday–Sunday in **Europe/Oslo**. Store instants as `timestamptz(3)` and
   calendar dates as `date`. Clocking uses `date_trunc('milliseconds', now())`; never a
   client timestamp or JavaScript server clock. Calculations use elapsed milliseconds,
   including daylight-saving changes, without automatic breaks, overtime or rounding
   to quarter hours. Display hours with two decimals; calculate pay before display rounding.
2. A shift may end on its start date or the next Oslo date; the form has "Slutter neste
   dag". Positive duration, at most 26 elapsed hours (covers a 25-hour autumn day).
   Overlapping non-cancelled shifts for the same person are rejected; adjacent shifts
   are allowed. Local input that is nonexistent or ambiguous during a clock change is
   rejected with a Norwegian explanation rather than silently choosing an offset.
3. Shift matching uses the half-open interval `starts_at <= clock_in < ends_at`, for
   the caller and a non-cancelled shift. No early/late grace period. The resulting link
   stays fixed through shift edits, cancellation and time corrections. Reassigning a
   shift with any linked time entry is forbidden; cancel and create another shift.
4. Rates live in a **separate table**, not `profiles`: existing `profiles_select` permits
   all authenticated users to read profiles. Unset rate is represented by no rate row;
   explicit zero is allowed for unpaid work. Range: 0–1,000,000 øre/hour (NOK 10,000).
   Clock-in snapshots the current rate. Later rate edits affect future entries only.
   If the snapshot was missing, an owner may fill it once from the current rate as an
   explicit, reasoned correction. An existing non-null snapshot cannot be repriced.
5. Closed entries may have zero duration to correct an accidental clock-in without
   deleting it. They cannot overlap another entry of that person. Open entries are
   displayed separately, excluded from worked totals and amounts, and never auto-closed
   or capped at 14 hours. Owners may reopen a closed entry with a reason if constraints
   allow it. There is no owner-created backdated entry feature in this scope.
6. Split planned intervals and closed entries at Oslo midnight, then select the requested
   week/month. Round pay **per time-entry/day segment** to the nearest øre, half up:
   `round(duration_ms * hourly_rate_ore / 3600000)`, using exact integer/numeric arithmetic.
   Sum those rounded amounts. Two entries on a day remain two export rows. Planned pay
   uses the current rate and is labelled "Planlagt beløp (anslag)"; worked pay uses snapshots.
   Missing snapshots yield null amounts plus a count; show known subtotal as "Foreløpig
   beløp". Missing rate is never treated as an explicit zero rate.
7. Copy uses the next **calendar week**, preserving Oslo wall times, type and note, not
   adding 168 UTC hours. Only non-cancelled source shifts are copied. It is atomic:
   conflicts, DST-invalid times or inactive assignees roll back all new copies. Existing
   copies are skipped on retry, even if edited or cancelled; copying never overwrites.
8. Cancelling requires a 3–500 character reason; cancellation and task archival are
   terminal in this version. Owners may reopen a completed, non-archived task, clearing
   its completion metadata (history remains). Workers may only complete, never reopen.

## 3. Data model and database interfaces

Migrations, following current latest `20261111000012_receipt_key_format.sql`:

- `20261111000013_planning_shifts_rates.sql`
- `20261111000014_planning_time.sql`
- `20261111000015_planning_tasks.sql`

UUIDs identify these records; there is no business document number. Do not call or change
`next_number()`, its revoked grants, or ledger number series. All profile foreign keys use
`ON DELETE RESTRICT`, including creator/actor fields; no cascading deletion of history.

### 3.1 `work_rates`

| Column | Type | Rules |
|---|---|---|
| id | uuid PK default gen_random_uuid() | Supports existing audit function's `new.id` |
| profile_id | uuid not null unique FK profiles | Immutable |
| hourly_rate_ore | integer not null | Check 0–1000000 |
| updated_by | uuid not null FK profiles | Guard sets `auth.uid()` |
| created_at, updated_at | timestamptz(3) not null | Server-set; created_at immutable |

Owner insert/update only, including rates for inactive profiles (historical work still
needs review). `id` immutable. Owners cannot spoof actor/time. No delete. No default zero
rows and no rate column in `profiles`, JWT metadata or shared profile queries.

### 3.2 `work_shifts`

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | Form-generated once; retry uses same id |
| profile_id | uuid not null FK profiles | Any active role on creation/reassignment |
| shift_date | date not null | Guard derives Oslo start date |
| starts_at, ends_at | timestamptz(3) not null | Strict local validation, bounds in §2 |
| kind | text not null | Check `harvest`, `packing`, `market`, `other` |
| note | text nullable | Check length ≤2000 |
| created_by | uuid not null default auth.uid() FK profiles | Caller; immutable |
| created_at, updated_at | timestamptz(3) not null | Server-set |
| cancelled_at, cancelled_by | timestamptz(3), uuid FK profiles nullable | Both null or both set |
| cancel_reason | text nullable | Null while active; trimmed length 3–500 on cancellation |
| copied_from_shift_id | uuid nullable FK work_shifts | Immutable provenance |
| copied_week | date nullable | Immutable target Monday, paired with source id |

Checks: `ends_at > starts_at`, duration ≤26 hours; local end date is start date or next
date. Use `btree_gist` and an exclusion constraint on
`(profile_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (cancelled_at IS NULL)`.
Dates/instants must be finite. Index `(profile_id, starts_at)`. Unique partial
`(copied_from_shift_id, copied_week)` when source is non-null. A copied shift may subsequently be edited; provenance never changes.

Guard: owner only; active target on insert/reassignment and on time changes (cancelling an
inactive person's shift remains possible). Identity/provenance/creation metadata immutable;
all metadata set by server. New rows are active. Cancelled rows cannot change or be restored.
Cancellation may change only cancel metadata and updated_at. Migration 14 adds the linked
time-entry check before reassignment; no retroactive relinking. All changes audited.

`cancel_work_shift(p_id uuid, p_reason text) returns void` is an owner-only security
invoker RPC: set cancellation with DB now, let the guard validate/stamp actor/reason,
and report the same not-found error for a missing id. No JavaScript timestamp is sent.

`copy_work_week(p_monday date) returns integer` is an owner-only transaction returning the
new row count. Select sources by Oslo start date in Monday–Sunday, not by mere overlap
with the week (a preceding Sunday overnight shift is not copied twice). Reject non-Monday
input. Target is `p_monday + 7`; guard and helper validate
source wall-time values on target dates. Serialize concurrent copies of the same source
week with an advisory transaction lock; lock/read source rows in stable id order. Skip
already copied source/week pairs before insertion, including cancelled copies. Adding
another source shift and copying again adds only that missing shift. Inactive assignee
or an overlap with a manual target shift fails the whole call. No partial success.

### 3.3 `time_entries`

| Column | Type | Rules |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| profile_id | uuid not null FK profiles | Always caller on insert; immutable |
| shift_id | uuid nullable FK work_shifts | Server-selected on insert; immutable |
| started_at | timestamptz(3) not null | Server now on insert; owner correction later |
| ended_at | timestamptz(3) nullable | Null = open; server now on Stopp |
| hourly_rate_ore | integer nullable | Snapshot; check 0–1000000 if set |
| start_key | uuid not null | Client-generated once per Start intent; immutable |
| version | bigint not null default 1 | Guard increments on each actual update; client cannot set |
| created_at, updated_at | timestamptz(3) not null | Server-set; creation immutable |
| correction_reason | text nullable | Trimmed 3–500 when corrected |
| corrected_at, corrected_by | timestamptz(3), uuid FK profiles nullable | Server-set on correction |

Checks: finite start/end, `ended_at IS NULL OR ended_at >= started_at`; correction
actor/time/reason all null or all present. Partial unique index `(profile_id) WHERE ended_at IS NULL` explicitly
enforces one open entry. Unique `(profile_id, start_key)` handles retries. Exclusion
constraint `(profile_id WITH =, tstzrange(started_at, ended_at, '[)') WITH &&)` prevents
overlaps, treating a null end as infinity; empty zero-duration ranges do not overlap.
Index `(profile_id, started_at)` and a partial open-entry index for owner alerts.

All authenticated roles have SELECT only on this table; **no direct INSERT/UPDATE/DELETE**.
The following narrow mutation RPCs are security definer and explicitly authorize before
reading or changing rows. Guards independently enforce the allowed transitions. They must
not trust a client-settable GUC, trigger depth, `current_user`, or a null `auth.uid()` as
authorization. Anonymous/inactive callers fail closed. No app service-role access.

| RPC | Contract |
|---|---|
| `clock_in(p_start_key uuid) returns time_entries` | Active caller only, no person/time/rate/shift arguments. Serialize on caller's profile row `FOR NO KEY UPDATE`; recheck active after lock. Existing caller/key returns original row, even closed, with no new audit. Otherwise an existing open row raises `TIME_ALREADY_OPEN`. Insert self with DB time, matching shift and current rate (or null). |
| `clock_out(p_entry_id uuid) returns time_entries` | Self only, including owner; lock caller profile, then entry. Wrong/missing/hidden id gives same `PLANNING_NOT_FOUND`. If already closed return unchanged. Close that id with DB now; never stop "whichever row is open". |
| `correct_time_entry(p_id uuid, p_started_at timestamptz, p_ended_at timestamptz, p_reason text, p_expected_version bigint, p_fill_missing_rate boolean default false) returns time_entries` | Owner only, any person's entry, including inactive people. Resolve person, lock profile then entry, recheck identity. Require current version = expected version or raise `PLANNING_STALE`; reason mandatory for every call; validate order and timestamps ≤DB now. Optional fill only when snapshot is null and a current rate exists; never replace an existing snapshot. Stamp correction actor/time. No changes to id, person, shift, start key or creation metadata. |

Guard INSERT sets self, now, match and snapshot; ignores supplied derived values and
rejects a different person. UPDATE permits only (a) a self stop of an open row, changing
end to DB now and preserving everything else, or (b) owner correction with a supplied
reason, changing start/end and optionally filling a null rate from the current work_rates
value. An ordinary Stopp retains earlier correction metadata. Guard initializes/increments
version; a stale correction fails and must be reviewed again, so a concurrent Stopp cannot
silently become a reopen. Every other change fails. A worker cannot disguise a
start/rate/shift edit as a stop. Future/order checks apply to owner corrections; no maximum
closed duration. Shared profile lock order serializes clock calls and corrections; the
unique/exclusion constraints remain the final protection if another path is added later.

No stored `forgotten` flag: `ended_at IS NULL AND started_at < date_trunc('milliseconds', now()) - interval '14 hours'`.
It updates on reads without a job. Owner closes/fixes the row; worker can still Stopp it.

### 3.4 `work_tasks`

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | Form-generated once for creation retries |
| title | text not null | Trimmed length 1–200 |
| description | text nullable | Length ≤10000 |
| assigned_to | uuid nullable FK profiles | Active person of any role on assignment |
| due_date | date nullable | Oslo date; past dates allowed |
| important | boolean not null default false | |
| status | text not null default 'todo' | Check `todo`, `in_progress`, `done` |
| completed_at, completed_by | timestamptz(3), uuid FK profiles nullable | Both set iff status is done |
| archived_at, archived_by | timestamptz(3), uuid FK profiles nullable | Both null or both set |
| created_by | uuid not null default auth.uid() FK profiles | Caller on insert; immutable |
| created_at, updated_at | timestamptz(3) not null | Server-set |

Index `(assigned_to, status, due_date) WHERE archived_at IS NULL`. Owner can insert/edit,
move status, assign/unassign, and archive. Owner may complete unassigned tasks; completing
an already completed task preserves its original actor/time. Reopening clears completion
metadata. Archiving preserves business fields, status and completion. Archived rows cannot
change. Existing assignments to people later deactivated remain visible to owners; only
new/reassigned people must be active. Task id, created_by and created_at are immutable
for every role. New tasks are unarchived; completion metadata is derived from status.
Owner inserts/updates also cannot spoof server actor/time fields.

Worker UPDATE whitelist: own currently assigned non-archived task, status only to `done`.
Compare **all other business/identity fields** to OLD, rejecting edits to title, description,
assignee, due date, important, archive metadata or creation metadata. Guard stamps
completed_by/time itself and ignores forged completion/update timestamps. Repeating done
is a no-op preserving metadata. Workers cannot set `in_progress`, reopen or archive.
An owner assigned a task retains full owner rights. An unassigned task is owner-only.

Overdue = non-archived, status not done, due_date < `todayOslo()`; due today is not overdue.
No permanent overdue flag. Both owner and worker views show "Forfalt" plus the date.

`archive_work_task(p_id uuid) returns void` is owner-only, security invoker; it sets
archive intent with DB now and the guard stamps metadata. Repeated archival is a no-op.
Cancellation/archival RPCs check role before row lookup and never accept actor/time inputs.

### 3.5 Audit, guards and function privileges

- Reuse `public.audit_row_with_old()` unchanged on INSERT/UPDATE of all four tables:
  insert `data.new`; update `data.old` and `data.new`; actor `auth.uid()`. Rates use their
  own UUID `id`, so the function needs no change. Time correction reason lives in the
  new row and therefore in the audit event with both timestamp versions.
- Add `planning_no_delete()` with unconditional `PLANNING_NO_DELETE` and BEFORE DELETE
  triggers on all four tables. Revoke DELETE/TRUNCATE from public, anon, authenticated
  and service_role; FK restrictions also prevent auth/profile cascading history loss.
- Guards and mutation RPCs: `security definer set search_path = ''`, schema-qualified
  names, default execute revoked from `public, anon, authenticated`. Grant execute only
  on listed user-callable RPCs to authenticated; each checks `app_role()`/`auth.uid()`.
  Trigger functions are never callable APIs. Read/report functions and the narrow
  cancel/archive RPCs use security invoker (still check owner and pin search_path).
- Unlike the ledger's maintenance bypass, new mutation guards fail when caller identity
  is missing or inactive. pgTAP may set JWT claims to a test owner for fixtures; never
  add a production bypass just to seed tests. A database administrator who disables
  triggers is outside the app security boundary.
- Preserve existing profile RLS and owner-only `audit_log` access. No worker audit-log
  policy: it would disclose other people's data and rates. No shared cached payloads
  containing rates; queries use the session client and request-scoped authorization.

### 3.6 RLS and grants (each cell tested separately)

`own` means `profile_id = auth.uid()` and active `app_role()`; `assigned` means
`assigned_to = auth.uid() AND archived_at IS NULL`. Owner means active owner.
S/I/U below describe table operations subject to guards, not unrestricted column writes.

| Table | owner | picker | seller | inactive / anon |
|---|---|---|---|---|
| work_rates | S all, I/U | S own | S own | No rows / no grants |
| work_shifts | S all incl cancelled, I/U | S own incl cancelled | S own incl cancelled | No rows / no grants |
| time_entries | S all; writes only RPC | S own; self clock RPC | S own; self clock RPC | No rows / no grants or RPC execute |
| work_tasks | S all incl archived, I/U | S assigned; U own to done only | S assigned; U own to done only | No rows / no grants |
| audit_log (existing) | S all | None | None | None |

Policies explicitly check active role, including on own-row SELECT. Worker INSERT on rates,
shifts or tasks fails; worker UPDATE on rates/shifts affects no rows. Task UPDATE uses both
USING and WITH CHECK with the owner-or-assigned predicate; guard enforces the status-only
worker transition. Owner I/U policies exist on rates/shifts. Time table has SELECT policy
only; narrow definer RPCs bypass table RLS and therefore perform the checks in §3.3.

Revoke table privileges from `public, anon, authenticated`; then grant authenticated
SELECT/INSERT/UPDATE on rates/shifts/tasks and SELECT only on time_entries. No DELETE,
TRUNCATE or anon privileges. RLS remains enabled on all four. Worker rates/shifts mutations
are denied by RLS plus guards even though the shared authenticated role has DML grants.

### 3.7 Reports

`planning_daily(p_from date, p_to date)` is stable, security invoker, `search_path = ''`,
execute to authenticated only. Explicitly reject null/inactive roles with 42501. Inputs
are inclusive Oslo dates, valid and ordered, at most 366 days (`PLANNING_PERIOD`). RLS
applies to every underlying relation. It returns daily **segments**, not a cross-person
definer view: `profile_id uuid, work_date date, source_kind text ('shift'|'time'), source_id
uuid, duration_ms bigint, hourly_rate_ore integer nullable, amount_ore bigint nullable`.

Build Oslo-midnight boundaries per calendar date, intersect each interval, emit positive
intersections and a single zero-duration closed time row on its start date. Exclude
cancelled shifts and open entries. A shift segment uses the person's current rate; a
time segment uses its snapshot. SQL `numeric` multiplication and rounding avoid integer
overflow and floating-point pay. The TS helper mirrors this formula with integer/BigInt
intermediates, and tests compare exact results. No joins starting from unrestricted
profiles that could emit names or empty rows for other workers.

The UI aggregates returned segments for week/month and fetches visible open entries
separately (including entries begun before the selected period). Owners may join profile
names using the session client; workers use their own authenticated identity. Cancelled
shifts remain in schedules/history but not planned totals. Edited shifts alter planned
totals only; worked totals continue to use actual intervals.

## 4. Screens and navigation

Use existing `Page`, `LargeTitle`, `ResponsiveSheet`, form/action and toast patterns,
dark mode tokens and reduced-motion support. Pages are Server Components, mutations
Server Actions using the session client. Check role in every action/page independently
of layout; RLS/guards remain the final boundary. No new dependencies or environment vars.

Add the following non-tab entries to `src/features/admin/ui/nav-items.ts`, after Regnskap,
for all three roles: **Vaktplan** (`/admin/vaktplan`, calendar), **Stemple**
(`/admin/stemple`, new clock icon), **Timer** (`/admin/timer`, clock), **Oppgaver**
(`/admin/oppgaver`, new checklist icon). These live under existing phone **Mer**; keep
the current tab count. Links on Mine vakter and Timer lead directly to Stemple.

### 4.1 `/admin/vaktplan`

- Everyone: **Mine vakter**, this week and next, each with planned hours, day/time/type,
  note and cancelled badge. Cancelled rows are marked "Avlyst" and excluded from totals.
  Overnight shifts show both dates; queries include intervals crossing the week boundary. Empty state: "Du har ingen vakter denne uken."
- Owners additionally: week selector (Monday date in `?week=YYYY-MM-DD`), **Vaktplan**
  grid with one row per active person and seven Oslo date columns; include inactive
  people who have shifts in the week. Crossing-midnight shifts appear across both days
  but open the same record. Phone grid scrolls inside its container, with person labels
  retained; no page-level horizontal overflow. Totals use daily segments.
- Owner actions: **Ny vakt**, **Rediger**, **Avlys vakt** (reason), **Kopier til neste uke**
  with source/target dates and a preview count; after success navigate to target week.
  Existing copies are described as skipped. No drag/drop requirement.
- Form: person (all active profiles, any role), date, start/end times, "Slutter neste dag",
  type, note. Cancelled rows read-only; owner sees audit history on the detail sheet.

### 4.2 `/admin/stemple`

One large primary button **Start** when closed, **Stopp** when open (minimum 56px height),
current state, start time, elapsed time, and matching shift or "Uplanlagt". UI timer is
informational; persisted time is DB time. Open state is loaded after navigation, focus
and successful action. Worker gets "Glemt å stemple ut?" on their own old open entry;
owner overview links to all flagged entries. No client-only optimistic start/stop state.

Generate one start key per user intent and retain it across network retries until the
result is reconciled; successful explicit next Start gets a new key. Stop carries the
displayed entry UUID. Disable while pending. Refresh from DB after failures/conflicts;
never assume a failed HTTP response means a failed clock operation. Signed-out sessions
return to login; no offline queue. Owners clock themselves here, not other people.

### 4.3 `/admin/timer` and `/admin/timer/[id]`

- Week/month selector, previous/next controls. **Planlagte timer**, **Arbeidede timer**,
  **Planlagt beløp (anslag)** and worked **Beløp**, own current **Timesats**. Detail rows
  show date, actual start/end, worked hours, snapshot rate and amount, including unplanned
  work. Open entries are a separate list; incomplete amounts visibly say why.
- Owner view additionally: person filter/all people, per-person totals, **Glemt å stemple
  ut?**, missing-rate count and link to Brukere, **Eksport**. Historic inactive people
  with records are included. Owner's own view remains available.
- `/admin/timer/[id]`: session/RLS lookup; 404 if hidden or missing. Self may inspect;
  owner sees **Korriger** with Oslo start/end, reason, and "Bruk gjeldende timesats"
  only for a missing snapshot. Show current and proposed timestamps before saving.
  Existing ambiguous fall-back instants display their offset; an unchanged instant is
  carried through exactly. Changed wall-time input must be unique per §2. History with
  old → new, reason, actor and time is owner-only via existing audit_log policy.
- Zero-duration correction is labelled as such, retained with its reason. No delete button.

### 4.4 `/admin/users` (existing owner-only page)

Add **Timesats (kr/time)** and an edit sheet to each user row, including the owner.
Unset is "Ikke satt"; explicit `0,00` is allowed. Reuse existing kr formatting and a strict
rate parser (empty is invalid; zero is not empty). Explain "Endringen gjelder nye
innstemplinger. Tidligere timer beholder satsen de ble registrert med." Owner may fill
an older missing snapshot through its correction form. Current users/invite/active
controls and auth-admin email lookup stay as they are; rate queries/writes use the
session client, never that auth-admin client's service privileges.

### 4.5 `/admin/timer/eksport`

Owner only. Choose month (`YYYY-MM`), default Oslo current month; preview totals, open
entries and missing-rate count before download. **Last ned Excel** calls
`GET /api/planlegging/export.xlsx?month=YYYY-MM` (Node runtime, existing exceljs).

- File `ramslok-timer-YYYY-MM.xlsx`, sheet **Timer**: Person, Dato, Timer, Timesats (kr),
  Beløp (kr), Merknad. One closed-entry/day row in the month, including inactive people
  and zero-duration corrections. Person sort, then date and source id; date is an Oslo
  date string, hours/rate/amount are numeric, money `#,##0.00`, frozen bold header.
- Merknad carries "Mangler timesats" for unknown amounts; rate/amount cells are blank
  in those rows. Empty month yields headers only. Sum known numeric amounts using
  precomputed values, never Excel formulas from user text.
- Sheet **Kontroll**: month, "Lønnsgrunnlag – ikke lønnskjøring", known amount subtotal,
  missing-rate row count, and visible open entries (person/start, no paid hours/amount).
  Incomplete exports remain downloadable and prominently labelled "Ufullstendig grunnlag".
- Select rows with the user's session client/report RPC after owner check; no service
  client. Response headers: correct XLSX MIME, attachment filename, `Cache-Control:
  private, no-store`, `X-Content-Type-Options: nosniff`. Signed out/non-owner →404;
  malformed month →400 "Velg en gyldig måned.". No shared caching of personal/pay data.

### 4.6 `/admin/oppgaver`

Owner: full board, **Å gjøre / Pågår / Ferdig**, with **Ny oppgave**, edit sheet, explicit
status controls, importance marker, assignee and due date. Show completion actor/time on
done cards/detail and **Arkiver**. An archived filter shows read-only history. Sort each
column: important first, due date ascending (null last), created_at then id.

Worker: heading **Mine oppgaver**, only their assigned active tasks, same descriptive
fields and overdue marker. **Marker som ferdig** is their only mutation. Show done tasks
with completion state; no full board, assignee picker, create/edit/archive controls or
other workers' tasks. An owner sees both the board and an optional own-task filter.
Completion/reassignment races resolve against locked/current DB rows; stale clients
cannot complete a task after it was unassigned, reassigned or archived.

## 5. Error handling

Add messages through `dbErrorToMessage`; actions return existing `ActionResult` and clients
use `callAction`. Preserve form values, show pending state, announce errors accessibly.
No raw SQL, UUIDs or rates from another person's row in an error response.

| Database code/message or validation | Norwegian UI message |
|---|---|
| `PLANNING_NO_DELETE` | Registreringer kan ikke slettes. Avlys vakten eller arkiver oppgaven. |
| `PLANNING_IMMUTABLE` | Dette feltet kan ikke endres. |
| `PLANNING_NOT_FOUND` | Fant ikke registreringen. |
| `PLANNING_STALE` | Registreringen er endret. Last inn på nytt og kontroller tidspunktene. |
| `PLANNING_INACTIVE_PERSON` | Velg en aktiv person. |
| `PLANNING_LOCAL_TIME` | Tidspunktet er ugyldig eller tvetydig ved overgang til sommer- eller vintertid. Velg et annet tidspunkt. |
| `SHIFT_INTERVAL` | Vakten må slutte etter start, senest neste dag og innen 26 timer. |
| `SHIFT_OVERLAP` (shift constraint 23P01) | Personen har allerede en vakt i dette tidsrommet. |
| `SHIFT_CANCEL_REASON` | Skriv en grunn for avlysningen (minst 3 tegn). |
| `SHIFT_CANCELLED` | Vakten er avlyst og kan ikke endres. |
| `SHIFT_HAS_TIME` | Vakten har registrerte timer. Avlys den og opprett en ny for å bytte person. |
| `PLANNING_WEEK` | Velg en mandag som ukestart. |
| `PLANNING_PERIOD` | Velg en gyldig periode på høyst 366 dager. |
| `TIME_ALREADY_OPEN` (named open index 23505) | Du er allerede stemplet inn. |
| `TIME_OVERLAP` (time constraint 23P01) | Tidsrommet overlapper andre registrerte timer. |
| `TIME_INTERVAL` | Slutt må være lik eller etter start, og tidspunktene kan ikke være i fremtiden. |
| `TIME_REASON` | Skriv en grunn for korrigeringen (minst 3 tegn). |
| `TIME_RATE` | Bare en manglende timesats kan fylles inn. Sett gjeldende sats på Brukere først. |
| `TASK_ARCHIVED` | Oppgaven er arkivert og kan ikke endres. |
| `TASK_COMPLETION_ONLY` | Du kan bare markere dine egne oppgaver som ferdige. |
| Invalid rate / `RATE_INVALID` | Skriv timesatsen i kroner, fra 0 til 10 000, med høyst to desimaler. |
| Invalid title | Skriv en tittel på mellom 1 og 200 tegn. |
| 42501 | Du har ikke tilgang til dette. |
| Network failure | Ingen forbindelse. Prøv igjen. |

Translate named constraints contextually; do not translate every 23505 into already
clocked in (start-key retries are successful). Invalid input checks have the same messages
on client/server, but DB guards/checks are authoritative. Week copy failure says
"Ingen vakter ble kopiert." plus the mapped cause. Empty task view: "Du har ingen
oppgaver." Unknown/hidden time ids are indistinguishable. Repeated clock-out and task
completion return current state without changing recorded completion times.

## 6. Testing

### pgTAP

Separate files `planning_shifts_rates.test.sql`, `planning_time.test.sql`,
`planning_tasks.test.sql`, using existing `helpers.psql`, transactions and rollback.
Every RLS table cell for owner, two pickers, two sellers, inactive authenticated and anon;
test same-role and cross-role attempts, not just UI visibility. Assert permission denial
versus zero-row RLS results explicitly. Probe direct table DML, RPCs, guessed ids, report
aggregation, embedded FK-style joins and audit-log access. Assert function execute ACLs,
empty search paths and invoker/definer choice. Temporarily grant DML/policies inside the
test transaction to prove guards still block forbidden edits and delete triggers fire
for owner and postgres. No new permanent grants or production test helper functions.

Coverage includes every check, interval boundary, active-person rule, server metadata,
rate snapshot/one-time fill, copy rollback/retry/provenance, shift linkage immutability,
one-open unique index, overlapping actual/planned intervals, stop/correction whitelist,
optimistic correction version checks,
zero duration, reopen, required correction/cancellation reasons and audit old/new/actor.
Forgotten threshold tests use transaction `now()` at exactly 14h and 14h+1ms. Test
inactive users cannot call any mutation RPC or receive reports. Complete after reassignment
or archive must fail without changing the task. Assert no worker path exposes audit data.

### Vitest

Strict Oslo calendar/time parsing (existing `osloLocalToIso` normalizes some invalid values,
so add feature-scoped round-trip/ambiguity validation rather than assuming it validates),
week/year boundaries, next-week DST copies, midnight/month splitting, leap days, exact
millisecond pay and per-segment rounding, explicit zero versus missing rate, sorting,
overdue/14-hour thresholds and known/incomplete totals. SQL fixtures and TS fixtures use
the same exact dates/durations/rates. Reload generated workbook with ExcelJS to assert
cell types, Norwegian headings, rows, amounts and empty/incomplete cases. Mocked action
tests assert role checks, session RPC use and no client time/identity forwarding.

### Playwright (390×844 phone viewport)

Owner sets rate, creates/edits/cancels/copies shifts; picker and seller see only their own
week totals. Each role starts/stops, refreshes and keeps state; planned/unplanned cases;
owner fixes forgotten time with reason/history. Two independent sessions/tabs for the
same person send concurrent Start requests: one open row. Retry same start key after
close returns original closed row; stale Stop cannot close a later entry. Owner correction
races with clock-out: either correction precedes Stop or a stale-version conflict is
shown; no silent reopen/lost update. Worker direct URLs/actions/export requests
are protected, including a different worker's detail UUID. Worker sees only assigned
tasks, completes one; owner sees actor/time, edits/reopens/archives; stale completion
fails. Owner downloads/opens a monthly workbook; UI/export totals match. Verify dark/light
layouts at 390×844 and 1280×800, keyboard access and no page-level overflow.

All DB/reset/e2e commands must target local Supabase only. Existing e2e `adminClient()`
rejects hosted URLs; use authenticated owner/user clients for new planning fixture writes
because guards require identity. Leave retained rows under unique `E2E ` labels; do not
delete planning fixtures. Browser fake time cannot substitute for DB-time fixtures.

## 7. Deployment

- Build and verify on `planlegging`; do not push or merge without a later instruction.
  No product code is part of this documentation commit.
- Apply migrations 13, 14, 15 in order to local Supabase first; reset and run all suites.
  `btree_gist` is the only added extension; no cron jobs, buckets or new env vars.
- As before, prepare hosted SQL under git-ignored `deploy-sql/` during implementation;
  the owner runs it in hosted Supabase's SQL editor. Each migration and its corresponding
  `supabase_migrations.schema_migrations` version/name record run in one transaction.
  Record versions `20261111000013`, `20261111000014`, `20261111000015` exactly once after
  successful DDL; match the actual hosted history table columns. Do not rerun already
  applied DDL or edit old migrations. Take the usual hosted backup before applying.
- Deploy app after schema. Smoke-test an owner, picker and seller, rate privacy, clock,
  schedule and Excel export. Existing profile, harvest, stock, market and ledger access
  must remain unchanged. Do not reset hosted DB or execute local fixtures against it.
- On app failure, roll back app version and keep schema/data; never drop recorded work
  or reverse by deleting rows. Fix schema with a forward migration if necessary.

## 8. Build process

Follow companion plan, one task at a time, DB first, tests before implementation, one
commit per task on `planlegging`. Read `AGENTS.md` and relevant installed Next 16 docs
before API work. Preserve existing admin components and user administration behavior.
Security review includes direct Supabase access and RPCs, not merely hidden buttons.

## 9. Out of scope

Payroll execution, a-melding, holiday pay, overtime/break rules, pension/tax deductions,
employment contracts, posting wages into Regnskap, notifications/e-mail, GPS/geofencing,
offline clock queues, attendance approval/period locking, time-entry manual creation,
rate effective-date history/repricing, recurring schedules beyond copy-next-week,
worker scheduling changes, task comments/attachments and task hard deletion.
