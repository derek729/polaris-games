# start.sh: a missing python3 and a stillborn server both die silently behind their own "starting" line

## What I saw

Two failures on the macOS/Linux lane that both look identical from the outside — like nothing happened:

1. **No python3 on the machine** (a fresh minimal Linux install, for instance). `start.sh` prints `face: starting (your browser opens on the visualizer)`, then... nothing. The background subshell died instantly; its error went nowhere. The voice line still comes up, so the stack is half alive with no explanation.
2. **A server that exits at birth** — its port already busy from an earlier session is the classic. Same silent death behind the same promising line.

This is the exact symptom your own TROUBLESHOOTING documents under *"start.sh says a piece is starting but nothing appears"* — the script itself can't currently help the person (or the agent) narrow it down.

Related, smaller: an **unknown mode word means "all."** `./start.sh Voice` (capitalized typo) or a stray quoted-empty argument (`./start.sh ""`) quietly starts every piece at once, camera included, instead of naming the mistake. `start.bat` has the same behavior.

## What I expected instead

- A missing interpreter is reported in plain words before any "starting" line promises a server. Windows carries exactly this honesty inside each piece's `run.bat` (the Store-decoy problem, as the comment in `start.bat` says); the lanes that call `python3` directly deserve the same.
- A server that dies within its first second gets a warning naming the piece, with the usual cause (busy port) — while the voice still starts, because a dead face is not a reason to hang up on the person.
- A typo'd mode is an error with the expected words, on both platforms.

## How to reproduce

No python3 (any machine, safely):

```
env PATH=/tmp/emptybin ./start.sh voice   # /tmp/emptybin has no python3
# → "face: starting ..." then silence
```

Stillborn server: start a stack, leave it running, start a second one in another terminal — or temporarily put `import sys; sys.exit(1)` at the top of a piece's `server.py`.

Mode typo: `./start.sh Voice` → starts everything.

## The fix

I have it as two commits against `main` (5bb159f) on a branch — happy to paste the full diff anywhere you want it. Summary of the moves:

- `MODE="${1-all}"` (not `:-all`) plus a `case` that rejects anything but `all|voice|hands`, with a one-line usage message; the same three-line check in `start.bat`.
- Face/hands are computed up front (`FACE`/`HANDS` flags, reused for both the check and the launches); if either will run, one `command -v python3` gate before anything starts.
- After the servers launch: `sleep 1`, then `kill -0` each PID; the dead ones get a warning naming the piece and naming the busy port as the usual cause. One second catches the instant deaths, which are the ones with a cause worth naming, and costs nothing when everything is well.
- TROUBLESHOOTING's "nothing appears" section now opens with: the script says so itself when the news is bad — if you saw neither message, the server is running and the confusion is the bullets below.

Bash 3.2-safe (macOS default): arrays, `+=`, `${!arr[@]}`, `command -v` only — no 4.x-isms.

## Evidence

Tested on Linux against a sandbox home with fake pieces, at 5bb159f + these commits:

| Scenario | Before | After |
|---|---|---|
| `start.sh Voice` | everything starts, camera included | `unknown mode 'Voice'`, exit 2 |
| `start.sh ""` | everything starts | `unknown mode ''`, exit 2 |
| python3 missing from PATH | `face: starting` then silence | plain 3-line `python3 is not installed` message, exit 1, voice never promised |
| face server exits at birth | silence behind "starting" | `warning: the face server exited right after starting` + the busy-port line; voice runs; clean exit 0 |
| healthy stack, `voice`/`hands`/no-arg | — | identical behavior to before, no new output, servers cleaned up on Ctrl-C/TERM |
| `start.bat` unknown mode | everything starts | `unknown mode "foo"`, exit /b 2 (same three-line `if not` idiom already in the file) |

## Setup

Linux (the python3-gate and liveness warning are pure POSIX-ish bash; nothing platform-specific). Repo at 5bb159f.
