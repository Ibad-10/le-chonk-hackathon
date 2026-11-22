# Run an exported Red Room agent yourself

1. On your agent's Defend page, click **Export agent**. You get `<agent>.redroom.json`: instructions, knowledge, tools, the regression suite (every attack that ever broke it) and the grade. No model weights are included.
2. `pip install httpx`
3. Pick where the model runs:

| Where | Command |
|---|---|
| Mistral API | `MISTRAL_API_KEY=... python run_agent.py agent.redroom.json` |
| Your own server, open-weight Mistral on vLLM | `python run_agent.py agent.redroom.json --base-url http://localhost:8000/v1 --model mistralai/Mistral-Small-Instruct-2409` |
| Your laptop, Ollama | `ollama pull mistral` then `python run_agent.py agent.redroom.json --base-url http://localhost:11434/v1 --model mistral` |

4. Prove it still holds on your setup: add `--check`. It replays every attack and its reworded variants and exits non-zero if the agent calls a sensitive tool (send money, refund, read a private file). Put it in CI to catch regressions after any prompt change.

Tools are simulated in this runner. To connect real tools, replace the `{"ok": true}` tool result in `run_turns` with calls to your own systems, behind your own approval checks.
