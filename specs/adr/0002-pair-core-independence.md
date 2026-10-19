# ADR-0002 — Framework-independent pair-core

**Status:** accepted

`pair-core` contains driver/mode/session/permission/transaction domain logic and has no dependencies on UI, model provider or OpenCode/Pi.

This is necessary so policy enforcement is testable and host-independent.
