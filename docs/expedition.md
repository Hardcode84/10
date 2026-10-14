# First expedition: The Silent Foundry

The default game is a complete expedition through three connected areas:
the service berth, pump court, and lantern crown. The movement course remains
available with `--trial`. The user has authorized this slice before the human
Gate 0 test. Automated completion does not establish comfort or fun.

## Acceptance contract

Launch from a lit berth. Reach a dark relay in the pump court, restore the
crown beacon, then return to the berth. Use real flight, hook, and collision
rules. Do not require passage through race gates. Light and charge make the
restored stations useful. The return route must be visible after the relight.

The first proof must include actual input commands, finite charge, a saved
beacon, a return to the berth, and a rendered image. Add more content only
after this path works. Keep geometry, energy, objectives, drawing, HUD, and
save IO in separate files. Keep the renderer independent of mission rules.

## Route and choices

The gallery gives a sheltered approach to the pump court. The upper machinery
provides a direct tether route to the crown. A lit upper return path leads
back above the gallery. Players can use the same structures for fast swings
or slow controlled flight. Warm marks identify home; cold marks identify
power stations. Full-bright pipe stripes show nearby surfaces in the dark.

A relay supplies a safe place to recharge before the climb. The main beacon
lights the structure and the return route. Dock slowly near each station to
restore it. The HUD states the distance, required speed, and docking progress.
No camera motion is forced during a relight.

## Validation

Run a complete expedition with production input commands and no state edits.
Check power exhaustion, recovery, persistent relights, charge use, replay,
and return completion. Compare dark and lit captures. Keep the original
movement tests passing.

For the first human test, ask three players to reach the crown and return.
At least two should complete it within three attempts. Record where they lose
the route, wait for charge, or stop using the tether. Ask whether the relight
changes their plan for the return. A useful choice must be visible in the
input recording; a statement that the route is fun is not sufficient evidence.

## Run and play

```sh
crust main.crs
crust main.crs --fresh
crust main.crs --trial
crust main.crs --tour
crust main.crs --tour --shortcut
crust main.crs --test
crust main.crs --review
```

The default expedition uses a stopped drum. `--trial --full-spin` selects the
rotating movement course. `--tour` demonstrates the covered return route.
`--tour --shortcut` uses the actual hook and reel to climb the shaft and takes
the open return. The automatic tours pause at the crown to show the relight.
The playable game never moves the camera for a reveal.

`--review` writes four captures in `build/`: `expedition-dark.ppm`,
`expedition-lit.ppm`, `expedition-recovery.ppm`, and `expedition-empty.ppm`.
These use the game scene at one fixed view. They do not change saved progress.

Use WASD and Ctrl/Space to move. Right mouse gives a burst. F brakes. Hold left
mouse to launch and hold the hook; R starts fast reeling. Release left mouse
to let go. Use the mouse to look, L for auto-level, P for predictions, Tab to
pause, and Esc to exit. The gamepad bindings remain those in the movement guide.

Stay within 6 m of a station at less than 2 m/s for 1.5 seconds to link it.
The relay supplies the crown. The crown supplies a return link. Carry that link
back to the warm berth to finish. The covered route crosses the upper platform
and return duct. The open route clears the platform rail, crosses above the
court and gallery, and descends in front of the gallery entrance. There are no
mandatory race gates. Flight-path markers and the objective arrow are assists.

Backspace or gamepad X recovers a drone during flight. Lit stations remain lit.
The most recent parked drone remains as an amber marker. A replacement starts
with full charge at the berth, but must revisit the crown to collect its link.
Recovery cannot complete the return. After completion, Backspace or X starts
a new expedition and clears that expedition's saved progress.

## Charge

| Action | Charge |
| --- | --- |
| Maneuver, hook launch, release, passive cable swing | Free |
| Burst | 8 per accepted burst |
| Brake | 0.35 per m/s removed |
| Loaded reel | 1 per 400 J/kg of measured winch work |
| Near a lit station | 8 per second within 18 m |
| Restore a station | Fill to 100 |

An unaffordable burst does nothing. A brake removes only the speed its charge
can pay for. Winch movement and its velocity change are committed only if the
available charge covers their work. A blocked winch does no work and consumes
no charge. An active reel remains latched while it waits for charge. Free
maneuvering and hook launches remain available at zero charge.

The lamp dims with charge, retains 35 percent of its full intensity parameter,
and flickers below 20 charge. Full-bright route marks remain visible. Collision
response stays unchanged: contact permits sliding and has no charge tax.

## Saved progress and replay

Normal window play saves station state, completion, recovery count, the most
recent parked drone, and checkpoint statistics to `spinward.save`. Use
`--save FILE` to select another path. Saves are written at restoration,
recovery, completion, and new-expedition events. The write flushes and syncs a
temporary file, then replaces the destination by rename. Invalid or corrupt
saves report an error; they are not silently discarded.

`--fresh` starts a new expedition and replaces the selected save. Loading an
incomplete expedition starts a charged drone at the berth with restored lights
kept. A crown link is carried by the drone and is not restored at the berth.
Statistics resume from the last saved event.

Tours, recordings, replays, and the movement trial do not read or write live
progress. Headless runs do not use a save unless `--save FILE` is explicit.
The game rejects `--save` and `--fresh` with an isolated run mode.
Version 8 input recordings start from a fresh world and store the game mode
and initial spin mode. Their hashes include charge, mission state, link,
reveal, docking, recovery, and prediction state. Use the same build for replay.

```sh
crust main.crs --headless --tour --record build/expedition.rec \
  --capture build/expedition.ppm
crust main.crs --headless --replay build/expedition.rec \
  --capture build/expedition-replay.ppm
cmp build/expedition.ppm build/expedition-replay.ppm
```

## Source boundaries and costs

| File group | Responsibility |
| --- | --- |
| `expedition-world.crs` | Station locations and collision geometry |
| `expedition-state.crs`, `expedition-rules.crs` | Mission state, docking, return, and recovery |
| `energy.crs` | Charge, brake limits, and paid winch work |
| `expedition-view.crs` | Station marks, reveal lights, and lamp output |
| `expedition-hud.crs` | Objectives, controls, and completion summary |
| `expedition-tour.crs` | Route hints and input-driven demonstration pilots |
| `progress-store.crs` | Checked save-file input and atomic replacement |
| `expedition-hash.crs` | Deterministic mission-state hashing |

The world uses 21 box solids and two pipes. The worst-case scene fits 256
triangles, including path previews, station marks, a parked drone, and cockpit
indicators. The eight-light limit is unchanged. Light updates write a fixed
number of values each frame. Physics copies one plain drone value to evaluate
winch work before committing an affordable move. Save IO runs only at progress
events. No new renderer scene hierarchy or streaming system was added.

The HUD uses an integer text scale that leaves room for 56 columns. Outputs
below 448 pixels wide use a compact layout. All supported output sizes retain
the current objective, docking rule, charge, and recovery controls.

## Checked results

The ownership-checked game tests pass. They include both complete routes,
docking speed, recovery without delivery of the return link, new expeditions,
empty charge, unaffordable impulses, stalled reeling, and save replacement.

| Input-driven route | Simulation ticks | Time | Charge at berth | Recoveries |
| --- | --- | --- | --- | --- |
| Covered return | 25,628 | 214 s | 63 | 0 |
| Hook climb and open return | 19,034 | 159 s | 94 | 0 |

The shortcut applies 2,399 J/kg of actual winch work. These are automatic
demonstrations, not target times for a new player.

AMD Radeon PRO W7900 record and replay captures match byte for byte. Intel Arc
Pro B60 replay matches every recorded simulation hash. Its final shortcut
capture differs from AMD at two of 518,400 pixels. Cross-driver floating-point
shading is not specified to produce identical pixels. The separate palette
and text tests pass all 465,366 exact checks on both GPUs, including integer
text scales and both output channel orders.

Truncated saves, corrupt checksums, conflicting save options, and an invalid
expedition spin header fail with explicit errors. Fixed-view dark, lit,
recovery, and empty-charge renders pass the scene budget check. The compact
HUD is checked at 320 by 180 pixels. Pre-commit checks include Crust formatting
and a maximum function CCN of 15.

## Design review

Claude Opus recommended reusing the proven industrial layout, making light
reveal a return choice, and retaining free movement at zero charge. Those
recommendations are implemented. Its proposed impact charge was rejected:
changing established contact behavior would add a separate penalty to learn.
The initial scripted route exhausted charge near the relay. Lower burst and
brake costs now leave a useful reserve on that leg.

The tests establish completion and state consistency. The human criteria above
still measure fun, route recognition, and comfort. No automated flight result
is a human playtest result.
