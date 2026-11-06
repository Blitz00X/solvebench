# Current boundaries

- Managed toolchain installation targets Linux x64/arm64. Other platforms need
  preinstalled environments; they receive an explicit setup message.
- Exercism environment preparation supports nine tracks. The catalog includes
  additional tracks, labelled as not yet supported by the environment manager.
- LeetCode Run/Submit requires the user's session and CSRF cookies. Public catalog
  fetching was checked live; authenticated execution is tested with a protocol
  fixture, because no LeetCode account credentials were provided for a live judge.
- CSES support imports the public statement and sample cases and runs them with
  the local language toolchain. It has no CSES login, so it cannot submit, read
  platform completion or verify hidden tests.
- A successful Exercism upload also completes the exercise on the platform — the
  same action as the website's Complete button — which is what unlocks the next
  tasks. The result is still reported as submitted, completion failures are shown
  rather than hidden, and platform test acceptance is never claimed.
- Editor highlighting is lexical, not language-server diagnostics. There is no
  LSP client, semantic code review, coverage report or refactoring engine.
- The assistant is a single OpenAI-compatible HTTP shape. Provider routing,
  fallback chains and per-task model selection are not implemented.
- Chat is in memory. Full session restoration, a transcript browser and saved
  drafts are not implemented; switching the opened task clears its chat.
- Local `testCommand` runs with the user's permissions and inherited
  environment. It is not a sandbox; do not run packages you do not trust.
- Local exercises have no remote submission and no automatic `.in`/`.out`
  pairing. A debugger and an extension marketplace are out of scope for the
  alpha.
- Managed installer download/extraction paths exist for all nine supported tracks.
  The Go missing-tool install-and-test path was exercised live; other installers are
  covered through command/transport fixtures and need broader clean-machine testing.
- Credentials and local task files are owner-local. Never force-add ignored state
  directories to git.
