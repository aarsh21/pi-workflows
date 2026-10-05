# Pi Workflows

p-stack workflows for Pi, with T3 Code-managed subagents.

The package adapts upstream workflow skills, playbooks, principles, and two role prompts. It is not a complete mirror of Cursor pstack; see [upstream parity](evidence/upstream-parity.md). T3 Code starts the Pi children, shows them in its Agents view, and notifies the parent when they finish.

## Install

Requirements: Pi 1.0+, Node 22+, and a T3 Code version with the native Pi provider and `delegate_task` MCP tools. Enable Pi in T3 Settings and select it for your thread. Your Pi authentication, models, skills, and extensions carry over.

```bash
pi install git:github.com/aarsh21/pi-workflows@v0.2.3
```

Restart the T3 Pi session or run `/reload`. Pi adds the package's available skill names, descriptions, and paths to the child context. The worker reads the full skill when needed; the task prompt does not repeat the skill directory or a project identity. File lookup uses the installed extension's location, not the developer's working directory. `/pstack` and the `pstack_*` tools keep their names. T3 injects its session-scoped MCP transport; do not copy tokens or create a global T3 credential file.

If replacing the upstream p-stack package, remove it to avoid conflicting workflow instructions:

```bash
pi remove npm:@casualjim/pi-pstack
```

The full workflow also needs a task tracker with `set_tasks`, `update_task`, and `list_task`. Pi Workflows does not bundle a task tracker. Keep an existing compatible one. T3 does not render its terminal widgets.

## Use

Version 0.2.3 adds setup and the partial upstream sync below. Install the versioned Git source above, then run `/reload`.

```text
/setup-pstack
/pstack Fix the login regression and verify it
/pstack off
/pstack-check
```

`/pstack` enables the workflow for the current session and passes your task to `/skill:pstack-mode`. Mode is restored from the active session branch. `/poteto-mode` remains a compatibility alias. `/pstack-check` checks tool registration, not server health; ask Pi to call `pstack_catalog` to check live availability.

### Configure models and reasoning

Run `/setup-pstack` in interactive Pi or T3's RPC session. Pick a budget, choose a live Pi model for `worker` and `comment-reviewer`, then confirm. Choices come from the inherited Pi instance in T3's authenticated catalog, not a hardcoded model list. `inherit-parent` and `auto` resolve to the current parent model; the budget applies to that model too.

| Budget | Highest advertised reasoning at or below |
| --- | --- |
| unlimited | max |
| large | xhigh |
| medium | high |
| small | medium |

If a model has no advertised reasoning control, none is sent. A budget is a reasoning preset, **not** a dollar or token cap. The parent chat model is unchanged. These are Pi's two executable roles, not Cursor's seventeen routing/panel categories.

Settings are atomically saved to `~/.pi/agent/pstack-config.json` (or `$PI_CODING_AGENT_DIR/pstack-config.json`). They apply immediately and across sessions. Reruns display current choices; cancelling any dialog leaves the file unchanged. Remove the file to restore parent inheritance. Explicit delegation `model`/`options` override defaults. Stale models, invalid options, and corrupt config fail clearly rather than silently falling back.

Pi 1.0 command contexts cannot call nested tools. Setup only reads the catalog over T3's injected session-scoped HTTP MCP transport with a 15-second timeout. All child launches still use Pi's nested T3 tool pipeline. No credentials are copied or saved by setup.

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
| `pstack_catalog({})` | Live T3 provider/model catalog and supported options. |
| `pstack_roles({})` | Bundled `worker` and `comment-reviewer` roles. |
| `pstack_delegate({task, ...})` | Launch one asynchronous Pi child; return `taskId`. |
| `pstack_status({taskId})` | Retrieve a result when needed; never use a polling loop. |
| `pstack_cancel({taskId, reason?})` | Request cancellation and suppress automatic delivery. |

Example model-facing call:

```typescript
pstack_delegate({
  title: "Investigate retries",
  role: "worker",
  task: "Read src/retry.ts and its tests. Explain the regression; do not edit files.",
});
```

Without setup configuration, the default is the caller's exact Pi provider instance and model. There is no fixed model or silent fallback. If the caller is not Pi or T3 cannot report its model, default delegation fails clearly instead of picking a different model. An explicitly requested Pi model can still be selected from the live catalog. Explicit `model` IDs and `options` must exist in the live catalog. No obsolete model-pool configuration is read.

Each call launches one task. Independent calls may run in parallel. Dependent work starts after the required results arrive. A review round always creates a fresh task with the original brief, prior findings, responses, and unresolved objections. A caller-supplied `clientRequestId` must remain stable across retries of the same request, and must differ for a new task. Generated keys include session/task identity.

## Boundaries

- Run through T3's Pi provider for delegation. Outside T3, workflow skills still load, but delegation fails clearly; Pi Workflows does not start children outside T3.
- Children get fresh context and share the caller's checkout. Delegation does **not** create worktrees. Partition parallel writes into disjoint scopes.
- Roles are prompt instructions, **not** enforced read-only policies or tool allowlists. T3 permission modes govern child tool calls. Untrusted code and installed extensions still run with your account's access.
- Cancellation is asynchronous. `cancel_requested` acknowledges a request, not completed interruption. A terminal task remains readable.
- The inherited upstream shell guard requests confirmation for recognizable external writes, including common global-option forms. It is a conservative heuristic, **not a shell parser or security sandbox**; indirect commands, scripts, aliases, and non-shell mutation tools are not fully covered. It can also ask about harmless commands. T3's permission controls remain the primary approval mechanism.
- Status widgets and terminal decoration are not reproduced in T3. Child lifecycle/result projection uses T3's existing Agents view.

## Verification

See [the evidence report](https://github.com/aarsh21/pi-workflows/blob/pstack/evidence/README.md), [real child-run receipts](https://github.com/aarsh21/pi-workflows/blob/pstack/evidence/live-e2e.json), and [GitHub-installed release timeline](https://github.com/aarsh21/pi-workflows/blob/pstack/evidence/installed-release.json).

```bash
npm ci --ignore-scripts
npm test
npm run typecheck
npm run test:rpc
npm run check:pack
```

To rerun the paid/live integration test, ask a T3-managed Pi agent to run `npm run test:live` from this checkout. Its process must already have T3's session-scoped environment. The test uses a real Pi SDK agent loop with a deterministic parent fixture stream, then launches actual T3-owned Pi model processes. It verifies a real code fix, independently runs the test, checks the report-only fixture, exercises stable retries and cancellation, and writes a JSON receipt. It does not mock child results or claim to test GUI rendering.

`npm run test:setup` drives real Pi RPC dialogs against the live catalog in an isolated configuration directory, tests restart persistence and cancellation, and then runs real children with different saved role models and reasoning settings. It writes [setup dialog evidence](evidence/setup-e2e.json) and [live child evidence](evidence/setup-live-children.json). Your normal configuration is not changed.

The live suite omits `model` entirely and asserts that children use saved role defaults, or the actual T3 Pi parent's model when unconfigured. It has no model-override environment variable. `PSTACK_T3_BRIDGE` can point to T3's generated Pi bridge when it is not under `~/.t3/caches`. `PSTACK_EVIDENCE_PATH` changes the receipt path. Never publish credentials or general conversation logs.

The separate native smoke test used an actual T3-managed LLM parent and child. The durable T3 timeline proves that the parent ended its first turn, received an automatic completion notification, and began a second turn. One summary retrieval occurred **after** that wake, not in a polling loop.

## License

MIT. Original notices are preserved. See [PROVENANCE.md](PROVENANCE.md) for the source commits and fork relationship. This project is not affiliated with T3 Code, Pi, Cursor, or pi-mimir.
