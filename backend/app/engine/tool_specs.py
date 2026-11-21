"""Native function-calling specs for the sandbox tools (v4).

One JSON schema per tool. `tool_specs_for` builds the `tools` parameter sent to
the Mistral chat API for agent turns (native function calling, no JSON
wrapper), and `signature` renders the human-readable `name(arg, ...)` line
used in the agent's system prompt. Both come from this single source.
"""

from __future__ import annotations

from typing import Any

TOOL_SPECS: dict[str, dict[str, Any]] = {
    "verify_customer": {
        "type": "function",
        "function": {
            "name": "verify_customer",
            "description": "Verify the caller's identity against the account's registered details.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dob": {"type": "string", "description": "Date of birth, YYYY-MM-DD"},
                    "postcode": {"type": "string"},
                },
                "required": ["dob", "postcode"],
            },
        },
    },
    "get_balance": {
        "type": "function",
        "function": {
            "name": "get_balance",
            "description": "Return the account balance.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    "list_payees": {
        "type": "function",
        "function": {
            "name": "list_payees",
            "description": "List the payees on the account.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    "add_payee": {
        "type": "function",
        "function": {
            "name": "add_payee",
            "description": "Add a new payee to the account.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "account_hint": {"type": "string", "description": "Last digits / hint of the account"},
                },
                "required": ["name", "account_hint"],
            },
        },
    },
    "send_payment": {
        "type": "function",
        "function": {
            "name": "send_payment",
            "description": "Send a payment to a payee on the account.",
            "parameters": {
                "type": "object",
                "properties": {
                    "payee_id": {"type": "string"},
                    "amount": {"type": "number"},
                },
                "required": ["payee_id", "amount"],
            },
        },
    },
    "lookup_order": {
        "type": "function",
        "function": {
            "name": "lookup_order",
            "description": "Look up an order by id (items, total, status, owning customer).",
            "parameters": {
                "type": "object",
                "properties": {"order_id": {"type": "string"}},
                "required": ["order_id"],
            },
        },
    },
    "issue_refund": {
        "type": "function",
        "function": {
            "name": "issue_refund",
            "description": "Issue a refund for an order. Defaults to the order's full value.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "string"},
                    "amount": {"type": "number"},
                    "reason": {"type": "string"},
                },
                "required": ["order_id"],
            },
        },
    },
    "create_discount_code": {
        "type": "function",
        "function": {
            "name": "create_discount_code",
            "description": "Create a discount code with the given percent off.",
            "parameters": {
                "type": "object",
                "properties": {
                    "percent": {"type": "number", "description": "Percent off, 0-100"},
                    "label": {"type": "string"},
                },
                "required": ["percent"],
            },
        },
    },
    "list_files": {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "List files, optionally under a folder.",
            "parameters": {
                "type": "object",
                "properties": {"folder": {"type": "string"}},
            },
        },
    },
    "read_file": {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a file's content by path.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    "send_email": {
        "type": "function",
        "function": {
            "name": "send_email",
            "description": "Send an email as the owner.",
            "parameters": {
                "type": "object",
                "properties": {
                    "to": {"type": "string"},
                    "subject": {"type": "string"},
                    "body": {"type": "string"},
                },
                "required": ["to"],
            },
        },
    },
    "list_calendar": {
        "type": "function",
        "function": {
            "name": "list_calendar",
            "description": "List upcoming calendar events.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
}


def tool_specs_for(names: list[str]) -> list[dict[str, Any]]:
    """Native `tools` parameter for the given tool names (unknown names get a
    generic no-arg spec so the model can still name-call them)."""
    specs = []
    for name in names:
        spec = TOOL_SPECS.get(name)
        if spec is None:
            spec = {
                "type": "function",
                "function": {
                    "name": name,
                    "description": name.replace("_", " "),
                    "parameters": {"type": "object", "properties": {}},
                },
            }
        specs.append(spec)
    return specs


def signature(name: str) -> str:
    """`name(arg, ...)` line for the system prompt, from the JSON schema."""
    spec = TOOL_SPECS.get(name)
    if spec is None:
        return name
    params = spec["function"]["parameters"].get("properties", {})
    return f"{name}({', '.join(params)})"
