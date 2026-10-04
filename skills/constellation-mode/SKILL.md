---
name: constellation-mode
description: Pi Constellation branded entrypoint. Enables the poteto workflow for T3 Code-owned Pi delegates via constellation_delegate. Use for /skill:constellation-mode or /constellation tasks.
disable-model-invocation: true
---

# Constellation mode

This is the branded entrypoint for Pi Constellation.

Load and follow `../poteto-mode/SKILL.md` in full. Treat its workflow, principles, playbooks, and reply rules as the active instructions.

Use the Constellation delegate tools described there:

- `constellation_delegate({ task, title?, role?: 'worker' | 'comment-reviewer', model?, options?, clientRequestId? })` starts one async T3-owned Pi child task.
- `constellation_status({ taskId })` reads a task result or current status.
- `constellation_cancel({ taskId, reason? })` cancels a task.
- `constellation_catalog({})` lists the live T3 provider and model catalog.
- `constellation_roles({})` lists bundled roles. `worker` injects `poteto-agent`; `comment-reviewer` injects `comment-sicko`.

`/constellation [task]` is the command-facing alias for sticky Constellation mode. It expands to this skill and then applies the supplied task under the poteto workflow. Do not duplicate the poteto instructions here; update `../poteto-mode/SKILL.md` when the shared workflow changes.
