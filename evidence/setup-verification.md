# Setup verification

## Results

All checks passed on the final working source:

| Check | Result |
| --- | --- |
| `npm test` | 28/28 passing |
| `npm run typecheck` | Passing |
| `npm run test:rpc` | Actual Pi process loads command; standalone setup fails without changing config |
| `npm run check:pack` | 135 packaged files, including setup implementation and new skills |
| `npm run test:setup` | Real Pi RPC dialogs, live authenticated T3 catalog, persisted role models, real children |
| `PSTACK_EVIDENCE_PATH=evidence/inheritance-live-e2e.json npm run test:live` | Real children inherit the parent model without setup |
| `git diff --check` | Passing |

## Evidence chain

1. [Setup dialogs](setup-e2e.json) records real `/setup-pstack` requests and responses. All four reasoning presets and both inheritance aliases were saved through actual RPC processes. Fresh processes displayed stored selections. Cancel at budget, either model, or confirmation preserved exact config bytes. Repeated setup was idempotent.
2. [Configured children](setup-live-children.json) records run `ab05bf42-83da-4541-a69b-862f1b34a140`, real T3 task/thread/run IDs, outgoing requests, source hashes and independently read persisted child configuration.
3. T3 recorded the worker as `openai-codex/gpt-5.5` with `thinking=medium`, and the report-only reviewer as `openai-codex/gpt-6.1-sol` with `thinking=medium`. Delegation calls omitted `model` and `options`; these came from the saved config.
4. The worker changed `sum(a,b)` from subtraction to addition. SHA-256 changed from `45cc1a204464159f963d18a56d1f4f5b2de79cb534bb5912c77c5006bb9356bd` to `d5889be441f078a42bbc3cc5f1e7e556fae06b5011c7c52969bfb32b5b72ef79`. The parent independently reran the fixture test and observed 1/1 passing. The reviewer fixture remained byte-identical.
5. The cancellation fixture returned `cancel_requested`, then reached terminal `interrupted`. Stable retry keys reused the original task IDs.
6. [Unconfigured inheritance](inheritance-live-e2e.json) independently verifies the original parent-model behavior against real children.
7. [Final artifact hashes and test output](setup-checks.json) tie the scripts, implementation and unit tests to these results.

## Scope and limitations

The setup UI was driven through Pi's real RPC dialog protocol, not screenshot/pixel testing of the T3 GUI. The parent SDK stream was deterministic; child processes used real authenticated models and returned actual results. Small-budget reasoning was checked on running children; the other presets were exercised through real setup dialogs and covered by option-resolution unit tests, not separate paid child runs for every model/preset combination.

No finite suite is irrefutable proof of all possible behavior. These are reproducible receipts for the paths listed above, not a claim that every inherited skill, GitHub workflow, model/provider combination or Cursor feature was tested. See [remaining upstream drift](upstream-parity.md).

The normal user config was not changed, and no credentials were copied into the evidence. This source is prepared for v0.2.3; the v0.2.2 tag is unchanged. Published-tag installation evidence is recorded separately after publication.
