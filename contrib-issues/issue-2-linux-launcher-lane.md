# The wizard gives Linux no launchers: Phase 6 builds a .command and a .bat, and a Linux user finishes with nothing to click

## What I saw

The README installs on Mac **and Linux** ("Mac and Linux also use git"), and `start.sh`/`update.sh` both run on Linux. But Phase 6 of the wizard (`fullstack-agent.md`) makes launchers for exactly two of the three supported platforms:

- item 1 (Chat): macOS `.command`, Windows `.bat` — no Linux form
- items 2–3 (Talk / barehands): `start.sh ...` or `start.bat ...` — no Linux launcher, just the terminal command
- item 4 (Update): **"(macOS only)"** — even though `update.sh` runs on Linux fine; on Windows the chat fallback is specified, on Linux nothing is said at all

So a Linux user completes setup, gets the warm closing lines about "the Desktop shortcuts ARE the agent"... and has no shortcuts. The daily habit the wizard tells them about doesn't exist on their machine, and the launcher test/handoff at the end of Phase 6 has nothing to test.

## What I expected instead

A Linux lane beside the Mac and Windows ones, in the same spirit: the wizard makes the launchers, tests one with the person, and the shortcuts become the daily habit — on all three platforms the project installs on.

## The fix

I have it as a commit against `main` (5bb159f) — happy to paste the full text. The shape, worked out so it behaves like the Mac's `.command` lane rather than fighting the desktop:

**A Linux launcher is two files: a tiny script (the same idea as the Mac's `.command`) and a menu entry that runs it.**

1. For each shortcut, a script in the home folder — **named with dashes, not spaces** (`talk-to-<name>.sh`), because the menu entry names it by full path and a dashed name sidesteps the Desktop Entry spec's quoting rules entirely — containing the shebang, **the same PATH export the Mac section mandates** (`~/.local/bin` is where `claude`/`uv` land on Linux, and a menu-launched terminal is not guaranteed a login PATH), then the same `cd`-and-run line the Mac version carries. `chmod +x`.
2. Then `~/.local/share/applications/<name>-<mode>.desktop`:

```
[Desktop Entry]
Type=Application
Name=Talk to <name>
Exec=/full/path/to/talk-to-<name>.sh
Terminal=true
Icon=utilities-terminal
```

Two deliberate choices worth defending in plain words, since the wizard says them to the person:

- **The applications menu, not the Desktop itself**, because the menu is the one place every Linux desktop looks. Desktop icons work on some desktops and quietly do nothing on others — GNOME ships without them. Promising a Desktop icon would be promising a thing the machine may not honor.
- **`Terminal=true` is what makes the window**, and closing that window stops the stack, same as the Mac.

Plus the small print: menus cache, so if a new entry doesn't appear at once, wait a moment or log out and back in.

Everything downstream is updated to match: item 4 becomes "(macOS and Linux)", the PATH-export rule and the closing lines ("on Linux, same thing from the applications menu", the daily-habit bullet, the final launcher test) all name the Linux lane, and the README's After-setup notes now say `update.sh` runs "on macOS or Linux" and where the shortcuts land on Linux.

## Setup

Linux (GNOME/KDE/etc. all read `~/.local/share/applications`; the lane deliberately uses nothing distribution-specific). Repo at 5bb159f.
