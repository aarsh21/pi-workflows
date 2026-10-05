#!/usr/bin/env python3
"""Real Pi RPC dialogs against live T3, isolated persistent config, then real child execution."""
import hashlib
import json
import os
import pathlib
import queue
import subprocess
import tempfile
import threading

root = pathlib.Path(__file__).resolve().parent.parent
assert os.environ.get("T3_MCP_URL") and os.environ.get("T3_MCP_BEARER_TOKEN"), "Run inside T3 Pi; do not paste credentials."
trace = []
with tempfile.TemporaryDirectory(prefix="pstack-setup-e2e-") as directory:
    env = os.environ.copy()
    env["PSTACK_TEST_AUTH_PATH"] = str(pathlib.Path(env.get("PI_CODING_AGENT_DIR", str(pathlib.Path.home() / ".pi/agent"))) / "auth.json")
    env["PI_CODING_AGENT_DIR"] = directory
    path = pathlib.Path(directory) / "pstack-config.json"

    def invoke(answers, confirm=True, current=None):
        proc = subprocess.Popen(["pi", "--mode", "rpc", "--no-session", "--no-extensions", "--extension", str(root / "extensions/pstack/index.ts")],
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=directory, env=env)
        records = queue.Queue()
        threading.Thread(target=lambda: [records.put(line) for line in proc.stdout], daemon=True).start()
        def send(value):
            proc.stdin.write(json.dumps(value) + "\n")
            proc.stdin.flush()
        send({"id": "setup", "type": "prompt", "message": "/setup-pstack"})
        step = 0
        try:
            while True:
                record = json.loads(records.get(timeout=35))
                trace.append(record)
                if record.get("type") == "extension_ui_request":
                    method = record["method"]
                    reply = {"type": "extension_ui_response", "id": record["id"]}
                    if method == "select":
                        if current:
                            expected = current[step]
                            assert expected in record["title"], record
                        answer = answers[step]
                        step += 1
                        if answer is None:
                            reply["cancelled"] = True
                        else:
                            value = answer(record["options"]) if callable(answer) else answer
                            assert value in record["options"], record
                            reply["value"] = value
                        send(reply)
                    elif method == "confirm":
                        reply["confirmed"] = confirm
                        send(reply)
                    elif method == "notify":
                        assert record.get("notifyType") != "error", record
                        if "Saved pstack" in record["message"] or "cancelled" in record["message"]:
                            break
                # Pi acknowledges prompts before completing the command; wait for its notification.
        finally:
            proc.stdin.close()
            proc.wait(timeout=10)
            stderr = proc.stderr.read()
            assert proc.returncode == 0, stderr
            assert "Failed to load extension" not in stderr, stderr
        return step

    worker = []
    reviewer = []
    def pick_worker(options):
        selected = next(value for value in options if value not in ("inherit-parent", "auto") and "gpt-5.5" in value)
        worker.append(selected)
        return selected
    def pick_reviewer(options):
        selected = next(value for value in options if value not in ("inherit-parent", "auto", worker[-1]) and "gpt-6.1-sol" in value)
        reviewer.append(selected)
        return selected
    invoke(["small — medium reasoning", pick_worker, pick_reviewer])
    saved = json.loads(path.read_text())
    assert saved == {"version": 1, "budget": "small", "models": {"worker": worker[0], "comment-reviewer": reviewer[0]}}, saved
    before = path.read_bytes()
    # Exercise all presets and aliases through fresh real RPC processes, then restore the paid-test defaults.
    for budget, label in [("unlimited", "unlimited — keep max"), ("large", "large — xhigh reasoning"), ("medium", "medium — high reasoning")]:
        invoke([label, "auto", "inherit-parent"])
        assert json.loads(path.read_text()) == {"version": 1, "budget": budget, "models": {"worker": "auto", "comment-reviewer": "inherit-parent"}}
    invoke(["small — medium reasoning", worker[0], reviewer[0]])
    assert path.read_bytes() == before
    # Restarted processes must show current settings; every cancellation path preserves exact bytes.
    for answers, confirm in [([None], True), (["medium — high reasoning", None], True),
                             (["medium — high reasoning", "auto", None], True),
                             (["medium — high reasoning", "auto", "inherit-parent"], False)]:
        invoke(answers, confirm, ["small", worker[0], reviewer[0]])
        assert path.read_bytes() == before
    invoke(["small — medium reasoning", worker[0], reviewer[0]], current=["small", worker[0], reviewer[0]])
    assert path.read_bytes() == before, "Repeated setup is idempotent."
    env["PSTACK_EVIDENCE_PATH"] = str(root / "evidence/setup-live-children.json")
    result = subprocess.run(["node", "--experimental-strip-types", "scripts/live-e2e.ts"], cwd=root, env=env, text=True, capture_output=True, timeout=600)
    assert result.returncode == 0, result.stdout + result.stderr
    evidence = {"passed": True, "timestamp": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
                "scope": "Real Pi RPC processes and dialogs, live authenticated T3 catalog; no mocked catalog or children. Not GUI/pixel testing.",
                "config": saved, "configSha256": hashlib.sha256(before).hexdigest(),
                "assertions": ["/setup-pstack discovers live models", "two distinct per-role model choices", "all four budget presets and both inheritance aliases", "save confirmation", "persistent settings across fresh Pi processes", "cancel at all four dialogs leaves bytes unchanged", "idempotent rerun", "saved defaults drive real T3-owned children"],
                "sourceSha256": {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root / "extensions/pstack").glob("*.ts"))},
                "dialogs": trace, "childTestOutput": result.stdout}
    (root / "evidence/setup-e2e.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps({"passed": True, "config": saved, "evidence": ["evidence/setup-e2e.json", "evidence/setup-live-children.json"]}, indent=2))
