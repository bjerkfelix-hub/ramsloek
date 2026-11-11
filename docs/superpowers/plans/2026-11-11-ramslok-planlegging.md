# Ramsløk planning (planlegging) Implementation Plan

> **For agentic workers:** Implement ONE task per run, in order. Steps use checkbox (`- [ ]`) syntax.
> Work only on branch `planlegging`. Never push, never merge, never touch `main`. Commit at the end
> of each task with the message given. If a step's expected output differs, stop and report.

**Goal:** Vaktplan, phone Start/Stopp, own/owner hours and estimated pay with monthly Excel
export, owner-managed task board and assigned worker tasks under `/admin`.

**Architecture:** Four Postgres tables with RLS, guard/audit/delete-blocking triggers;
three ordered migrations. Rates are separate from globally readable profiles. Clock and
correction mutations use narrow, authorized SQL RPCs; other mutations use session-client
table writes with RLS/guards. Server Component pages and Server Actions follow existing
admin patterns. Report SQL runs as invoker; Excel uses the existing `exceljs` dependency.
No payroll or Regnskap writes and no service-role access to planning data.

**Tech Stack:** Next.js 16.4.5 (read relevant `node_modules/next/dist/docs/` guides before
using Next APIs), React 19, Supabase/Postgres, `btree_gist`, pgTAP, Vitest, Playwright, exceljs.

**Spec:** `docs/superpowers/specs/2026-11-11-ramslok-planlegging-design.md` — read before every task.

## Global Constraints

- UI Norwegian bokmål; code/comments/identifiers English. Reuse admin `Page`, `LargeTitle`,
  `ResponsiveSheet`, `useToast`, `ActionForm`, `ActionResult` and `callAction` patterns.
- Use the spec's exact table columns, checks, role matrix and error strings. Both worker
  roles have identical rights. Inactive users fail even on own rows; anon has no access.
- Money: integer øre; hourly range 0–1,000,000 inclusive. Missing is null/no row, never zero.
  Snapshot rate at Start; fill a missing snapshot once, owner-only with reason; never reprice
  a non-null snapshot. Existing `profiles_select`/JWT metadata must not carry rates.
- Weeks Monday–Sunday, dates Europe/Oslo. Timestamps `timestamptz(3)`; clock uses
  `date_trunc('milliseconds', now())` in DB. Duration milliseconds, pay rounded per entry/day
  segment half up with numeric/BigInt arithmetic; open entries excluded, never auto-closed.
- Validate calendar dates and unique Oslo wall times; do not assume existing
  `osloLocalToIso()` rejects normalized invalid dates or DST ambiguities. Add feature helpers;
  preserve behavior of existing harvest/market forms. Shifts may cross one local midnight.
- No deletes/cascades or truncate privileges on new tables. Use `planning_no_delete()` on
  all four tables and existing `audit_row_with_old()` unchanged. Every FK to profiles uses
  RESTRICT, including actor fields. Do not modify ledger tables, `next_number()` or old migrations.
- New SQL functions pin `search_path = ''`, qualify relation/function names, revoke default
  execute from `public, anon, authenticated`, grant only listed RPCs. Definer mutation RPCs
  explicitly authorize; invoker reports preserve RLS. No null-identity maintenance bypass,
  client-settable authorization GUCs or trigger-depth shortcuts in new guards.
- Clock table: SELECT only to authenticated, no direct DML; RPC checks and guards enforce
  identity, exact transition and server metadata. Copy/clock/correction transactions are
  atomic. Use stable profile-lock-then-entry-lock ordering, plus DB uniqueness/exclusion.
- Server Actions check role themselves and use `createClient()` (session). Return existing
  discriminated `ActionResult`; use `ActionResult & { id?: string }` only for optional result
  fields. Hidden/missing detail →404; non-owner export →404; no shared personal-data caching.
- New nav items use `tab: false` under phone Mer; preserve existing phone tab count. Add nav
  entries with their implemented pages, not links to future tasks' routes.
- Follow `AGENTS.md`; consult installed Next docs on actions, revalidation, async params/
  searchParams and route handlers before writing the corresponding files. No new packages.
- All reset/database/e2e commands use **local** Supabase and local `.env.local`. Existing
  `tests/e2e/helpers.ts` supplies `adminClient()`/`loginAs()`; service role may create auth
  identities, but new planning fixtures write through authenticated owner/person sessions.
  Retained `E2E ` rows use unique ids/labels; archive/cancel/close, never delete them.
- Stage only each task's named files; do not sweep unrelated workspace changes into commits.
  This plan describes future implementation; the current spec/plan commit contains documents only.

## Review Focus

1. A picker/seller querying another person's rate, shifts, time, assigned tasks or aggregate
   directly, including embedded relations — no data. Profiles and audit log must not leak rates.
2. Definer RPC calls with a forged id/key, no active identity, client time or different person
   — rejected/ignored as specified. Definer execution cannot substitute for authorization.
3. Concurrent Start, same-key retry after close, stale Stop, and owner correction racing with
   Stop — one open row, no wrong row closed, no lost correction, old/new audit retained.
4. Midnight, DST and rate changes — elapsed hours/pay and UI/Excel totals agree exactly;
   unknown rate and open time stay visibly incomplete. No 168-hour UTC week copy.
5. Worker task UPDATE payload carrying hidden field edits, forged completion metadata or a
   stale assignment — cannot change anything except own status to done; completion actor/time
   come from DB. Archive/cancel/delete rules hold via API and direct SQL tests.

---

### Task 1: Shifts and private hourly rates (database first)

**Files:**
- Create: `supabase/migrations/20261111000013_planning_shifts_rates.sql`
- Create: `supabase/tests/planning_shifts_rates.test.sql`
- Modify: `src/lib/errors.ts`, `src/lib/errors.test.ts`

**Interfaces:**
- Produces `work_rates`, `work_shifts` per spec §3.1–3.2, `planning_no_delete()`,
  `work_rates_guard()`, `work_shifts_guard()` and triggers/RLS/grants/audit.
- `planning_oslo_instant(p_local timestamp without time zone) returns timestamptz`:
  strict DB wall-time converter, internal only (no authenticated execute).
- `cancel_work_shift(p_id uuid, p_reason text) returns void`: owner-only security invoker
  RPC, DB-now cancellation through the guard; no timestamp argument.
- `copy_work_week(p_monday date) returns integer`: owner-only security definer RPC;
  next-calendar-week atomic copy, skip existing provenance pairs, return new count.
- Named constraints/indexes: `work_shifts_no_overlap` (23P01),
  `work_shifts_copy_unique` (source/week, non-null source), `work_rates_profile_unique`.
- New mapped messages: `PLANNING_NO_DELETE`, `PLANNING_IMMUTABLE`, `PLANNING_NOT_FOUND`,
  `PLANNING_INACTIVE_PERSON`, `PLANNING_LOCAL_TIME`, `PLANNING_WEEK`, `SHIFT_INTERVAL`,
  `SHIFT_OVERLAP`, `SHIFT_CANCEL_REASON`, `SHIFT_CANCELLED`, `RATE_INVALID` (spec §5).

- [ ] **Step 1: Write pgTAP first.** Use `begin`, extension, `\ir helpers.psql`, explicit
  plan or `no_plan()`, `finish()`, rollback. Create two pickers/two sellers/owner and an
  inactive profile. Fixtures: 2027-03-15 08:00–12:00 Oslo, rates 25000/30000 øre.
  Assertions (descriptive test names, one invariant per assertion):
  - `owner assigns every active role`: picker, seller, owner allowed; inactive rejected
    `PLANNING_INACTIVE_PERSON`. Invalid kind, note 2001 chars, inverted/27-hour interval,
    local end two dates later → check/guard rejection; ≤26h next-local-day accepted.
  - `adjacent shifts allowed, overlapping shifts rejected`: 08–12 and 12–14 pass;
    11–13 fails `work_shifts_no_overlap`/23P01. Cancel 08–12 with 'Feil vakt'; its range
    no longer blocks a replacement; cancelled row stays visible but immutable.
  - `server owns metadata`: forged creator rejected; timestamps replaced by DB time;
    updating id/creator/created_at/provenance rejected; cancellation actor = caller and
    time = DB time; reason ' a ' rejected, 'Feil vakt' accepted; cannot restore.
  - `private rate matrix`: owner reads/sets all; each picker/seller reads own only;
    same-role peer and other worker role cannot read it. Worker writes denied/zero rows
    and unchanged; anon SELECT/DML →42501; inactive sees zero. Own zero rate accepted,
    -1 and 1000001 rejected, 1000000 accepted; owner may rate inactive historical people.
  - `shift matrix`: owner all; each worker own only, including cancelled; worker insert
    →42501 and updates do not change rows; inactive/anon denied as above. Join profiles
    to protected rates/shifts cannot expose another worker's row. No new profile rate column.
  - `copy respects local calendar`: source 2027-03-22 08–12 → target 2027-03-29 08–12
    Oslo, start UTC 07:00Z →06:00Z. Cancelled sources excluded. Retry →0 and same ids;
    edited/cancelled target copies still skipped. New source later adds exactly one copy.
    Source Sunday overnight copies once by start date; preceding Sunday overlap is excluded.
    Non-Monday →`PLANNING_WEEK`; seller/picker call →42501. Target overlap or inactive
    assignee makes all proposed new copies roll back (assert before/after id sets equal).
  - `strict Oslo input`: 2027-03-28 02:30 and 2027-10-31 02:30 →`PLANNING_LOCAL_TIME`;
    copy landing at those values rolls back. Ordinary 2027-03-28 08:00 →06:00Z.
  - `audit and deletion`: rate 25000→30000 and shift note edit preserve old/new, actor;
    insert uses `data.new`. Worker cannot read audit_log. No delete/truncate ACL; owner
    DELETE →42501. With temporary test-only delete grants/policy owner reaches
    `PLANNING_NO_DELETE`; postgres does too. Rate/shift history blocks parent profile deletion.
  - Check RLS enabled, revoked function execute, pinned empty search_path, and guard
    denial with temporary permissive write grants/policies. Missing/inactive identity
    cannot use RPCs. Do not infer security solely from zero affected rows.
- [ ] **Step 2: Run** `npm run db:start` (local), then `npm run test:db` → new suite FAIL
  because tables/functions are missing; existing suites still pass.
- [ ] **Step 3: Implement migration.** Enable `btree_gist` in extensions as supported by
  local Supabase; qualified operator class if required. Tables/checks/indexes, server-set
  metadata guards, no-delete and audit triggers, policies and grants per spec. Revoke
  DELETE/TRUNCATE from service_role as well; do not grant new privileges to anon.
  Strict converter checks round-trip after `AT TIME ZONE 'Europe/Oslo'` and rejects when
  either candidate ±1h has the same Oslo wall value (autumn ambiguity). Check finite
  dates/instants. Source copy fields are preserved immutably, derived/validated against
  source and target Monday; copy serializes source week with advisory lock, uses a
  snapshot of source rows and skips existing provenance pairs before inserting. Preserve
  all-or-nothing behavior; do not catch per-row failures and continue.
- [ ] **Step 4: Write error mapping tests**, then add all listed strings from spec §5.
  Map the named shift exclusion constraint to `SHIFT_OVERLAP`; verify unrelated 23P01
  does not receive the wrong feature message. Rate guard raises `RATE_INVALID` before
  its range check. Tests for anon permission denial expect 42501, not zero rows.
- [ ] **Step 5: Run** `npm run db:reset && npm run test:db && npm test && npx tsc --noEmit`
  → all PASS. Inspect final grants with pgTAP assertions, not just UI behavior.
- [ ] **Step 6: Commit** `git add supabase/migrations/20261111000013_planning_shifts_rates.sql supabase/tests/planning_shifts_rates.test.sql src/lib/errors.ts src/lib/errors.test.ts && git commit -m "feat(planning): shifts and private rates with guards, RLS and audit"`

---

### Task 2: Clock, reasoned corrections and invoker daily reports

**Files:**
- Create: `supabase/migrations/20261111000014_planning_time.sql`
- Create: `supabase/tests/planning_time.test.sql`
- Modify: `src/lib/errors.ts`, `src/lib/errors.test.ts`

**Interfaces:**
- Produces `time_entries`, `time_entries_guard()`, RPCs and report in spec §3.3/3.7.
- SQL signatures:
  - `clock_in(p_start_key uuid) returns public.time_entries`
  - `clock_out(p_entry_id uuid) returns public.time_entries`
  - `correct_time_entry(p_id uuid, p_started_at timestamptz, p_ended_at timestamptz, p_reason text, p_expected_version bigint, p_fill_missing_rate boolean default false) returns public.time_entries`
  - `planning_daily(p_from date, p_to date) returns table(profile_id uuid, work_date date, source_kind text, source_id uuid, duration_ms bigint, hourly_rate_ore integer, amount_ore bigint)`
- `time_entries_one_open` partial unique, `time_entries_start_key_unique`,
  `time_entries_no_overlap` exclusion. Add linked-time reassignment check to the shift
  guard in this new migration; do not rewrite migration 13.
- Messages: `SHIFT_HAS_TIME`, `TIME_ALREADY_OPEN`, `TIME_OVERLAP`, `TIME_INTERVAL`,
  `TIME_REASON`, `TIME_RATE`, `PLANNING_PERIOD`, `PLANNING_STALE`, existing immutable/not-found/42501.

- [ ] **Step 1: Write pgTAP first**, including all time-table role matrix cells and:
  - `all active roles clock themselves`: picker/seller/owner each create own open entry;
    assert started_at = transaction DB time at millisecond precision, ended_at null,
    self person, matched shift and snapshot. RPC has no person/timestamp/rate arguments.
  - `clock linking boundaries`: shift starts exactly now links; shift ends exactly now,
    cancelled shift and another person's shift do not. Test no shift →null. Change/cancel
    linked shift and correct entry start outside it →same immutable link. Changing its
    assignee →`SHIFT_HAS_TIME`; unlinked shift reassignment still allowed.
  - `one open and idempotent key`: same caller/key returns same row; new key while open
    →`TIME_ALREADY_OPEN`; same key after Stopp returns original closed row with no audit
    insert. Different people may use same key. Test exact partial unique definition and
    23505 through a test-only direct-DML grant with guards still active.
  - `stop targets self id`: guessed/missing/another worker id all `PLANNING_NOT_FOUND`,
    including owner trying to use Stopp on someone else. First end = DB now; retry
    preserves end/audit count. Stop old closed id after a new Start does not close new id.
  - `version prevents stale correction`: insert version1, actual stop/correction increments;
    caller-supplied version overwritten/rejected. Mismatched expected version
    →`PLANNING_STALE`, row/audit unchanged. Retry requires re-reading/reviewing current values.
  - `corrections require owner and fresh reason`: workers →42501; owner can change start/
    end, close forgotten row, reopen or zero it. Whitespace/2 chars →`TIME_REASON`;
    3/500 chars allowed, 501 rejected. Future/nonfinite timestamps or end<start
    →`TIME_INTERVAL`; overlap →`TIME_OVERLAP`; second open rejected. Profile/key/link/
    created metadata immutable. Normal Stopp preserves prior correction metadata.
  - `snapshot is historical`: Start at rate 25000; owner sets current 30000; snapshot
    still 25000. No rate →null; zero →0. Missing snapshot fill chooses current 30000
    and logs old null/new 30000 with reason; no current rate or replacing non-null
    →`TIME_RATE`. Guard rejects an arbitrary supplied rate even under temporary grants.
  - `forgotten strict threshold`: fixture start=now_ms−14h false; now_ms−14h−1ms true;
    closed false. Use reasoned owner corrections, not disabled guards. No auto-close.
  - `daily exact reports`: 2026-03-31T21:30Z–2026-03-31T22:30Z (Oslo 23:30–00:30)
    at 25000 gives March 31 and April 1 each 1800000ms/12500 øre; querying March
    excludes April. Two 1-minute entries at rate 10000 yield 167+167=334 øre, not 333.
    Spring 2026-03-29T00:30Z–01:30Z gives 3600000ms; autumn
    2026-10-25T00:30Z–01:30Z also gives 3600000ms. Zero entry emits one zero row;
    open rows absent; cancelled shifts absent; null rates remain null amounts.
    Build each historical report fixture with its own authenticated person: clock in,
    then owner-correct into the past with the returned version before the next clock-in.
    These 2026 report dates are historical at authoring time; no future-time bypass.
  - `report respects RLS`: worker gets only own segments, owner all, inactive →42501,
    anon lacks execute. Inverted/null/367-day periods →`PLANNING_PERIOD`; inclusive
    366-day period accepted. No worker names/empty rows for other profiles.
  - `guard is a second boundary`: direct DML normally →42501 for every authenticated
    role. Temporarily grant writes/policies inside rollback transaction, attempt worker
    stop payloads that also change start/rate/profile/shift/key/metadata, verify rejection
    or server overwrite of metadata with unchanged business values. No identity bypass.
    New snapshot cannot be arbitrary; audit old/new timestamps/reason/actor match.
    Delete trigger blocks postgres and owner with temporary grant; parent deletion restricted.
- [ ] **Step 2: Run** `npm run test:db` → new suite FAIL.
- [ ] **Step 3: Implement migration and messages** per interfaces/spec. Clock RPCs take
  profile `FOR NO KEY UPDATE`, then entry `FOR UPDATE`; corrections resolve target profile,
  take locks in that same order and recheck. RPCs explicitly check active role and
  ownership before mutation; no HTTP/server/client time accepted. Correct RPC validates
  the reason argument each call, including when it equals an earlier reason.
  Guard initializes/increments the server version. Correction checks expected version
  under the entry lock before updating; never silently reopen after a concurrent Stopp.
  Guard distinguishes self Stop (only end changes; preserve all correction fields) from
  owner correction (reason, server actor/time, only permitted fields; null rate fill must
  equal current work_rates value). Do not authorize using current_user or a custom GUC.
  Return retries before issuing an UPDATE, keeping original metadata and audit unchanged.
  Serialize profile-level writers, but keep partial unique and exclusion constraints.
  Shift selection at clock-in is a single snapshot; lock a matched row for share while
  recording the immutable link. SQL report builds each Oslo midnight independently and
  intersects ranges, uses numeric multiplication/rounding and returns bigint amounts.
- [ ] **Step 4: Run** `npm run db:reset && npm run test:db && npm test && npx tsc --noEmit`
  → all PASS. Concurrency is exercised with independent authenticated connections in
  Task 6; pgTAP verifies structural constraints and sequential retry semantics here.
- [ ] **Step 5: Commit** `git add supabase/migrations/20261111000014_planning_time.sql supabase/tests/planning_time.test.sql src/lib/errors.ts src/lib/errors.test.ts && git commit -m "feat(planning): server clock, audited corrections and private daily reports"`

---

### Task 3: Task board storage and worker completion guards

**Files:**
- Create: `supabase/migrations/20261111000015_planning_tasks.sql`
- Create: `supabase/tests/planning_tasks.test.sql`
- Modify: `src/lib/errors.ts`, `src/lib/errors.test.ts`

**Interfaces:**
- Produces `work_tasks`, `work_tasks_guard()` and policies/checks/indexes/audit/delete
  triggers per spec §3.4–3.6. Owner-only `archive_work_task(p_id uuid) returns void`
  is security invoker, uses DB now and treats repeat archive as a no-op. No worker-facing
  full-board RPC or definer SELECT view.
- Messages: `TASK_ARCHIVED`, `TASK_COMPLETION_ONLY`; reuse inactive/immutable/42501.
- All authenticated have S/I/U grants; RLS owner I, owner-or-assigned U with both USING
  and WITH CHECK, owner-or-assigned S. Guard narrows worker U to own status→done.

- [ ] **Step 1: Write pgTAP first.** Tests named after each rule:
  - `owner manages all fields`: inserts unassigned task, assigns any active role,
    changes title/description/due/important/status, clears assignee, completes/reopens,
    archives. Title empty/201, description 10001 and unknown status rejected. Forged
    completion/archive metadata is rejected or overwritten; stored pairs are always
    consistent. Assign inactive →`PLANNING_INACTIVE_PERSON`.
  - `workers read assigned only`: two users of each worker role see own assigned task,
    no other worker's task, no unassigned/archived task; inactive sees zero, anon →42501.
    Worker insert →42501. Owner sees archived and unassigned; worker audit access empty.
  - `worker done only`: todo→done and in_progress→done allowed for each role; done actor
    is caller, time DB now; spoofed completion/update timestamp is overwritten. Repeated
    done preserves metadata. Worker cannot set in_progress, reopen, edit title/description/
    assignee/due/important/creation/archive fields, or combine those with status→done.
    Check row unchanged, including after zero-row RLS rejection on someone else's id.
  - `stale completion denied`: reassign/unassign/archive as owner, then original worker
    UPDATE affects zero rows; no completion stamped. Done by owner stamps owner, not assignee.
    Owner reopen clears completion; audit preserves original completion actor/time.
  - `archive terminal`: archive RPC owner-only, DB time, repeat no-op; preserves all business/completion fields; cannot restore or
    edit. Archived tasks assigned to a later-inactive person remain owner-readable.
  - `second boundary and history`: permissive test-only policy still cannot bypass
    worker whitelist or forge actor/creation metadata. Audit old/new on assignment,
    status and archive; owner id/created_by/created_at edits rejected. New tasks cannot
    start archived and completion metadata follows status. No DELETE/TRUNCATE grants; delete blocker for owner/postgres
    with temporary grants; FK restricts parent deletion; function execute revoked.
- [ ] **Step 2: Run** `npm run test:db` → new suite FAIL.
- [ ] **Step 3: Implement migration.** Compare NEW/OLD JSON excluding only the explicitly
  permitted worker status and server completion/update fields; reject every other change.
  Check caller/current assignment before transition. Never use a blacklist of just known
  sensitive fields. Archived rows fail before other transitions. All metadata is server-set;
  owner status transitions enforce completion pairing. No-op done must preserve actor/time;
  return null from trigger for an unchanged repeated completion to avoid an audit update.
- [ ] **Step 4: Add error tests/mappings** from spec, then run
  `npm run db:reset && npm run test:db && npm test && npx tsc --noEmit` → all PASS.
- [ ] **Step 5: Commit** `git add supabase/migrations/20261111000015_planning_tasks.sql supabase/tests/planning_tasks.test.sql src/lib/errors.ts src/lib/errors.test.ts && git commit -m "feat(planning): owner task board with guarded worker completion and archive"`

---

### Task 4: Pure Oslo schedule, duration, rate and pay logic

**Files:**
- Create: `src/lib/domain/planning.ts`, `src/lib/domain/planning.test.ts`
- Consume without modifying: `src/lib/domain/time.ts`, `money.ts`, `periods.ts`

**Interfaces:**
```ts
export type ShiftKind = 'harvest' | 'packing' | 'market' | 'other'
export const SHIFT_LABEL: Record<ShiftKind, string>
export type TaskStatus = 'todo' | 'in_progress' | 'done'
export const TASK_STATUS_LABEL: Record<TaskStatus, string>
export function parseHourlyRate(input: string): number | null // 0..1_000_000 øre; empty invalid
export function parseMonth(value: string | null): { from: string; to: string } | null
export function weekPeriod(today: string): { from: string; to: string } // Monday..Sunday
export function nextWeekMonday(monday: string): string
export function strictOsloLocalToIso(local: string): string | null // real, unique wall minute only
export function shiftInterval(date: string, start: string, end: string, nextDay: boolean): { startsAt: string; endsAt: string } | null
export type DaySegment = { date: string; durationMs: number }
export function splitAtOsloMidnight(start: string, end: string): DaySegment[]
export function segmentPayOre(durationMs: number, rateOre: number | null): number | null
export function isForgotten(start: string, end: string | null, nowMs: number): boolean
export function isTaskOverdue(dueDate: string | null, status: TaskStatus, archived: boolean, today: string): boolean
export type PlanningSegment = { profileId: string; date: string; sourceKind: 'shift' | 'time'; sourceId: string; durationMs: number; rateOre: number | null; amountOre: number | null }
export function summarizePlanning(rows: PlanningSegment[]): { plannedMs: number; workedMs: number; plannedAmountOre: number; workedAmountOre: number; missingPlannedRateCount: number; missingWorkedRateCount: number }
```

BigInt intermediates do not leave the helper/server boundary; output numbers must be safe
integers. Report bigint strings are validated/mapped in queries before reaching helpers.
Zero time returns one zero segment dated by its start. Midnight boundaries can be converted
even on DST days; only changed user wall-minute inputs require unique-offset validation.

- [ ] **Step 1: Write Vitest** with exact cases/assertions:
  - rates `'250,50'`→25050, `'250.5'`→25050, `'0'`/`'0,00'`→0, `'10 000'`→1000000;
    `''`, `'-1'`, `'12,345'`, `'1.234,50'`, `'10000,01'`→null. Never reuse
    `parseKrOrZero('')` because it silently treats unset as zero.
  - `weekPeriod('2027-01-01')`→`{from:'2026-12-28',to:'2027-01-03'}`;
    `nextWeekMonday('2027-03-22')`→`'2027-03-29'`; invalid/non-Monday input rejected.
    `parseMonth('2028-02')`→Feb 1–29; `'2027-13'`, `'2027-2'`, null→null.
  - strict local invalid date `2027-02-30T10:00`, `24:00`, gap `2027-03-28T02:30`,
    repeated `2027-10-31T02:30`→null; `2027-03-28T08:00`→`2027-03-28T06:00:00.000Z`.
    Shift 2026-03-31 23:30–00:30 nextDay true→21:30Z–22:30Z; false→null.
  - split/pay fixtures identical to Task 2: midnight gives two 1800000ms/12500 segments;
    spring/fall 3600000ms; 1 minute at 10000→167; two segments→334; 18ms at 100000
    →1 øre (half up); 0 duration/rate→0, null rate→null. Clamp by selected period after
    splitting, never assign the whole entry to its start month.
  - summarize one shift 7200000ms/current rate30000, two worked 60000ms/rate10000,
    one worked 3600000ms/null: plannedMs7200000, workedMs3720000,
    plannedAmountOre60000, workedAmountOre334, missingWorkedRateCount1.
  - forgotten exactly14h false,14h+1ms true, closed false; due today not overdue,
    yesterday todo/in_progress true, done/archived/null due false.
- [ ] **Step 2: Run** `npx vitest run src/lib/domain/planning.test.ts` → FAIL.
- [ ] **Step 3: Implement** only pure helpers, exact arithmetic and defensive input checks;
  reuse formatting/conversion primitives without altering older callers.
- [ ] **Step 4: Run** `npm test && npx tsc --noEmit` → all PASS.
- [ ] **Step 5: Commit** `git add src/lib/domain/planning.ts src/lib/domain/planning.test.ts && git commit -m "feat(planning): Oslo intervals, private-rate parsing and exact pay helpers"`

---

### Task 5: Users-page rates and Vaktplan screens

**Files:**
- Modify: `src/app/admin/(app)/users/page.tsx`, `actions.ts`
- Modify: `src/features/admin/ui/nav-items.ts`, `nav-items.test.ts`
- Create: `src/app/admin/(app)/users/actions.test.ts` (extend if already present)
- Create: `src/app/admin/(app)/vaktplan/page.tsx`, `actions.ts`, `actions.test.ts`
- Create: `src/features/planlegging/queries.ts`, `ShiftForm.tsx`, `WeekSchedule.tsx`,
  `MyShifts.tsx`, `RateSheet.tsx`
- Create: `tests/e2e/planning-shifts.spec.ts`, `tests/e2e/planning-helpers.ts`

**Interfaces:**
```ts
// users/actions.ts
export async function setHourlyRate(form: FormData): Promise<ActionResult> // profile_id, rate (kr)
// vaktplan/actions.ts, owner only
export async function saveShift(form: FormData): Promise<ActionResult & { id?: string }>
// id (stable UUID), profile_id, date, start, end, next_day, kind, note; existing id = edit
export async function cancelShift(id: string, reason: string): Promise<ActionResult>
export async function copyWeek(monday: string): Promise<ActionResult & { copied?: number }>
// queries.ts ('server-only'), session client, typed result objects
export async function getMyShifts(monday: string): Promise<MyShiftWeeks> // current+next, clipped totals
export async function getWeekSchedule(monday: string): Promise<WeekScheduleData> // owner check
export async function getCurrentRates(): Promise<VisibleRate[]> // RLS; no profile-wide payload
```

`MyShiftWeeks`, `WeekScheduleData`, `VisibleRate` are exported feature types: shifts contain
ids/person/start/end/kind/note/cancel state; week groups carry segment totals; owner schedule
includes active profiles plus inactive profiles with records. UI never filters an already
downloaded all-person dataset for a worker. All actions use `requireRole` and session client.
`saveShift` selects existing id via RLS and distinguishes create/edit; retry same create id
with identical payload returns success, different payload is a conflict, not an overwrite.

- [ ] **Step 1: Unit/action tests first.** Every owner mutation rejects workers; malformed
  id/kind/date/rate returns spec error; no rate written to profiles/admin client. Nav gives
  all roles Vaktplan/calendar/non-tab. Copy calls only `copy_work_week`, never loops server
  actions. Cancel calls `cancel_work_shift(id, reason)` with no client timestamp.
  DB errors retain input; no optimistic success. Failed copy includes "Ingen
  vakter ble kopiert.". Snapshot-rate explanation is on Brukere.
- [ ] **Step 2: Phone e2e first.** Set `test.use({ viewport: { width: 390, height: 844 } })`.
  Authenticated owner sets own/picker/seller rates 0/250/300 kr; create uniquely identified
  shifts this/next week, all types and overnight. Worker sees own rows/totals only, owner
  grid one row per person. Cancel reason required, cancelled excluded from totals. Edit
  note shows audit old/new in detail sheet. Copy previews dates, copies once, retry skips;
  a target conflict yields no partial copy. Worker URL `/admin/users` denied; direct action
  rejected. New fixture helpers create unique users with auth admin, authenticate them,
  then write planning data with their sessions; no guard-disabling fixtures.
- [ ] **Step 3: Run** `npx vitest run 'src/app/admin/(app)/users/actions.test.ts' 'src/app/admin/(app)/vaktplan/actions.test.ts' src/features/admin/ui/nav-items.test.ts`
  and `npm run test:e2e -- planning-shifts` → new assertions FAIL.
- [ ] **Step 4: Implement** queries/actions/forms/screens per spec §4.1/4.4. Read installed
  Next docs before action/searchParams use. Use `.upsert` with conflict on profile_id for
  rates, no service-role rate access. Fetch current rate values separately from profiles.
  Revalidate `/admin/users`, `/admin/vaktplan`, `/admin/timer` after rate edits; shift edits
  revalidate schedule/hours. Add only Vaktplan nav now; future Stemple links arrive Task 6.
  Schedule queries select intervals intersecting the week, including a preceding overnight
  start; copy selects start dates within its source week. Keep week grid horizontal scrolling inside container and responsive edit sheets.
- [ ] **Step 5: Run** `npm test && npx tsc --noEmit && npm run test:e2e -- planning-shifts`
  → PASS. Verify existing users invite/active controls still work.
- [ ] **Step 6: Commit** stage only named users/vaktplan/feature/nav/test files, then
  `git commit -m "feat(planning): users hourly rates and role-scoped shift scheduling"`.

---

### Task 6: Phone clock, owner corrections and concurrency flows

**Files:**
- Create: `src/app/admin/(app)/stemple/page.tsx`, `actions.ts`, `actions.test.ts`
- Create: `src/app/admin/(app)/timer/[id]/page.tsx`, `actions.ts`, `actions.test.ts`
- Create: `src/features/planlegging/ClockPanel.tsx`, `TimeCorrectionSheet.tsx`, `TimeHistory.tsx`
- Modify: `src/features/planlegging/queries.ts`, `MyShifts.tsx`
- Modify: `src/features/admin/ui/nav-items.ts`, `icons.tsx`, `nav-items.test.ts`
- Create: `tests/e2e/planning-clock.spec.ts`
- Modify: `tests/e2e/planning-helpers.ts`

**Interfaces:**
```ts
// stemple/actions.ts
export async function startClock(startKey: string): Promise<ActionResult & { entry?: ClockEntry }>
export async function stopClock(entryId: string): Promise<ActionResult & { entry?: ClockEntry }>
// timer/[id]/actions.ts
export async function correctTime(form: FormData): Promise<ActionResult>
// id, expected_version, start/end Oslo inputs, original instants for unchanged fields, reason, fill_missing_rate
// queries.ts
export async function getMyOpenEntry(): Promise<ClockEntry | null>
export async function getTimeEntry(id: string): Promise<TimeEntryDetail | null> // RLS; own/owner
```

`ClockEntry` has id/version/start/end/shift/rate state; `TimeEntryDetail` includes correction
metadata; history is fetched only for owner. Actions call the corresponding Task 2 RPC,
never session-table writes or a JavaScript timestamp. Unchanged ambiguous existing instant
is preserved only after fetching/comparing DB row, not by trusting a hidden original field.

- [ ] **Step 1: Action tests first.** All active roles Start/Stopp, no person/time/rate
  forwarded; invalid UUID rejected. Corrections owner-only, reason mandatory, unchanged
  sub-minute milliseconds preserved, changed invalid/ambiguous wall times rejected.
  Assert `createAdminClient` never used. Nav Stemple/clock/non-tab all roles; parent
  Timer nav is added in Task 7, but detail route role protection works now.
- [ ] **Step 2: Phone e2e first.** Parameterize all roles: Start→refresh→open→Stopp,
  planned link and unplanned case. Seed forgotten interval via owner correction and see
  warning. Owner correction reason 'Glemte å stoppe' shows old/new and actor; blank
  reason fails; worker own detail read works, correction denied, other's detail 404.
  Explicit zero correction remains recorded. Owner can fill missing snapshot and see
  one audited null→current-rate change, but cannot reprice a non-null snapshot.
- [ ] **Step 3: Add independent-connection race tests** to same e2e file using authenticated
  Supabase clients from planning-helpers (not a single browser action queue):
  - Concurrent `clock_in` with different UUID keys →one success, one TIME_ALREADY_OPEN;
    query count open =1. Same-key race →same id twice, exactly one INSERT audit row.
  - Stop A, Start B, retry Stop A →B remains open. Retry A's start key after close →A
    closed, no new row. UI retry after simulated lost response uses same key/id.
  - Correction of open start racing with Stop: use owner/person connections; after both
    settle, either correction then Stop succeeds with corrected start/end retained, or
    Stop first makes correction return PLANNING_STALE with no silent reopen. Re-read,
    review and resubmit correction when stale. Constraint conflicts likewise fail atomically.
    Concurrent copy calls also produce one target copy per source/week. Do not use sleeps to assert order; inspect final rows.
- [ ] **Step 4: Run** `npx vitest run 'src/app/admin/(app)/stemple/actions.test.ts' 'src/app/admin/(app)/timer/[id]/actions.test.ts' src/features/admin/ui/nav-items.test.ts`
  and `npm run test:e2e -- planning-clock` → FAIL; implement clock/correction/detail UI.
  Stable Start key survives retries until reconciled; buttons pending, refresh on focus/
  conflict. Stop always passes displayed entry id. Add Stemple nav and Mine vakter shortcut.
  History uses existing owner audit access; forms preserve values on failure.
- [ ] **Step 5: Run** `npm test && npx tsc --noEmit && npm run test:e2e -- planning-clock`
  → PASS, including races; close retained test open rows to isolate repeat runs.
- [ ] **Step 6: Commit** stage only named clock/time-detail/feature/nav/test files, then
  `git commit -m "feat(planning): phone clock and audited owner time corrections"`.

---

### Task 7: Weekly/monthly hours, estimated pay and Excel export

**Files:**
- Create: `src/app/admin/(app)/timer/page.tsx`, `eksport/page.tsx`
- Create: `src/app/api/planlegging/export.xlsx/route.ts`, `route.test.ts`
- Create: `src/features/planlegging/HoursOverview.tsx`, `export-data.ts`, `xlsx.ts`, `xlsx.test.ts`, `queries.test.ts`
- Modify: `src/features/planlegging/queries.ts`, `src/features/admin/ui/nav-items.ts`, `nav-items.test.ts`
- Create: `tests/e2e/planning-hours-export.spec.ts`
- Modify: `tests/e2e/planning-helpers.ts`

**Interfaces:**
```ts
// queries.ts / export-data.ts ('server-only')
export async function getHours(period: { from: string; to: string }): Promise<HoursData>
export async function loadHoursExport(month: string): Promise<HoursExportData> // owner only
// xlsx.ts ('server-only')
export async function buildHoursWorkbook(data: HoursExportData): Promise<Uint8Array>
```

`HoursData` maps `planning_daily` rows to PlanningSegment, per-person/overall summary and
separate visible open entries (all open rows, even before period). `HoursExportData`
contains month, closed time segments with person names/current completeness flags, known
amount subtotal, missing snapshot count and open entries. No shift rows in paid Excel lines.
`GET /api/planlegging/export.xlsx?month=YYYY-MM` → workbook/spec headers, Node runtime,
404 signed out/non-owner, 400 invalid month. UI defaults current Oslo week/month using
`todayOslo()`, not browser timezone; owner filter also includes inactive people with records.

- [ ] **Step 1: Workbook/route/query tests first.** Fixtures from Tasks 2/4 plus explicit
  0/missing rate, two same-day entries, inactive person, open entry and empty month:
  - Load output using ExcelJS; Timer headings exactly Person/Dato/Timer/Timesats (kr)/
    Beløp (kr)/Merknad, numeric money/hours cells and
    `#,##0.00`, header frozen/bold, deterministic sorting and filename.
  - March midnight entry includes March row only at 0.5h, rate250, amount125; April
    row appears only in April. Two minute rows rate10000 total 334øre; UI equals file.
  - Missing snapshot cells blank with "Mangler timesats"; known subtotal labelled
    incomplete, explicit zero numeric0; no open entry in paid lines, open entry listed
    in Kontroll; cancelled shift does not change actual amount. Empty Timer headers only.
  - Names beginning `=`, `+`, `-`, `@` are literal string cells, never formula objects;
    no formula cells generated from user content. No floating-point amount drift.
  - Route owner check precedes data loading, non-owner→404, bad month→400 with exact
    Norwegian message; session client only, private/no-store headers. Query maps bigint
    safely and refuses invalid/non-safe values rather than silently truncating.
- [ ] **Step 2: Phone e2e first.** Worker weekly/monthly own planned/worked hours and
  current/snapshot amounts; changing current rate leaves earlier actual pay unchanged.
  Owner sees every person, forgotten/missing-rate counts and inactive history; report
  detail links work, non-owner export page/URL→404. Owner downloads a chosen month,
  opens workbook and compares exact øre totals to visible data. Missing-rate/open warning
  visible before export; empty month valid. Nav Timer/clock/non-tab for all roles.
- [ ] **Step 3: Run** `npx vitest run src/features/planlegging/xlsx.test.ts src/features/planlegging/queries.test.ts src/app/api/planlegging/export.xlsx/route.test.ts`
  and `npm run test:e2e -- planning-hours-export` → FAIL.
- [ ] **Step 4: Implement** report loading/aggregation/UI/workbook/route per spec §3.7,
  §4.3/4.5; reuse exceljs installed already, no package change. Pay values from rounded
  segments, no recalculation from displayed two-decimal hours. Add Timer nav and clock
  shortcut. Preserve no-store/role boundaries on export, never cache a shared rate dataset.
- [ ] **Step 5: Run** `npm test && npx tsc --noEmit && npm run test:e2e -- planning-hours-export`
  → PASS. Export known subtotal equals sum of known line amounts to the øre.
- [ ] **Step 6: Commit** stage only named hours/export/feature/nav/test files, then
  `git commit -m "feat(planning): weekly and monthly hours with private pay and Excel export"`.

---

### Task 8: Oppgaver screens, full verification and hosted migration handoff

**Files:**
- Create: `src/app/admin/(app)/oppgaver/page.tsx`, `actions.ts`, `actions.test.ts`
- Create: `src/features/planlegging/TaskBoard.tsx`, `TaskForm.tsx`, `MyTasks.tsx`
- Modify: `src/features/planlegging/queries.ts`, `src/features/admin/ui/nav-items.ts`,
  `icons.tsx`, `nav-items.test.ts`
- Create: `tests/e2e/planning-tasks.spec.ts`
- Modify: `tests/e2e/planning-helpers.ts`
- Modify: `README.md` (feature roles, rate snapshots, corrections, export limits, deploy order)
- Prepare only, untracked: `deploy-sql/` and `shots/` (already git-ignored; never commit)

**Interfaces:**
```ts
// oppgaver/actions.ts
export async function saveTask(form: FormData): Promise<ActionResult & { id?: string }> // owner, stable id
export async function setTaskStatus(id: string, status: TaskStatus): Promise<ActionResult> // owner
export async function completeTask(id: string): Promise<ActionResult> // own assigned, any role
export async function archiveTask(id: string): Promise<ActionResult> // owner
// queries.ts
export async function getMyTasks(): Promise<WorkTask[]>
export async function getTaskBoard(includeArchived: boolean): Promise<WorkTask[]> // owner
```

Task saves/status/completion use session table writes; archiveTask calls
`archive_work_task(id)` so archive time is also DB now. All calls use the session client;
send only id/business fields, never completion actor/time. For repeated done (guard skips update), completeTask re-reads visible task:
done→success, hidden/missing→`PLANNING_NOT_FOUND`. Stable create id retry with identical
payload succeeds; conflicting payload never silently overwrites.

- [ ] **Step 1: Write action/nav tests and phone e2e first.** Owner creates unassigned
  important task due yesterday, assigns picker, moves through columns, edits, reopens
  and archives. Worker sees only own tasks; no board/create/edit/archive controls;
  "Forfalt" yesterday, not today/done. Worker completion shows DB actor/time to owner.
  Seller same permissions as picker. Stale completion after reassignment/archive fails;
  forged fields in direct action/API request cannot mutate the task. Test descriptions,
  importance and null assignee/due; completed tasks remain until archived. Archived
  read-only filter owner-only. Nav Oppgaver/checklist/non-tab all roles; existing tab
  count unchanged; Mer exposes all new entries. Keyboard controls work without drag/drop.
- [ ] **Step 2: Run** `npx vitest run 'src/app/admin/(app)/oppgaver/actions.test.ts' src/features/admin/ui/nav-items.test.ts`
  and `npm run test:e2e -- planning-tasks` → FAIL; implement screens/actions/query/nav
  per spec §4.6, sort important/date/created/id, pending/retry/error handling.
- [ ] **Step 3: Run** `npm test && npx tsc --noEmit && npm run test:e2e -- planning-tasks`
  → PASS. Audit details remain owner-only; worker never receives full board data.
- [ ] **Step 4: Whole-branch verification** against local Supabase:
  `npm run lint && npx tsc --noEmit && npm test && npm run db:reset && npm run test:db && npm run build && npm run test:e2e`
  → all PASS, including existing harvest/stock/market/ledger/users suites. Fix regressions
  in their owning task's files; do not weaken assertions, RLS or guards to pass tests.
  Check isolated phone views and owner grids in dark/light at 390×844 and 1280×800;
  save screenshots to `shots/`. Inspect overflow, focus, error announcements, reduced motion.
- [ ] **Step 5: Document and prepare deployment.** README explains rate scope, elapsed
  time/rounding, incomplete amounts, no payroll/Regnskap posting and no deletion. Read
  hosted migration history schema through an authorized read-only path before generating
  handoff SQL; otherwise state this as a required preflight in the handoff. Prepare three
  ordered SQL-editor scripts under `deploy-sql/`, each DDL + matching migration-history
  record transaction, versions 20261111000013/20261111000014/20261111000015.
  Owner runs scripts as before; this task prepares the handoff without hosted mutations. App deploy follows schema. Retain schema on app rollback.
  List smoke checks owner/picker/seller, but do not add notifications or new env vars.
- [ ] **Step 6: Inspect** `git diff --check` and `git status --short`; confirm only intended
  task files are staged, scripts/screenshots ignored, branch `planlegging`, no push/merge.
  Stage named Oppgaver/feature/nav/tests/README files, then
  `git commit -m "feat(planning): assigned tasks, owner board and verified deployment handoff"`.
