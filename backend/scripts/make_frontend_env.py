"""One-off helper: write frontend/.env.local from the repo-root .env keeping ONLY
NEXT_PUBLIC_* values plus CLERK_SECRET_KEY, with NEXT_PUBLIC_BACKEND_URL forced to
http://localhost:8000. Never prints the values. The file is git-ignored
(frontend/.gitignore `.env*`)."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

keep: list[str] = []
for ln in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if not ln or ln.startswith("#"):
        continue
    key = ln.split("=", 1)[0]
    if key.startswith("NEXT_PUBLIC_") and key != "NEXT_PUBLIC_BACKEND_URL":
        keep.append(ln)
    elif key == "CLERK_SECRET_KEY":
        keep.append(ln)

out = "NEXT_PUBLIC_BACKEND_URL=http://localhost:8000\n" + "\n".join(keep) + "\n"
(ROOT / "frontend" / ".env.local").write_text(out, encoding="utf-8")
print("frontend/.env.local written with keys:",
      ", ".join(["NEXT_PUBLIC_BACKEND_URL"] + [l.split("=", 1)[0] for l in keep]))
