import os

# Tests check strict ownership; the hackathon deployment runs with OPEN_ACCESS=1.
os.environ["OPEN_ACCESS"] = "0"
os.environ["LIVES_MAX"] = "3"
os.environ["LIVES_REFILL_S"] = "300"
for _b in ("CHAT", "VOICE", "START", "ANALYSE", "RETEST", "CREATE"):
    os.environ.setdefault(f"RATE_{_b}_PER_MIN", "100000")
