# Verification evidence

## Current checks

[local-checks.txt](local-checks.txt) records 23 passing tests, TypeScript checking, a real Pi RPC smoke test, and a package check.

The tests cover T3 transport decoding, permission errors, model inheritance, retry keys, role loading, mode commands, shell confirmation, and migrated workflow resources. They also reject legacy backend warnings, brand identity lines, and redundant skill paths in child prompts.

## Real Pi children

[live-e2e.json](live-e2e.json) records a real Pi SDK parent with a deterministic fixture stream and actual T3-owned Pi children. The test omits the model argument and checks that the children use the parent's model.

The worker fixes a broken arithmetic function. The parent reruns its Node test and records the source and file hashes. A report-only reviewer leaves its assigned file unchanged. A third task receives a cancellation request and reaches a terminal interrupted state. The test also checks status retrieval and idempotent request replay.

The children load skills through Pi's installed-package catalog. Their task prompts contain neither an absolute skill directory nor a project identity line. Role instructions still name the skills the worker needs to read. A test uses Pi's actual skill loader and prompt formatter to verify that `poteto-mode` appears in the catalog with its file path. Pi's catalog supplies names, descriptions, and file paths, not every skill's full contents.

The receipt includes SHA256 values for the source files used in the test. Check them with:

```bash
python3 - <<'PY'
import hashlib, json, pathlib
root = pathlib.Path('.')
evidence = json.loads((root / 'evidence/live-e2e.json').read_text())
assert evidence['passed'] is True
for path, expected in evidence['sourceSha256'].items():
    assert hashlib.sha256((root / path).read_bytes()).hexdigest() == expected, path
print('Verified', len(evidence['sourceSha256']), 'source hashes')
PY
```

## GitHub installation and automatic completion

[installed-release.json](installed-release.json) records the current GitHub-installed release test. The parent and child use the same inherited Pi model. The native parent ends its first turn, receives T3's automatic completion notification, and resumes in a second turn. It retrieves the summary only after that notification.

Earlier receipts remain unchanged under [v0.1.0](v0.1.0/), [v0.1.1](v0.1.1/), and [v0.1.2](v0.1.2/). They use the former project and tool names. The initial tests selected a model explicitly. Current tests inherit the parent model.

## Limits

These tests do not cover GUI rendering, every model, or older T3 versions. Role instructions do not enforce read-only access. Children share the checkout. The shell guard requests approval for known command patterns but is not a sandbox or a complete shell parser.

Live tests need authenticated T3 and Pi sessions and make paid model calls. CI runs the offline, RPC, and package checks without those credentials.
