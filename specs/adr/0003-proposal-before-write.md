# ADR-0003 — Proposal-before-write default

**Status:** accepted

Agent-produced code is represented as a proposal/transaction before becoming a real working-tree mutation. Human Driver never grants direct agent mutation.

This creates a review-before-write boundary and makes reject/rollback semantics explicit.
