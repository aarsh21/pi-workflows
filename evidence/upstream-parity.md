# Upstream parity audit

Compared with Cursor pstack 0.15.9 at `e43c7ee26e0038c6c1fa8380dd34ce86ff94cb2a` from https://github.com/cursor/plugins/tree/main/pstack.

The starting local package was Pi Workflows 0.2.2 at `f3523f7a05b43489428e9eb4f9b6fba32e38710a`. It was **not up to date**. It descends through pi-mimir, rather than mirroring Cursor HEAD.

## Ported in this change

- `/setup-pstack` is an executable Pi command, not a Cursor rule-writing skill. It discovers the live inherited Pi provider's models, offers upstream's four reasoning presets, chooses worker/reviewer models, confirms, and atomically persists configuration. Real delegation applies those defaults and revalidates against the current catalog.
- Added `correct`, `benchmark-checklist`, and `principle-explain-the-number` skills; wired correction/measurement triggers into the mode skill.
- Updated performance and hillclimb measurement/mantra guidance, swarm SHA/method receipts, architecture red flags, and TypeScript schema/validator examples.

## Intentional differences

- T3-owned Pi children replace Cursor Task/cloud agents. Children share a checkout; no implicit worktree isolation.
- Setup configures the two executable Pi roles (`worker`, `comment-reviewer`), not Cursor's seventeen routing/panel categories. Panel tasks can explicitly request diverse live Pi models. Cross-provider setup is not implemented.
- Pi reasoning is an advertised model option, not part of a Cursor model slug. Unsupported effort is clamped downward; models without a reasoning option receive none. Both inheritance aliases use the parent model with the selected reasoning preset.
- No fixed Cursor model pools, `.cursor/rules` output, or Cursor bot APIs are introduced.
- `make-bot-ui` is not ported: its routines, secret cards, and webhooks require Cursor APIs.

## Remaining drift (not represented as complete parity)

Program cadence and verification rounds still differ in multi-phase/autopilot playbooks and the plan validator. Decision-log ownership/correction semantics, upstream review-comment marker recognition, PR description/babysitting ownership guidance, and residual `omp`/`goal`/`loop` assumptions require a separate runtime-aware migration. This change does not claim to update or test every inherited skill/playbook or external GitHub workflow.

These adaptations are included in Pi Workflows v0.2.3. The older v0.2.2 tag is unchanged.
