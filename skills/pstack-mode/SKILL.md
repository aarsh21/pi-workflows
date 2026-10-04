---
name: pstack-mode
description: Start the p-stack workflow with T3 Code-managed Pi agents. Use for /skill:pstack-mode or /pstack tasks.
disable-model-invocation: true
---

# p-stack mode

Load and follow `../poteto-mode/SKILL.md` in full. Treat its workflow, principles, playbooks, and reply rules as the active instructions.

Use the delegate tools described there:

- `pstack_delegate({ task, title?, role?: 'worker' | 'comment-reviewer', model?, options?, clientRequestId? })` starts one async T3-owned Pi child task.
- `pstack_status({ taskId })` reads a task result or current status.
- `pstack_cancel({ taskId, reason? })` cancels a task.
- `pstack_catalog({})` lists the live T3 provider and model catalog.
- `pstack_roles({})` lists bundled roles. `worker` injects `poteto-agent`; `comment-reviewer` injects `comment-sicko`.

`/pstack [task]` is the command-facing alias for the session's p-stack mode. It expands to this skill and then applies the supplied task under the poteto workflow. Do not duplicate the poteto instructions here; update `../poteto-mode/SKILL.md` when the shared workflow changes.
