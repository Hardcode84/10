# Movement trial

This is the Phase 0 slice from the [game design](../../SPINWARD.md).
Run it with:

```sh
crust main.crs
crust main.crs --width 1280 --height 720 --fov 90
```

The root builds the host through the Crust ownership stage and builds the
compute shaders. The executable is `build/game`. The renderer demonstration
remains at `crust demo.crs` and `build/spinward`.

## Course

Start on the small platform. Pass the three gates in order, in the direction
away from the start. The current gate is cyan. Pass around the spoke and to the
right of the brown wall. Land on the amber finish platform at less than 2 m/s.
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
| Tether | Hold left mouse | Hold LT |
| Reel in / out | R / T; Space / Ctrl while tethering | RB / LB while tethering |
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
vertical field of view. P cycles the preview through aim, always, and off.
Aim mode shows the preview when the centre ray can reach a tether surface or
a cable is attached. The preview runs the same simulation for two seconds
without further thrust, braking, or reeling. It keeps an attached cable held.
Blue square outlines mark the predicted positions. Each marker has a 24 cm
outer width and a 2 cm border. The centre stays open.

The HUD shows time, gates, air-relative speed, cable tension, rewind time,
burst count, and assist settings. Cable colour changes near the load limit.
A frame notch shows an anchor outside the forward view.

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
corners. Contact removes inward velocity and permits sliding. A step resolves
up to four contacts; excess travel stops at the last safe contact point.

A tether can attach to the first surface within 120 m. Its length is a hard
limit. The last 0.4 m includes a spring and damper. Initial coefficients per
unit mass are 20 s^-2 and 6 s^-1. Tension includes the radial constraint impulse.
The winch targets 20 m/s and changes speed at up to 10 m/s^2. This bounds its
initial acceleration. A cable breaks above 39.2 N/kg and rewinds for 360 ticks.
It also breaks if structure blocks the line to its anchor. There is no cable
wrapping. Constraint corrections use collision sweeps.

The game keeps its camera, geometry, inputs, and trial rules outside
`src/render/`. Transformed portals remain available in the renderer demo.
Adding playable portal crossings requires a defined transform for drone state,
drum coordinates, and attached cables.

## Source boundaries

| Files | Responsibility |
| --- | --- |
| `src/game/math.crs`, `state.crs` | Value types and initial state |
| `course.crs` | Solids, gates, and drum placement |
| `physics.crs`, `orientation.crs` | Forces, integration, and attitude |
| `collision.crs` | Sweeps and contact response |
| `tether.crs` | Attachment, winch, tension, and release |
| `trial.crs` | Attempt state, gate order, and finish detection |
| `input.crs` | Actions, edges, toggles, and pending mouse motion |
| `sdl-input.crs`, `bindings.crs` | Native device reads and binding file parsing |
| `scene.crs`, `palette.crs`, `preview.crs` | Scene submission and flight indicators |
| `hud.crs`, `text.crs` | Trial status and text data |
| `loop.crs` | Fixed-step clock and frame sequence |
| `platform.crs`, `renderer-host.crs` | Resource ownership and renderer setup |
| `replay.crs`, `recording.crs` | State hashes and recording IO |
| `options.crs`, `entry.crs` | Launch options and entry point |
| `src/app/` | Shared window, clock, shader IO, capture, geometry, and palette helpers |
| `tests/game/` | Simulation and complete-course checks |

The root explicitly selects native providers. Simulation, collision, tether,
input action processing, scene submission, and the main loop are ownership
checked. Native providers contain SDL, file, and Vulkan integration.

## Record, replay, and checks

```sh
crust main.crs --record build/flight.rec
crust main.crs --replay build/flight.rec
crust main.crs --test
crust main.crs --headless --smoke --ticks 600 --record build/smoke.rec \
  --capture build/smoke.ppm
crust main.crs --headless --replay build/smoke.rec \
  --capture build/replay.ppm
cmp build/smoke.ppm build/replay.ppm
```

Recordings contain tick commands and a hash of the complete trial state after
each tick. Replay checks every hash and stops with an error at the first
mismatch. A recording must end with a count footer. Truncated data and invalid
numeric values are errors. Use the same build for recording and replay. This
format uses the current Linux host's word representation.

`--ticks N` bounds a run. In headless mode, the simulation runs without wall
clock pacing and renders the last state. `--smoke` supplies test commands for
thrust, tether, brake, and a spin-mode change. `--test` checks forces, swept
collision, tether release and overload, sustained swings, input edges, mouse
accumulation, repeated input streams, and a complete stopped-course flight.
These checks use the production simulation.

## Input binding file

Use `--bindings FILE` to replace selected default bindings. Each non-comment
line has seven integers:

```text
# action  SDL-scancode  mouse-mask  pad-button  pad-axis  direction  toggle
8         -1            1           -1          4         1          1
9         21            0           -1         -1         1          1
```

This example toggles the tether and reel-in actions. Use `-1` to disable a key,
pad button, or pad axis; use zero to disable mouse buttons. Direction is -1 or
1. Toggle is zero or one. Mouse masks use SDL button bits. Stick and trigger
axes have a 15 percent dead zone. Mouse motion controls look directly.

| Action number | Action |
| --- | --- |
| 0–5 | Forward, backward, left, right, up, down |
| 6–10 | Burst, brake, tether, reel in, reel out |
| 11–16 | Yaw right, yaw left, pitch down, pitch up, roll right, roll left |
| 17–22 | Retry, spin, auto-level, preview, quit, pause |

## Playtest gate

Use stopped mode first, then full spin. Record the assist settings. After each
session, collect the SSQ result and note whether the tester retries without a
prompt or describes the drift as broken.

Gate 0 needs five testers: at least three must retry without a prompt, none
must call the drift broken, and the median SSQ total must be below 15 with
default assists. Automated tests do not establish this result. Run this
playtest before starting the beacon and charge-economy slice.

## Implementation checks

The automated stopped-course flight passes all three gates and lands in 5,492
simulation ticks, with four bursts. Force, collision, tether, winch, input, and
replay checks pass. AMD and Intel replay the same 600-command recording with
matching simulation hashes. On AMD, record and replay captures match byte for
byte. A private X11 window test with software Vulkan checks presentation and
Esc exit. A physical gamepad has not been tested in this environment.

The renderer passes 50 lit-tour reference states, including 70 and 110 degree
fields of view, on AMD and Intel. The palette test also checks overlay bounds,
transparent cells, glyph rows, and RGBA/BGRA presentation.
