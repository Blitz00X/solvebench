## What changed

<!-- One short paragraph. Link the issue or describe the failing behavior. -->

## Why

<!-- The user-visible problem or the invariant this protects. -->

## Checks

- [ ] `bun run typecheck`
- [ ] `bun test`
- [ ] `bun run verify:docs`
- [ ] `bash scripts/test-installer.sh` (installer changes)
- [ ] Relevant PTY/acceptance script (UI or exercise-flow changes)

## Safety review

- [ ] No credentials, cookies, personal paths or workspace databases are included.
- [ ] The change does not let the model mutate the workspace.
- [ ] Test results remain bound to the solution revision that produced them.
- [ ] Switching the browser selection still does not retarget the opened exercise.
