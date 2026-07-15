# WOD Corpus Scripts

The corpus protects the parse pipeline without paying for an AI call on every run.

## `npm run corpus`

Runs every fixture in `fixtures/wods/*.json` in offline mode.

Offline mode does not call OpenAI. It replays the fixture's cached `aiResponse` through:

`validateParsedWorkout -> postProcessParsedWorkout -> calculateWorkloadBreakdown -> computeHeroResult`

It prints one PASS/FAIL line per fixture, a summary table, and exits `1` if any fixture fails.

## `npm run corpus -- --live`

Runs the same fixtures, but reparses each fixture's `rawText` through OpenAI first.

Use this deliberately to check prompt drift. It never overwrites `aiResponse`. When a live fixture fails, the runner prints cached vs live values for the expected paths.

To limit cost while checking one fixture:

```bash
npm run corpus -- --live --fixture plain-for-time-control
```

Some npm versions on Windows print warnings that `--live` or `--fixture` are unknown npm config values. The runner reads those forwarded config values, so the command is valid if the corpus summary prints.

## `npm run corpus:add -- --file wod.txt --name my-wod`

Creates a new fixture from a raw WOD text file.

This command makes one live OpenAI call, writes `fixtures/wods/my-wod.json`, caches the raw AI response, and adds starter expectations for:

- `format`
- `loggingModes`
- `movementNames`
- `totals.reps`
- `totals.volume`
- `totals.distance`
- `hero.value`
- `hero.unit`

Review and trim the generated `expect` block before committing. Keep fixtures pretty-printed so diffs stay reviewable.

Some npm versions on Windows print similar warnings for `--file` and `--name`; the runner handles those too.
