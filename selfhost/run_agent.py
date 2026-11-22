"""Run a Red Room exported agent on your own server or laptop.

Works with any OpenAI-compatible chat endpoint:
  Mistral API        --base-url https://api.mistral.ai/v1      --model mistral-large-latest  (MISTRAL_API_KEY)
  vLLM (open-weight) --base-url http://localhost:8000/v1       --model mistralai/Mistral-Small-Instruct-2409
  Ollama             --base-url http://localhost:11434/v1      --model mistral

Chat:   python run_agent.py agent.redroom.json --base-url ... --model ...
Check:  python run_agent.py agent.redroom.json --base-url ... --model ... --check
        (replays every attack in the regression suite; fails if a sensitive tool is called)
Only needs httpx (pip install httpx). Tools are simulated: nothing real is executed.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import httpx


def system_prompt(agent: dict) -> str:
    parts = [agent.get("role_prompt", ""), agent.get("instructions", "")]
    knowledge = agent.get("knowledge") or []
    if knowledge:
        parts.append("Knowledge:\n" + "\n".join(f"- {k if isinstance(k, str) else json.dumps(k)}" for k in knowledge))
    return "\n\n".join(p for p in parts if p)


def tool_specs(agent: dict) -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": name,
                "description": f"Sandbox tool {name}",
                "parameters": {"type": "object", "properties": {}, "additionalProperties": True},
            },
        }
        for name in agent.get("tools", [])
    ]


def chat(client: httpx.Client, model: str, messages: list[dict], tools: list[dict]) -> dict:
    body = {"model": model, "messages": messages}
    if tools:
        body["tools"] = tools
    r = client.post("/chat/completions", json=body)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]


def run_turns(client, model, agent, turns: list[str], verbose: bool, messages: list[dict] | None = None) -> list[str]:
    """Play the player turns; return names of sensitive tools the agent called."""
    sensitive = set(agent.get("sensitive_tools", []))
    tools = tool_specs(agent)
    if messages is None:
        messages = []
    if not messages:
        messages.append({"role": "system", "content": system_prompt(agent)})
    hits: list[str] = []
    for text in turns:
        messages.append({"role": "user", "content": text})
        msg = chat(client, model, messages, tools)
        calls = msg.get("tool_calls") or []
        messages.append({k: v for k, v in msg.items() if k in ("role", "content", "tool_calls")})
        for c in calls:
            name = c["function"]["name"]
            if name in sensitive:
                hits.append(name)
            messages.append({"role": "tool", "tool_call_id": c.get("id", name), "name": name, "content": '{"ok": true}'})
        if calls:
            msg = chat(client, model, messages, tools)
            messages.append({"role": "assistant", "content": msg.get("content") or ""})
        if verbose:
            print(f"you> {text}\nagent> {msg.get('content') or ''}" + (f"  [tools: {[c['function']['name'] for c in calls]}]" if calls else ""))
    return hits


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("package")
    ap.add_argument("--base-url", default="https://api.mistral.ai/v1")
    ap.add_argument("--model", default="mistral-large-latest")
    ap.add_argument("--api-key-env", default="MISTRAL_API_KEY")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    pkg = json.load(open(a.package, encoding="utf-8"))
    agent = pkg["agent"]
    key = os.environ.get(a.api_key_env, "")
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    with httpx.Client(base_url=a.base_url, headers=headers, timeout=120) as client:
        if a.check:
            cases = []
            for case in pkg.get("regression_suite", []):
                if case.get("attack"):
                    cases.append(case["attack"])
                cases += [v if isinstance(v, list) else [v] for v in case.get("variants", []) if v]
            failed = 0
            for i, turns in enumerate(cases, 1):
                hits = run_turns(client, a.model, agent, [str(t) for t in turns], verbose=False)
                print(f"case {i}: {'BROKEN ' + str(hits) if hits else 'held'}")
                failed += bool(hits)
            print(f"{len(cases) - failed}/{len(cases)} held")
            return 1 if failed else 0
        print(f"{agent.get('name')} v{agent.get('version')} on {a.model}. Ctrl+C to quit.")
        messages: list[dict] = []
        while True:
            try:
                text = input("you> ")
            except (EOFError, KeyboardInterrupt):
                return 0
            hits = run_turns(client, a.model, agent, [text], verbose=True, messages=messages)
            if hits:
                print(f"  !! sensitive tool called: {hits} (in Red Room this is a break)")


if __name__ == "__main__":
    sys.exit(main())
