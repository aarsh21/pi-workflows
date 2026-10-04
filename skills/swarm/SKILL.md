---
name: swarm
description: "Fan out N parallel workers, drain them, and return one report. Use for /swarm, 'swarm this', or parallel coverage, races, gauntlets, and exploration."
disable-model-invocation: true
---

# Swarm

Fan out N parallel T3-owned Pi workers. They may cover separate slices, race the same brief, or mix both. The parent aggregates delivered results and returns one report.

## Start

Open a todolist with one entry per phase before launching anything.

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape. Partition into slices, race N workers on identical briefs, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning.
3. Set N from the user or derive it from the shape. N is total workers, not a runtime concurrency limit.
4. Pick worker models from `pstack_catalog({})` only when explicit diversity matters. Otherwise omit `model` so T3 inherits the exact parent Pi model; if inheritance is unavailable, fail clearly rather than silently selecting another model. For a model race, name each arm's catalog model ID up front.
5. Give each worker its own writable output when it writes.

## Phase B: Fan out

Spawn all N workers with one `pstack_delegate` call per worker. Independent calls may be launched in parallel. Use `role: 'worker'` unless a workflow names another bundled role. T3 children share the caller checkout and fresh context, so give each task explicit file pointers and prevent concurrent writes to shared paths.

When a worker must start from another branch or a separate worktree, stop and ask for or create that topology in the parent. Do not assume `pstack_delegate` provides branch switching or worktree isolation.

Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, and what to report. Reports use `PASS`, `ISSUES`, or `BLOCKED` with evidence.

If a worker drops out, proceed with N-1 and note it.

## Phase C: Aggregate

Read the terminal results. For coverage, every required slice needs a result. For a race, apply the selection rule declared up front. Use first pass, rank all, or best-of. Do not paste raw worker dumps.

Keep a compact result table, one-line evidenced issues, and explicit gaps or dropouts.

## Phase D: Report

Return one consolidated in-chat report with the table, issue one-liners, gaps or dropouts, and the race rule when used.
