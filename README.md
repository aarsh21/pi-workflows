# Pi Constellation

**p-stack workflows, with T3 Code owning your Pi subagents. No Herdr required.**

Constellation keeps the upstream workflow skills, playbooks, principles, and two role prompts. It replaces Herdr-specific delegation with asynchronous, durable T3 child tasks that appear in T3's Agents view. It does not launch detached processes or implement another orchestrator.

```text
T3 Code → Pi + Constellation → T3-owned Pi children → automatic parent wake
```

## Install

Requirements: Pi 1.0+, Node 22+, and a T3 Code version with the native Pi provider and `delegate_task` MCP tools. Enable Pi in T3 Settings and select it for your thread. Your Pi authentication, models, skills, and extensions carry over.

```bash
pi install git:github.com/aarsh21/pi-constellation@v0.1.0
```

Restart the T3 Pi session or run `/reload`. T3 injects its session-scoped MCP transport; do not copy tokens or create a global T3 credential file.

If replacing the casualjim p-stack fork, remove its extension and the Herdr subagent host to avoid conflicting workflow instructions:

```bash
pi remove npm:@casualjim/pi-pstack
pi remove npm:@casualjim/pi-herdr-agents
```

The full workflow uses `set_tasks`, `update_task`, and `list_task`. Keep an existing compatible task tracker, or install the upstream task-tracking package:

```bash
pi install npm:@casualjim/pi-todo-herdr
```

Despite that package's name, Herdr is optional. Its task tools work in Pi/T3 without Herdr. Terminal widgets do not render in T3.

## Use

```text
/constellation Fix the login regression and verify it
/constellation off
/constellation-check
```

`/constellation` enables the workflow for the current session and passes your task to `/skill:constellation-mode`. Mode is restored from the active session branch. `/poteto-mode` remains a compatibility alias. `/constellation-check` checks tool registration, not server health; ask Pi to call `constellation_catalog` to check live availability.

You can also choose a skill from T3's `$` menu, or use:

```text
/skill:architect Design the caching layer
/skill:how Explain authentication
/skill:blast-radius Review what this diff could break
/skill:interrogate Challenge this change
/skill:swarm Investigate independent API modules
```

The adapter exposes five tools:

| Tool | Purpose |
| --- | --- |
| `constellation_catalog({})` | Live T3 provider/model catalog and supported options. |
| `constellation_roles({})` | Bundled `worker` and `comment-reviewer` roles. |
| `constellation_delegate({task, ...})` | Launch one asynchronous Pi child; return `taskId`. |
| `constellation_status({taskId})` | Retrieve a result when needed; never use a polling loop. |
| `constellation_cancel({taskId, reason?})` | Request cancellation and suppress automatic delivery. |

Example model-facing call:

```typescript
constellation_delegate({
  title: "Investigate retries",
  role: "worker",
  task: "Read src/retry.ts and its tests. Explain the regression; do not edit files.",
});
```

The default is the caller's Pi provider instance and model. When the caller is not Pi, one enabled Pi instance and its `default` model are used; ambiguity fails closed. Explicit `model` IDs and `options` must exist in the live catalog. No obsolete model-pool configuration is read.

Each call launches one task. Independent calls may run in parallel. Dependent work starts after the required results arrive. A review round always creates a fresh task with the original brief, prior findings, responses, and unresolved objections. A caller-supplied `clientRequestId` must remain stable across retries of the same request, and must differ for a new task. Generated keys include session/task identity.

## Boundaries

- Run through T3's Pi provider for delegation. Outside T3, workflow skills still load, but delegation fails clearly; there is no fallback to Herdr or background Pi.
- Children get fresh context and share the caller's checkout. Delegation does **not** create worktrees. Partition parallel writes into disjoint scopes.
- Roles are prompt instructions, **not** enforced read-only policies or tool allowlists. T3 permission modes govern child tool calls. Untrusted code and installed extensions still run with your account's access.
- Cancellation is asynchronous. `cancel_requested` acknowledges a request, not completed interruption. A terminal task remains readable.
- The inherited upstream shell guard requests confirmation for recognizable external writes, including common global-option forms. It is a conservative heuristic, **not a shell parser or security sandbox**; indirect commands, scripts, aliases, and non-shell mutation tools are not fully covered. It can also ask about harmless commands. T3's permission controls remain the primary approval mechanism.
- Status widgets and terminal decoration are not reproduced in T3. Child lifecycle/result projection uses T3's existing Agents surface.

## Verification

See [the evidence report](https://github.com/aarsh21/pi-constellation/blob/constellation/evidence/README.md), [real child-run receipts](https://github.com/aarsh21/pi-constellation/blob/constellation/evidence/live-e2e.json), and [native T3 automatic-delivery timeline](https://github.com/aarsh21/pi-constellation/blob/constellation/evidence/native-delivery.json).

```bash
npm ci --ignore-scripts
npm test
npm run typecheck
npm run test:rpc
npm run check:pack
```

To rerun the paid/live integration test, ask a T3-managed Pi agent to run `npm run test:live` from this checkout. Its process must already have T3's session-scoped environment. The test uses a real Pi SDK agent loop with a deterministic parent fixture stream, then launches actual T3-owned Pi model processes. It verifies a real code fix, independently runs the test, checks the report-only fixture, exercises stable retries and cancellation, and writes a JSON receipt. It does not mock child results or claim to test GUI rendering.

`CONSTELLATION_E2E_MODEL` can select an exact authenticated Pi model ID. `CONSTELLATION_T3_BRIDGE` can point to T3's generated Pi bridge when it is not under `~/.t3/caches`. `CONSTELLATION_EVIDENCE_PATH` changes the receipt path. Never publish credentials or general conversation logs.

The separate native smoke test used an actual T3-managed LLM parent and child. The durable T3 timeline proves that the parent ended its first turn, received an automatic completion notification, and began a second turn. One summary retrieval occurred **after** that wake, not in a polling loop.

## License

MIT. Original notices are preserved. See [PROVENANCE.md](PROVENANCE.md) for the source commits and fork relationship. This project is not affiliated with T3 Code, Pi, Cursor, or pi-mimir.
