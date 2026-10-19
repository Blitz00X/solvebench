# 13 — Security, Privacy and Threat Model

## Assets

- source code;
- secrets/config;
- developer working tree;
- git history;
- provider credentials;
- local command execution capability;
- approval decisions.

## Threats

### T1 Prompt injection in repository text
A README/comment may instruct the agent to run commands or exfiltrate files.

**Mitigation:** repository text is untrusted data. PermissionService owns capabilities. Model text cannot elevate permissions.

### T2 Secret exfiltration
Agent context accidentally includes `.env`, key files or credentials.

**Mitigation:** never-send globs, secret scanner, explicit context preview, redact before serialization.

### T3 Unauthorized mutation
A tool or bug writes despite Human Driver mode.

**Mitigation:** all mutations pass through a single guarded filesystem/patch abstraction; test the invariant.

### T4 Destructive shell
Agent suggests/runs `rm`, reset, clean, migrations, etc.

**Mitigation:** classify commands; Safe Mode deny list; no general mutating shell by default.

### T5 Stale approval
Human approves a patch based on old source state.

**Mitigation:** base revision/content hashes checked at apply time.

### T6 Symlink/path escape
Patch modifies outside repo root.

**Mitigation:** canonicalize paths, resolve symlinks, enforce repository boundary.

### T7 Misleading confidence
Agent fabricates callers/impact.

**Mitigation:** provenance on graph edges and findings; distinguish inference; show unknowns.

### T8 Model provider leakage
Provider logs/stores sensitive code depending on service terms.

**Mitigation:** provider configuration is explicit; local provider support later; context preview and exclusion rules.

## Security design rule

**The model may recommend; deterministic code authorizes.**

## Privacy defaults

- local session/graph storage;
- telemetry off or minimal/opt-in;
- no source content in analytics;
- redact filenames in optional aggregate metrics if possible;
- user can inspect/delete local SolveBench state.
