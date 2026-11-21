# Red Room: how it all works (plain English)

Superseded in part by docs/superpowers/specs/2026-11-21-red-room-v4.md (no Guardian, analyst explains but doesn't fix, cooldown, Stripe instead of blockchain).

## The idea in one paragraph

Red Room is a game where people try to trick AI agents into doing something they shouldn't: sending money to a scammer, leaking a private file, giving a refund nobody is owed. Anyone can build an agent (a banking assistant, a support bot, a personal assistant), and the crowd attacks it by voice or text. Every trick that works lands in the agent owner's logbook. Mistral's Large 4 groups those failures into plain reasons ("it trusts anyone who says they're from the bank") and suggests fixes. The owner fixes their agent, replays every past failure three times to prove the fix holds, and publishes a new version. A knowledge graph shows exactly when and how the agent learned, and an Elo rating, like in chess, shows how hard it is to break. Companies and banks can then take a hardened agent, or just its safety layer, and run it on their own systems.

## 1. The big picture: build, attack, learn, publish

```mermaid
flowchart TD
    A["Creator picks a stream<br/>banking, support, assistant"] --> B["Creator writes the agent<br/>role, knowledge, limits"]
    B --> C["Placement test<br/>same fixed exam for every agent in the stream"]
    C --> D["Starting Elo rating"]
    D --> E["Private practice<br/>owner attacks their own agent"]
    E --> F["Publish to the Arena"]
    F --> G["Players attack it<br/>by voice or text"]
    G --> H{"Did the trick work?"}
    H -- "No, agent held" --> I["Agent gains rating"]
    H -- "Yes, agent was fooled" --> J["Agent loses rating<br/>failure saved to the logbook"]
    J --> K["AI analyst, Large 4<br/>groups failures by reason<br/>suggests fixes"]
    K --> L["Owner fixes the agent<br/>edits prompt, limits, Guardian rules"]
    L --> M["Retest: replay every past failure 3 times"]
    M --> N{"Result per failure"}
    N -- "Blocked 3 of 3" --> O["Fixed: 'learned' node in the knowledge graph"]
    N -- "Blocked 1 or 2 of 3" --> P["Flaky: keep working on it"]
    N -- "Blocked 0 of 3" --> Q["Still failing: keep working on it"]
    P --> K
    Q --> K
    O --> R["Publish new version, e.g. 2.3<br/>rating carries over, moves faster at first"]
    R --> G
    I --> S["Leaderboards<br/>agents by rating and grade<br/>players by points"]
    J --> S
```

## 2. What happens in one turn of a conversation

```mermaid
flowchart TD
    A["Player speaks or types"] --> B["Voxtral turns speech into text"]
    B --> C["Safety screen<br/>Mistral moderation + card-number check"]
    C --> D["Agent brain: Large 4<br/>reads this agent's own instructions,<br/>knowledge and tools"]
    D --> E{"Does it want to do something risky?<br/>send money, add payee, open private file"}
    E -- "No" --> J["Agent replies"]
    E -- "Yes" --> F["Hard limits check<br/>e.g. max payment, hold on new payees"]
    F --> G{"Guardian switched on?"}
    G -- "No (default)" --> H["Action happens in the sandbox"]
    G -- "Yes" --> I["Guardian: a second Large 4 judge<br/>that never talks to the player<br/>allow, extra check, or block"]
    I --> H
    H --> K["Win check: did money really move?<br/>decided by code, not by an AI opinion"]
    K --> J
    J --> L["Voxtral speaks the reply (voice mode)"]
    L --> M["Run saved: who stopped the attack?<br/>agent, limit, Guardian, or nobody"]
```

Every agent uses the same Large 4 engine, but each call carries that agent's own instructions, knowledge and conversation. Same engine, different script, different agent. Nothing leaks between agents.

## 3. Taking an agent to a bank, and selling it

```mermaid
flowchart TD
    A["Hardened agent in Red Room<br/>good rating, retests passing"] --> B["Export package"]
    B --> B1["Instructions and knowledge"]
    B --> B2["Hard limits"]
    B --> B3["Guardian rules"]
    B --> B4["Regression tests:<br/>every attack it learned to stop"]
    B --> B5["Report: grade, rating, exam results"]
    B --> C{"How is it used?"}
    C -- "Route 1: we host it" --> D["Bank calls Red Room's API<br/>pays per check"]
    C -- "Route 2: bank hosts it" --> E["Bank runs open-weight Mistral<br/>on its own servers<br/>customer data never leaves"]
    C -- "Route 3: marketplace" --> F["Creator lists the agent or its Guardian pack<br/>other companies license it<br/>creator earns a share"]
    E --> G["Bank's own app and real payment system"]
    D --> G
    F --> G
    G --> H["Before every real payment:<br/>Guardian check with the pack's rules"]
    H --> I["Allow, extra check, or block"]
    I --> J["Bank's private logbook keeps learning<br/>in a private company arena"]
    J --> K["Bank staff attack and fix their own agents<br/>doubles as security training"]
```

What gets exported is the agent's instructions, rules, limits and tests, never Mistral's model weights. The buyer runs it on Mistral, either through the API or on open-weight Mistral models on their own servers. Note: Large 4's licence limits reselling it as a hosted service, so Route 1 at scale needs an agreement with Mistral.

## 4. How the leaderboards fit together

```mermaid
flowchart LR
    A["Every run is a match:<br/>player vs agent version"] --> B["Player points and rank"]
    A --> C["Agent Elo rating"]
    C --> D["Agent leaderboard per stream"]
    B --> E["Player leaderboard<br/>all day, per team"]
    F["Placement test"] --> C
    G["New version published"] --> H["Rating kept,<br/>moves faster for a few matches"]
    H --> C
    I["Exam + false blocks"] --> J["A to F grade"]
    J --> D
```

## Mistral everywhere

| Job | Mistral product |
|---|---|
| Agent brain, Guardian, attacker bot | Large 4 |
| AI analyst (grouping failures, suggesting fixes) | Large 4, high reasoning, as a Mistral Agent |
| Analyse, owner approves, retest | Mistral Workflow with a human step |
| Voice in and out | Voxtral 3 (transcription and TTS) |
| Safety screen | Mistral moderation |
| Grouping similar failures | Mistral embeddings |
| Building the app | Mistral Vibe on Large 4 |
| Red-teaming from inside Vibe | Red Room MCP server / Vibe skill |
