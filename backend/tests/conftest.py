import os

# Tests check strict ownership; the hackathon deployment runs with OPEN_ACCESS=1.
os.environ["OPEN_ACCESS"] = "0"
