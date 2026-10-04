#!/usr/bin/env python3
"""Exercise command loading and mode persistence in an actual Pi RPC process."""
import json
import pathlib
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix="pstack-rpc-") as agent_dir:
    env = __import__("os").environ.copy()
    env["PI_CODING_AGENT_DIR"] = agent_dir
    commands = [
        {"id": "commands", "type": "get_commands"},
        {"id": "mode-off", "type": "prompt", "message": "/pstack off"},
        {"id": "check", "type": "prompt", "message": "/pstack-check"},
        {"id": "entries", "type": "get_entries"},
    ]
    result = subprocess.run(
        ["pi", "--mode", "rpc", "--no-session", "--no-extensions", "--extension", str(root / "extensions/pstack/index.ts")],
        input="".join(json.dumps(command) + "\n" for command in commands),
        capture_output=True, text=True, timeout=30, cwd=agent_dir, env=env,
    )
    assert result.returncode == 0, result.stderr
    assert "Failed to load extension" not in result.stderr, result.stderr
    records = [json.loads(line) for line in result.stdout.splitlines() if line]
    responses = {record.get("id"): record for record in records if record.get("type") == "response"}
    assert all(responses[command["id"]]["success"] for command in commands), responses
    names = {command["name"] for command in responses["commands"]["data"]["commands"]}
    assert {"pstack", "pstack-check", "poteto-mode"} <= names, names
    entries = responses["entries"]["data"]["entries"]
    assert any(entry.get("customType") == "pstack-mode" and entry.get("data") == {"enabled": False} for entry in entries), entries
    notifications = [record.get("message", "") for record in records if record.get("type") == "extension_ui_request"]
    assert any("unavailable" in message for message in notifications), notifications
    print(json.dumps({"passed": True, "commands": sorted(names), "modeOffPersisted": True, "outsideT3FailsClosed": True}, indent=2))
