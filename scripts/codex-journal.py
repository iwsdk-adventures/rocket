#!/usr/bin/env python3
"""Capture Codex session JSONL into an IWSDK Adventures journal.

Project output:
  .codex/journal/session-<sid>.jsonl
  .codex/journal/state/<sid>.json

This intentionally reads and writes only Codex paths.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

TOOL_RESULT_HEAD = 1500
TOOL_RESULT_TAIL = 300
INPUT_STR_MAX = 400

FILE_OP_REDACT = {
    "apply_patch": ("patch",),
    "exec_command": ("cmd",),
    "write_stdin": ("chars",),
}


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def truncate_text(value: str, head: int = TOOL_RESULT_HEAD, tail: int = TOOL_RESULT_TAIL) -> tuple[str, bool]:
    if len(value) <= head + tail + 64:
        return value, False
    return value[:head] + f"\n...[truncated {len(value) - head - tail} chars]...\n" + value[-tail:], True


def load_jsonl(path: Path, offset: int = 0) -> tuple[list[dict[str, Any]], int, bool]:
    size = path.stat().st_size
    reset = offset > size
    if reset:
        offset = 0
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        handle.seek(offset)
        for raw in handle:
            raw = raw.strip()
            if not raw:
                continue
            try:
                rows.append(json.loads(raw))
            except json.JSONDecodeError:
                continue
        new_offset = handle.tell()
    return rows, new_offset, reset


def safe_json(value: str) -> Any:
    try:
        return json.loads(value)
    except Exception:
        return value


def shrink_input(tool_name: str | None, value: Any) -> Any:
    if isinstance(value, str):
        value = safe_json(value)
    if not isinstance(value, dict):
        if isinstance(value, str) and len(value) > INPUT_STR_MAX:
            return value[:INPUT_STR_MAX] + f"...[truncated {len(value) - INPUT_STR_MAX} chars]"
        return value

    redact = set(FILE_OP_REDACT.get(tool_name or "", ()))
    out: dict[str, Any] = {}
    for key, item in value.items():
        if key in redact:
            if isinstance(item, str):
                out[key] = f"<redacted {len(item)} chars>"
            else:
                out[key] = "<redacted>"
        elif isinstance(item, str) and len(item) > INPUT_STR_MAX:
            out[key] = item[:INPUT_STR_MAX] + f"...[truncated {len(item) - INPUT_STR_MAX} chars]"
        else:
            out[key] = item
    return out


def content_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""

    parts: list[str] = []
    for block in content:
        if not isinstance(block, dict):
            continue
        block_type = block.get("type")
        if block_type in ("input_text", "output_text", "text"):
            text = block.get("text")
            if isinstance(text, str):
                parts.append(text)
        elif block_type == "image":
            parts.append("<image>")
    return "\n".join(parts)


def codex_home() -> Path:
    return Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")).expanduser()


def session_id_from_path(path: Path) -> str:
    match = re.search(
        r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$",
        path.stem,
    )
    if match:
        return match.group(1)
    return path.stem


def read_session_id(path: Path) -> str:
    try:
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            for raw in handle:
                try:
                    row = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if row.get("type") == "session_meta":
                    sid = (row.get("payload") or {}).get("id")
                    if sid:
                        return str(sid)
    except OSError:
        pass
    return session_id_from_path(path)


def find_current_session(explicit: str | None = None) -> Path | None:
    if explicit:
        path = Path(explicit).expanduser()
        return path if path.exists() else None

    root = codex_home() / "sessions"
    if not root.exists():
        return None

    thread_id = os.environ.get("CODEX_THREAD_ID")
    if thread_id:
        matches = sorted(root.glob(f"**/*{thread_id}.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
        if matches:
            return matches[0]

    sessions = sorted(root.glob("**/*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
    return sessions[0] if sessions else None


def load_state(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False) + "\n")
    tmp.replace(path)


def load_prior_events(journal_path: Path) -> list[dict[str, Any]]:
    if not journal_path.exists():
        return []
    out: list[dict[str, Any]] = []
    for raw in journal_path.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            event = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if event.get("type") != "session_meta":
            out.append(event)
    return out


def write_journal(path: Path, events: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as handle:
        for event in events:
            handle.write(json.dumps(event, ensure_ascii=False) + "\n")
    tmp.replace(path)


def collect_meta(rows: list[dict[str, Any]], session_id: str, cwd: Path, state: dict[str, Any]) -> dict[str, Any]:
    for row in rows:
        timestamp = row.get("timestamp")
        if timestamp:
            state.setdefault("started_at", timestamp)
            state["updated_at"] = timestamp

        if row.get("type") == "session_meta":
            payload = row.get("payload") or {}
            state.setdefault("started_at", payload.get("timestamp") or timestamp)
            state.setdefault("cwd", payload.get("cwd") or str(cwd))
            state.setdefault("codex_cli_version", payload.get("cli_version"))
            state.setdefault("originator", payload.get("originator"))

        if row.get("type") == "turn_context":
            payload = row.get("payload") or {}
            if payload.get("model"):
                state["model"] = payload.get("model")
            if payload.get("cwd"):
                state.setdefault("cwd", payload.get("cwd"))

    return {
        "ts": state.get("started_at"),
        "type": "session_meta",
        "session_id": session_id,
        "cwd": state.get("cwd") or str(cwd),
        "model": state.get("model"),
        "codex_cli_version": state.get("codex_cli_version"),
        "originator": state.get("originator"),
        "started_at": state.get("started_at"),
        "updated_at": state.get("updated_at"),
    }


def build_events(rows: list[dict[str, Any]], turn: int) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for row in rows:
        timestamp = row.get("timestamp")
        if row.get("type") != "response_item":
            continue

        payload = row.get("payload") or {}
        item_type = payload.get("type")

        if item_type == "message":
            role = payload.get("role")
            if role not in ("user", "assistant"):
                continue
            text = content_text(payload.get("content"))
            if not text:
                continue
            if role == "user" and text.lstrip().startswith("<environment_context>"):
                continue
            text, was_truncated = truncate_text(text)
            event_type = "user_message" if role == "user" else "assistant_text"
            event = {"ts": timestamp, "turn": turn, "type": event_type, "content": text}
            if was_truncated:
                event["truncated"] = True
            events.append(event)

        elif item_type == "function_call":
            tool_name = payload.get("name")
            events.append(
                {
                    "ts": timestamp,
                    "turn": turn,
                    "type": "tool_call",
                    "tool": tool_name,
                    "tool_use_id": payload.get("call_id"),
                    "input": shrink_input(tool_name, payload.get("arguments", {})),
                }
            )

        elif item_type == "function_call_output":
            output = payload.get("output")
            if not isinstance(output, str):
                output = json.dumps(output, ensure_ascii=False)
            output, was_truncated = truncate_text(output)
            event = {
                "ts": timestamp,
                "turn": turn,
                "type": "tool_result",
                "tool_use_id": payload.get("call_id"),
                "result": output,
            }
            if was_truncated:
                event["truncated"] = True
            events.append(event)

    return events


def add_counts(meta: dict[str, Any], events: list[dict[str, Any]]) -> dict[str, Any]:
    meta = dict(meta)
    meta["user_messages"] = sum(
        1 for event in events if event.get("type") == "user_message" and not is_context_user_event(event)
    )
    meta["assistant_messages"] = sum(1 for event in events if event.get("type") == "assistant_text")
    meta["tool_uses"] = sum(1 for event in events if event.get("type") == "tool_call")
    return meta


def is_context_user_event(event: dict[str, Any]) -> bool:
    content = event.get("content")
    if not isinstance(content, str):
        return False
    stripped = content.lstrip()
    return stripped.startswith("# AGENTS.md instructions") or stripped.startswith("<environment_context>")


def seed_current(args: argparse.Namespace) -> int:
    session = find_current_session(args.session_file)
    if not session:
        print("no Codex transcript yet - journal capture will start when one exists")
        return 0

    session_id = read_session_id(session)
    cwd = Path.cwd().resolve()
    state_path = cwd / ".codex" / "journal" / "state" / f"{session_id}.json"
    save_state(state_path, {"transcript_offset": session.stat().st_size, "turn": 1})
    print(f"seeded Codex journal offset for session {session_id} at {session.stat().st_size} bytes")
    return 0


def capture_current(args: argparse.Namespace) -> int:
    session = find_current_session(args.session_file)
    if not session:
        print("no Codex transcript found; nothing captured")
        return 0

    cwd = Path.cwd().resolve()
    session_id = read_session_id(session)
    journal_dir = cwd / ".codex" / "journal"
    state_path = journal_dir / "state" / f"{session_id}.json"
    journal_path = journal_dir / f"session-{session_id}.jsonl"

    state = load_state(state_path)
    offset = int(state.get("transcript_offset") or 0)
    rows, new_offset, reset = load_jsonl(session, offset)
    prior_events = [] if reset else load_prior_events(journal_path)

    turn = int(state.get("turn") or 1)
    meta = collect_meta(rows, session_id, cwd, state)
    new_events = build_events(rows, turn)
    all_events = prior_events + new_events
    meta = add_counts(meta, all_events)

    write_journal(journal_path, [meta] + all_events + [{"ts": iso_now(), "turn": turn, "type": "capture", "source": "codex"}])
    state["transcript_offset"] = new_offset
    state["turn"] = turn + 1
    save_state(state_path, state)

    print(f"captured {len(new_events)} events from Codex session {session_id}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed-current", action="store_true")
    parser.add_argument("--capture-current", action="store_true")
    parser.add_argument("--session-file")
    args = parser.parse_args()

    if args.seed_current:
        return seed_current(args)
    if args.capture_current:
        return capture_current(args)

    parser.error("choose --seed-current or --capture-current")
    return 2


if __name__ == "__main__":
    sys.exit(main())
