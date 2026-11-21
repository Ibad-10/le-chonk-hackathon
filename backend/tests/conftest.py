import os

# Tests check strict ownership; the hackathon deployment runs with OPEN_ACCESS=1.
os.environ["OPEN_ACCESS"] = "0"
os.environ["LIVES_MAX"] = "3"
os.environ["LIVES_REFILL_S"] = "300"
