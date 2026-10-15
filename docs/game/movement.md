# Movement trial

This is the Phase 0 slice from the [game design](../../../SPINWARD.md).
The default game is now the [expedition](expedition.md). Run the movement trial with:

```sh
crust main.crs --trial
crust main.crs --trial --width 1280 --height 720 --fov 90
```

The root builds the host through the Crust ownership stage and builds the
compute shaders. The executable is `build/game`. The renderer demonstration
remains at `crust demo.crs` and `build/spinward`.

## Course

Start on the small platform. Pass 11 gates in order. The route goes through a
launch gallery, a machinery court, a vertical shaft, an upper crossing, and a
return duct. Each gate has a required crossing direction. The current gate is
cyan; the next gate is dim. A cyan arrow points toward a gate outside the view.
Land on the amber finish platform at less than 2 m/s. See the
[course plan](flight-course.md) for geometry, lights, and route details.
The timer stops when the drone is above that platform, less than one metre from
its top. Backspace starts another attempt. There is no frame limit in window
mode.

The course has one physical space. Its origin is 750 m from the drum axis.
Local positive Y points toward the axis. The drum turns about local Z.
F4 selects stopped or full spin and resets the attempt. It does not apply a
bearing-ring velocity change to a drone already in flight.

Charge is unlimited in Phase 0. The trial records burst count, total speed
removed by braking, and winch work per unit mass. The exit report prints these
values. Charge depletion and beacons belong to Phase 1.

## Controls

| Action | Keyboard and mouse | Gamepad |
| --- | --- | --- |
| Move | WASD, Ctrl down, Space up | Left stick, LB down, RB up |
| Look | Mouse | Right stick |
| Burst | Right mouse, on press | RT, on press |
| Brake | F, on press | A, on press |
| Launch and hold tether; release to detach | Hold left mouse | Hold LT |
| Start fast reel; stays on until hook release | R; Space while tethering | RB while tethering |
| Roll with auto-level off | Q / E | D-pad left / right |
| Retry | Backspace | X |
| Select spin and retry | F4 | Y |
| Auto-level | L | Back |
| Preview mode | P | B |
| Pause / resume | Tab | Start |
| Exit | Esc | Close the window |

Focus loss pauses the trial and clears held toggle actions. Resume with Tab.
A clock stall longer than one second also pauses the trial and prints a
message. The game does not skip simulation steps to catch up. Use `--slow`
for 70 percent game speed.

Auto-level is on by default. It rolls toward the inward radial direction at
no more than 90 degrees per second. At a view parallel to that direction, it
keeps the current roll. Manual roll is available with auto-level off, together
with the design's 30 percent turn gain. Total look rotation is capped at
180 degrees per second. Tether motion does not force a camera turn.

The drone frame stays in view. `--fov` accepts 70 through 110 degrees of
vertical field of view. P switches both previews on or off. They are on by default. Looking into open
space does not hide the drone path. Markers outside the view or behind scene
geometry remain hidden. The preview runs the same simulation
for two seconds without further thrust, braking, or reel commands. It keeps a
launched hook or an attached cable held. An active reel continues in the preview.
Blue square outlines mark the predicted positions. Each square is 24 cm wide
between the border centre lines. The border has a solid cyan colour at full
brightness. Its width in render pixels is `ceil(max(width / 640, height / 480))`:
1 px at 640 by 480, 2 px at 1280 by 960, and 3 px at 1920 by 1080.
Its world-space width changes with camera depth and field of view. Squares
behind the camera or no wider than twice the border width are hidden, so the
centre stays open. The squares still use world-space depth
and can be hidden by scene geometry.
Cyan markers are 4 m apart along the predicted path. Their spacing phase advances
with actual travel at each simulation tick. During coasting, the drone approaches
and passes the same world-space marker positions. A new marker enters at the
far end when a near marker passes. Changing thrust, forces, or contact changes
the predicted path immediately. Positions are interpolated between simulation
steps. The outlines face the camera; their centres supply the stable motion cue. Slow motion shows fewer
markers. A stationary drone path shows none. The preview stops at two seconds
or its marker limit, whichever comes first.

Small filled pink squares show the hook path while the tether is ready to
launch. Each square is 8 cm wide, with a minimum screen width of
`ceil(max(width / 640, height / 480))` pixels. This
preview uses the actual launch and flight simulation on a copy of the drone.
It includes inherited velocity, recoil, drag, spin forces, surface contact,
and the range limit. It assumes no further movement input or reeling. It stops
at contact or a range snap. It is hidden while the hook is in flight, attached,
or waiting for release after a snap. P set to off hides both paths.

The paths share a limit of eight markers. When the hook preview is active, the
drone path uses up to four markers. The hook path uses the remaining markers.
Both paths use the same 4 m spacing and solid colours. Cyan markers remain
hollow with scaled pixel borders. Pink markers are filled. Both paths hide
markers within 6 m of the ship. This does not move farther markers or add
replacement markers at the far end.
Pink markers stay relative to the ship: they start 4 m along the predicted
hook path on each frame, followed by markers at 8 m, 12 m, and so on. The path
still includes inherited velocity and forces. A change in aim changes the path.
The cyan spacing phase updates while previews are hidden and resets on retry.
Rendering reads that phase and cannot change it.

The HUD shows time, gates, air-relative speed, hook state, cable length, burst
count, and assist settings. The cable is cyan. A small amber body shows the
hook in flight and at the attachment point. A frame notch shows a hook or
anchor outside the forward view.

## Simulation contract

Simulation runs at 120 Hz, independent of presentation. Each tick consumes one
command. Rendering borrows the resulting trial state. It cannot change it.
Mouse motion is accumulated until a simulation tick consumes it. Button press
actions remain pending until consumed; holding a button does not repeat them.

The integrator is semi-implicit Euler. Full spin is 0.0495 rad/s. Centrifugal
and Coriolis acceleration use the game design equation without steering
correction. Drag uses the authored density curve, with initial coefficients
`c1/m = 0.08 s^-1` and `c2/m = 0.012 m^-1`. Density rises from 0.05 to 1 with
smoothstep over radii from zero through 4000 m.

The drone has a 0.35 m collision radius. Each course solid supplies both the
visible box and the collision box. Sweeps test faces, rounded edges, and
corners. The two pipes use six-sided prisms for both drawing and collision.
Their sweeps test side faces, end caps, and rounded edges. Contact removes inward velocity and permits sliding. A step resolves
up to four contacts; excess travel stops at the last safe contact point.

Press and hold the tether action to launch one hook. The hook starts at the
drone position. It inherits drone velocity and adds 60 m/s along the view.
The hook mass is 0.02 times the drone mass. The launch applies the opposite
impulse to the drone: 1.2 m/s of recoil. The hook uses the same acceleration
from drag, centrifugal force, and Coriolis force as the drone, with the same
120 Hz integrator. It has no thrust or steering after launch.

A swept sphere with a 0.06 m radius finds the first surface on each flight
step. Only contact attaches the cable. The hook cannot pass through a thin
solid between ticks. If it reaches 120 m from the drone without contact, the
cable snaps and the HUD shows SNAP: RELEASE. Release the action before another
launch. Release also removes an in-flight hook or an attached cable at once.
There is no rewind delay.

An attached cable cannot break. It passes through structure and does not wrap
around corners. It has a hard maximum length, with no spring or stored tension.
The player still collides with structure. Each collision-slide segment stays
inside the cable length. Press reel once to start pulling at 40 m/s immediately.
There is no speed ramp. A taut cable gives the player an immediate velocity
change toward the hook. The reel stays on when its button is released or
pressed again. It cannot reverse. Only hook release clears it. A reel press
during hook flight starts the pull on contact.

Cable length is between 0.75 m and 120 m. If a surface blocks the player, the
winch stops at the length it can reach. It remains active and resumes when the
path clears. It does not pull the player through the surface. Winch work uses
the velocity constraint impulse and the actual reel speed. There is no load
limit or tension warning. Ctrl and LB remain downward thrust while tethered.

The game keeps its camera, geometry, inputs, and trial rules outside
`src/render/`. Transformed portals remain available in the renderer demo.
Adding playable portal crossings requires a defined transform for drone state,
drum coordinates, and attached cables.

## Source boundaries

| Files | Responsibility |
| --- | --- |
| `src/game/flight/math.crs`, `flight/state.crs` | Value types and initial state |
| `course/course.crs`, `course/course-route.crs` | Solids, directional gates, dock, and drum placement |
| `course/course-pipes.crs`, `flight/pipe-collision.crs`, `pipe-view.crs` | Pipe shape, contact, and drawing |
| `course/course-tour.crs` | Input controllers for automatic course flights |
| `course/course-appearance.crs`, `course/course-view.crs` | Surface patterns, lights, and route indicator |
| `flight/physics.crs`, `flight/orientation.crs` | Forces, integration, and attitude |
| `flight/collision.crs` | Sweeps and contact response |
| `flight/hook.crs` | Launch, recoil, projectile flight, contact, and range snaps |
| `flight/tether.crs` | Cable length, winch, and release |
| `view/tether-view.crs` | Cable, hook body, and direction indicator |
| `flight/trial.crs` | Attempt state, gate order, and finish detection |
| `host/input.crs` | Actions, edges, toggles, and pending mouse motion |
| `host/sdl-input.crs`, `host/bindings.crs` | Native device reads and binding file parsing |
| `view/scene.crs`, `view/palette.crs`, `view/preview.crs` | Scene submission and flight indicators |
| `view/hook-preview.crs` | Hook path before launch |
| `view/preview-phase.crs` | Flight spacing phase and path station positions |
| `view/hud.crs`, `view/text.crs` | Trial status and text data |
| `host/loop.crs` | Fixed-step clock and frame sequence |
| `host/platform.crs`, `host/renderer-host.crs` | Resource ownership and renderer setup |
| `host/replay.crs`, `host/recording.crs` | State hashes and recording IO |
| `host/options.crs`, `host/entry.crs` | Launch options and entry point |
| `src/app/` | Shared window, clock, shader IO, capture, geometry, and palette helpers |
| `tests/game/` | Simulation and complete-course checks |

The root explicitly selects native providers. Simulation, collision, tether,
input action processing, scene submission, and the main loop are ownership
checked. Native providers contain SDL, file, and Vulkan integration.

## Record, replay, and checks

```sh
crust main.crs --trial --record build/flight.rec
crust main.crs --trial --replay build/flight.rec
crust tests.crs game
crust main.crs --trial --tour
crust main.crs --trial --tour --full-spin
crust main.crs --trial --headless --tour --record build/course.rec \
  --capture build/course.ppm
crust main.crs --trial --headless --smoke --ticks 600 --record build/smoke.rec \
  --capture build/smoke.ppm
crust main.crs --trial --headless --replay build/smoke.rec \
  --capture build/replay.ppm
cmp build/smoke.ppm build/replay.ppm
```

Recordings contain tick commands and a hash of the complete trial state after
each tick. Replay checks every hash and stops with an error at the first
mismatch. A recording must end with a count footer. Truncated data and invalid
numeric values are errors. Use the same build for recording and replay. This
format uses the current Linux host's word representation. Version 10 uses an on/off preview setting, stores the
game mode and initial spin mode in its header and includes the cyan prediction phase in the
state hash. Replay restores the mode and reproduces the marker motion. Earlier
versions are rejected because their state contract differs.

`--ticks N` bounds a run. In headless mode, the simulation runs without wall
clock pacing and renders the last state. `--smoke` supplies test commands for
thrust, tether, brake, and a spin-mode change. `crust tests.crs game` checks forces, swept
collision, projectile flight and recoil, high-speed attachment, range snaps,
tether release, fast swings, latched fast reeling, blocked winching, input edges,
mouse accumulation,
repeated input streams, directional gate crossings, pipe contact, the triangle
budget, marker stability during coasting, and complete flights in stopped and full-spin modes.
These checks use the production simulation.

`--tour` flies the course with ordinary tick commands and stops on landing.
Use `--full-spin` to start in full spin. The two tour controllers use different
flight strategies; their times are not a comparison of player difficulty.
Without `--ticks`, a headless tour runs until landing. A replay gets its initial
spin mode from the recording; it rejects a separate `--full-spin` option.

## Input binding file

Use `--bindings FILE` to replace selected default bindings. Each non-comment
line has seven integers:

```text
# action  SDL-scancode  mouse-mask  pad-button  pad-axis  direction  toggle
8         -1            1           -1          4         1          1
9         21            0           -1         -1         1          0
```

This example toggles the tether and binds R to start the latched reel. Use `-1` to disable a key,
pad button, or pad axis; use zero to disable mouse buttons. Direction is -1 or
1. Toggle is zero or one. Mouse masks use SDL button bits. Stick and trigger
axes have a 15 percent dead zone. Mouse motion controls look directly.

| Action number | Action |
| --- | --- |
| 0–5 | Forward, backward, left, right, up, down |
| 6–9 | Burst, brake, tether, start reel |
| 10–15 | Yaw right, yaw left, pitch down, pitch up, roll right, roll left |
| 16–21 | Retry, spin, auto-level, preview, quit, pause |

## Playtest gate

Use stopped mode first, then full spin. Record the assist settings. After each
session, collect the SSQ result and note whether the tester retries without a
prompt or describes the drift as broken.

Gate 0 needs five testers: at least three must retry without a prompt, none
must call the drift broken, and the median SSQ total must be below 15 with
default assists. Automated tests do not establish this result. Run this
playtest before starting the beacon and charge-economy slice.

## Implementation checks

The automated stopped-course flight passes all 11 gates and lands in 18,488
simulation ticks, with 13 bursts. The full-spin flight lands in 6,470 ticks,
with 32 bursts. Force, collision, tether, winch, input, and
replay checks pass. AMD and Intel replay both complete course recordings with matching simulation
hashes. On AMD, record and replay captures match byte for byte. Invalid version
and spin fields in recording headers are rejected. A private X11 window test with software Vulkan checks presentation and
Esc exit. A physical gamepad has not been tested in this environment.

The renderer passes 50 lit-tour reference states, including 70 and 110 degree
fields of view, on AMD and Intel. The palette test also checks overlay bounds,
transparent cells, glyph rows, and RGBA/BGRA presentation.
