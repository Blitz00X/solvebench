# Data and execution behavior

SolveBench is a local terminal application. The default assistant is a
deterministic mock, not a real AI service. You can import, edit and test the
bundled Local sample without a model key or exercise-platform account.

## Optional AI requests

When you explicitly configure an HTTP provider and send a chat message,
SolveBench calls your configured OpenAI-compatible `/chat/completions`
endpoint. The request includes:

- The opened exercise's platform, language, identifier, title and statement.
- All loaded solution buffers, including unsaved edits, plus loaded test files.
- The current editor file, solution revision and latest test output, including
  the command, failures and whether the result is stale.
- Up to the latest 20 user/assistant chat messages and a goal if one is set.

Browsing a different task does not change the opened task's AI context. The
assistant has no file-editing tools; it returns text for you to review.

The provider key comes from the environment variable named by `apiKeyEnv`
(default `SOLVEBENCH_API_KEY`). It is sent in the HTTP Authorization header,
not the exercise snapshot. Exercise files, test output and chat text are sent
as their actual contents: do not put secrets in them. There is no general
secret scrubber that makes arbitrary source code or output safe to send.
Your provider's retention, billing and data policies apply. A self-hosted
endpoint still receives the same context.

## Local files

The workspace contains copied/downloaded exercises under `exercises/`, exercise
progress in `.solvebench/solvebench.db`, and any local toolchain files under
`.solvebench/toolchains/`. Provider configuration is read from the workspace's
`solvebench.config.json`, falling back to `$XDG_CONFIG_HOME/solvebench/config.json`
or `~/.config/solvebench/config.json`. Configuration names the key's environment
variable; keep the key value out of the file.

The database stores exercise progress and test counts, not a saved chat
transcript. Chat is in memory and is cleared when switching opened tasks. Full
chat/session restoration is not available. Files and progress survive restart;
save edits before exiting and follow any exit prompt shown by your version.

The Exercism adapter reads `EXERCISM_API_TOKEN`, its isolated CLI configuration,
or an existing user Exercism configuration. Its isolated configuration is under
`.exercism-cli/` by default. LeetCode connection cookies are stored in
`exercises/leetcode/.connection.json`. The adapters set credential files to mode
0600 on Unix. These files are credentials, not encrypted vaults. Do not share
your workspace or include it in a public repository or issue attachment.
Environment overrides can change platform workspace/configuration locations.

## Tests and other network access

F5 runs exercise code with your user permissions. Local `testCommand` inherits
the process environment, including any keys you exported. It can read/write
files, start processes and access the network. Importing a Local folder copies
and validates files; it does not run the test command. Only run packages you
trust. A timeout limits the test's duration; it does not provide a sandbox.

Exercism and LeetCode browsing, downloads, tests or submissions communicate with
their services when those adapters are used. Exercism setup and language
toolchain preparation can download tools/dependencies; installation also
contacts the source/dependency hosts. These requests are separate from AI
requests. The Local adapter does not automatically install a language toolchain.

No application analytics or crash-upload service is configured in this alpha.
This statement does not cover network behavior inside your test command or
dependencies. To remove local data, close SolveBench and delete only the
workspace/configuration you intend to remove; back up solutions first.

For workspaces created before the rename, the previous `.pairharness/` data
directory, `pairharness.config.json`, global `pairharness/config.json`, and
`PAIRHARNESS_API_KEY` remain readable for compatibility. New configuration/key
names take precedence within the same configuration location. Explicit key
names are honored; legacy data is reused when the new data directory is
absent. Existing files are not moved or uploaded by the rename.
