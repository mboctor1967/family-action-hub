---
description: Systematic debugging workflow. Traces root cause before applying fixes. Use when something is broken and the cause is not immediately obvious. Prevents "quick fix" traps and symptom patching.
argument-hint: "<bug description, error message, or failing test>"
---

# Systematic Debug — $ARGUMENTS

Do not guess. Do not patch symptoms. Trace the root cause.

## Step 1 — Reproduce and Observe

Before touching any code:
- Reproduce the exact failure (run the command, trigger the error)
- Capture the full error output (stack trace, logs, status codes)
- Note what SHOULD happen vs what DOES happen

If you cannot reproduce it, you cannot fix it. Stop and gather more information.

## Step 2 — Root Cause Tracing

Trace BACKWARDS from the symptom to the origin:

1. Start at the error (the line that throws, the assertion that fails)
2. What called that line? Read the caller.
3. What data did the caller pass? Is it correct?
4. Keep tracing backwards until you find where correct data becomes incorrect.

That is the root cause. Not the line that throws — the line where the data first goes wrong.

### Rationalization traps (do NOT fall for these):
- "The fix is obvious, just change this one line" → Trace anyway. Obvious fixes mask deeper issues.
- "It worked before, so the old code is fine" → Something changed. Find what.
- "Let me just add a null check here" → That hides the bug. Why is it null?
- "I'll add a try/catch to handle the error" → That swallows the bug. Why does it throw?
- "Let me just restart/rebuild/clear cache" → If that fixes it, you don't understand it, and it will come back.

## Step 3 — Hypothesis and Test

Before writing the fix:
1. State the hypothesis: "The bug occurs because X does Y when it should do Z"
2. Write a test that fails because of this specific root cause
3. Run the test — confirm it fails for the RIGHT reason
4. Only now write the fix
5. Run the test — confirm it passes

## Step 4 — Defense in Depth

After fixing the root cause, consider: could this class of bug happen elsewhere?

Add validation at the boundaries:
- **Input boundary**: validate data where it enters the system (API request, form submit)
- **Transform boundary**: validate after any data transformation (parsing, mapping)
- **Output boundary**: validate before data leaves (DB write, API response)

You don't need all three. Pick the one or two that would have caught this bug earliest.

## Step 5 — Condition-Based Verification

When verifying async fixes, never use arbitrary waits:

BAD:  `sleep(2000)` then check
GOOD: Poll for the expected condition with a timeout

```
// Wait for actual condition, not arbitrary time
const result = await waitFor(() => db.query(...), { timeout: 5000 })
```

If your test needs a sleep to pass, the test is fragile and will break in CI.

## Output

Report:
- **Root cause**: what was actually wrong and where (file:line)
- **Fix**: what you changed and why
- **Test**: the test that proves the fix
- **Defense**: any boundary validation added
- **Regression**: full test suite still passing (show output)
