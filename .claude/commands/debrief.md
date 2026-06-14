---
name: debrief
description: "End-of-session debrief. Scans this conversation for corrections, validations, open threads, and new project context — then writes or updates memory files so the next session starts informed. Run once at the end of any meaningful session."
---

You are performing an end-of-session debrief for the WodBoard project. Your job is to extract what was **non-obvious, corrected, validated, or left open** this session — and persist it to memory so the next session doesn't start cold or repeat mistakes.

## Step 1 — Orient

Run these in parallel:
- `git log --oneline -10` — what commits landed this session
- `git diff HEAD~3..HEAD --stat` — rough scope of what changed
- Read `C:\Users\aboro\.claude\projects\C--Users-aboro-OneDrive-Documents-myapps-wodboard\memory\MEMORY.md` — what's already captured

## Step 2 — Extract findings from this conversation

Scan the full conversation for:

### Corrections (high value)
Moments where the user said "no", "don't", "stop", "that's wrong", "not like that", or redirected your approach. Each correction is a potential **feedback memory**.

### Validations (medium value, often missed)
Moments where the user said "yes", "exactly", "perfect", "keep doing that", or accepted a non-obvious approach without pushback. These confirm judgment calls — save them too, or they'll be second-guessed next session.

### Open threads
Work that was discussed but not finished, known bugs, deferred decisions, or anything the user said "we'll do later." These are **project memories**.

### New project context
Decisions made about architecture, features, priorities, or constraints that aren't derivable from reading the code. **Project memories.**

### New user context
Anything you learned about how the user thinks, their expertise level, or how they want to collaborate. **User memories.**

## Step 3 — Filter ruthlessly

**DO NOT save:**
- Code patterns, file paths, or architecture derivable by reading the codebase
- Git history or what changed (the diff already captures this)
- Debugging solutions already expressed in the code
- Anything already in CLAUDE.md
- Ephemeral task details or conversation summaries
- Trivial back-and-forth

**DO save:**
- Non-obvious rules the user enforced ("never use X for Y because of Z")
- Approaches that were validated after being uncertain
- Open work with enough context that the next session can pick it up
- Constraints or decisions not visible in the code

## Step 4 — Write memories

For each finding that passes the filter:

1. Check if an existing memory file already covers it — if yes, update it instead of creating a duplicate
2. If new, write a file to `C:\Users\aboro\.claude\projects\C--Users-aboro-OneDrive-Documents-myapps-wodboard\memory\` with the correct frontmatter:

```markdown
---
name: feedback_short_slug
description: one-line summary for relevance matching
metadata:
  type: feedback  # or project, user, reference
---

The rule or fact, stated directly.

**Why:** The reason the user gave or the incident that prompted it.
**How to apply:** When this kicks in and what to do.
```

3. After writing all memory files, update `MEMORY.md` — add new entries, update changed ones. Keep each line under ~150 characters. Format: `- [Title](file.md) — one-line hook`

## Step 5 — Report back

Output a compact summary:
- How many memories written / updated
- One line per memory: what it captures and why it matters
- Any open threads the next session should know about

Keep the report under 20 lines. The user doesn't need to read a novel — they need to know the session is safely captured.

---

**Tone:** Be decisive. If something is worth saving, save it. If it's not, skip it silently — don't ask permission for each one. The user's job here is just to type `/debrief`, not to approve every entry.

$ARGUMENTS
