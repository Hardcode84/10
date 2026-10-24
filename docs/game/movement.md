# Flight controls and physics

Run `crust labyrinth.crs` for [There and Back](expedition.md), or `crust demo.crs levels/radial.crs`
for the linked-room flight demo. Both use the same input and physics code.

Hold right mouse and a movement key to boost in that direction.
Boost applies acceleration for a fixed pulse. The accepted movement direction
stays fixed in drone-local coordinates for the pulse. Diagonal input has
the same boost strength as single-axis input.
Brake applies acceleration against the current velocity for a fixed pulse.
It limits the removed speed and cannot reverse the drone. Both have unlimited uses and share a cooldown from
the accepted pulse. Hold the inputs to start another pulse as soon as the
cooldown ends. Movement keys apply normal thrust without burst mode and
during cooldown. Normal thrust and pulse timing use the
[flight tuning definitions](../../src/game/flight/physics.crs).
Right mouse alone does not fire.
Brake wins if both actions arrive in the same ready tick.

The lower-right console shows the shared boost/brake cooldown. Its amber
column and pale slider rise as the charge returns. The green lamp lights
when a pulse is available. The gauge has no numeric readout. Its marks
remain visible in dark rooms and cast no shadows.

## Controls

| Action | Keyboard and mouse | Gamepad |
| --- | --- | --- |
| Move | WASD, Ctrl down, Space up | Left stick, LB down, RB up |
| Look | Mouse | Right stick |
| Burst mode | Hold right mouse and a movement key | Hold RT and a movement input |
| Brake | Hold F | Hold A |
| Launch and hold tether; release to detach | Hold left mouse | Hold LT |
| Start fast reel; stays on until hook release | R; Space while tethering | RB while tethering |
| Roll with auto-level off | Q / E | D-pad left / right |
| Retry | Backspace | X |
| Select spin and retry | F4 | Y |
| Auto-level | L | Back |
| Preview mode | P | B |
| Pause / resume | Tab | Start |
| Exit | Esc | Close the window |

Focus loss pauses the run and clears held toggle actions. Resume with Tab.
A clock stall longer than one second also pauses the run and prints a
message. The game does not skip simulation steps to catch up. Use `--slow`
for 70 percent game speed.

Auto-level is off by default in the graph game. When enabled, it rolls toward the inward radial direction at
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
marker geometry within six body-scale metres of camera depth. The renderer
applies this near plane separately in each portal view. Recursive copies
remain visible when they are far enough from the camera. This does not move
farther markers or add replacement markers at the far end.
Marker dimensions and spacing scale with the predicted body size.
Pink markers stay relative to the ship: they start 4 m along the predicted
hook path on each frame, followed by markers at 8 m, 12 m, and so on. The path
still includes inherited velocity and forces. A change in aim changes the path.
The cyan spacing phase updates while previews are hidden and resets on retry.
Rendering reads that phase and cannot change it.

The window HUD shows FPS, averaged over half-second wall-clock intervals.
It continues to update while simulation is paused. Headless captures omit
the counter so images remain reproducible.

## Simulation contract

Simulation runs at 120 Hz, independent of presentation. Each tick consumes one
command. Rendering borrows the resulting trial state. It cannot change it.
Mouse motion is accumulated until a simulation tick consumes it. Button press
actions remain pending until consumed. Burst mode and brake remain active
while held; their shared cooldown controls repeat pulses.

The integrator is semi-implicit Euler. Full spin is 0.0495 rad/s. Centrifugal
and Coriolis acceleration use the game design equation without steering
correction. Drag uses the authored density curve, with initial coefficients
`c1/m = 0.08 s^-1` and `c2/m = 0.012 m^-1`. Density rises from 0.05 to 1 with
smoothstep over radii from zero through 4000 m.

The drone has a 0.35 m collision radius. Room hulls supply both visible
surfaces and collision meshes. Sweeps test faces, rounded edges, and corners.
The
[contact-set solver](../collision/motion.md) removes inward velocity and keeps
feasible sliding motion. It separates surface overlap even at rest. A step
consumes its travel or reports the unresolved contact and stops the run.
Spawn checks reject embedded bodies.

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
The player still collides with structure. The cable limits the requested
motion before the collision solver starts. Solid contact takes priority when
the cable target is blocked. Collision separation and sliding do not submit
the rejected cable pull again. They do not increase the stored cable length.
Press reel once to start pulling at 40 m/s immediately.
There is no speed ramp. A taut cable gives the player an immediate velocity
change toward the hook. The reel stays on when its button is released or
pressed again. It cannot reverse. Only hook release clears it. A reel press
during hook flight starts the pull on contact.

Cable length is between 0.75 m and 120 m. If a surface blocks the player, the
winch stops at the length it can reach. It remains active and resumes when the
path clears. It does not pull the player through the surface. Winch work uses
the velocity constraint impulse and the actual reel speed. There is no load
limit or tension warning. Ctrl and LB remain downward thrust while tethered.

The camera, inputs, and game rules remain outside `src/render/`. Each room
uses its own local force frame. Full spin uses 0.0495 rad/s about local Z, with
the local origin 750 m from the axis and positive Y toward it. A portal applies
a rigid state transform; it does not add a bearing-ring frame velocity.

## Input binding file

Use `--bindings FILE` to replace selected default bindings. Each non-comment
line has seven integers:

```text
# action  key-position  mouse-mask  pad-button  pad-axis  direction  toggle
8         -1            1           -1          4         1          1
9         21            0           -1         -1         1          0
```

This example toggles the tether and binds R to start the latched reel. Use `-1` to disable a key,
pad button, or pad axis; use zero to disable mouse buttons. Direction is -1 or
1. Toggle is zero or one. Key positions use USB HID keyboard usage codes. Mouse mask bits select buttons,
starting at bit zero for the left button. Stick and trigger
axes have a 15 percent dead zone. Mouse motion controls look directly.

| Action number | Action |
| --- | --- |
| 0–5 | Forward, backward, left, right, up, down |
| 6–9 | Burst, brake, tether, start reel |
| 10–15 | Yaw right, yaw left, pitch down, pitch up, roll right, roll left |
| 16–21 | Retry, spin, auto-level, preview, quit, pause |

## Generated-room flight demo

Run `crust demo.crs LEVEL.crs [options]`. For example, use
`levels/radial.crs`, `levels/cylinder.crs`, or `levels/prefabs.crs`. The demo uses the game input, fixed-step simulation,
collision solver, tether, HUD, and prediction code. The room recipe supplies
its spawn, surfaces, and generated textures. Room-specific connections are
specified in the selected level source. Backspace returns to the recipe spawn.
The demo has no completion condition.

A level is a checked Crust source file. It defines
`demo_room_build(asset: mut RoomAsset, collision: mut CollisionScene,
mesh: mut Mesh, graph: mut RoomGraph) -> bool`. The function sets the spawn, room ports, rendered
mesh, and finished collision scene. Portal triangle IDs start at one and
refer to the collision link order. For a single space, leave the graph empty and use local space zero. For
multiple spaces, fill the graph with one mesh range per room and all portal
links. The renderer uses these ranges and their room IDs. Return false on a
build error. The level defines `demo_palette(input: mut FrameInput) -> bool`
to upload the materials used by its meshes.
The level also defines `demo_room_ambient() -> Vec3`. This returns the
constant red, green, and blue light added to player and hook lighting.

`levels/prefabs.crs` connects the hexagonal and octagonal prefab sets through
the rotor, pipe, and girder shafts, then the hub. Its source comments specify
the route and variants.
Unused ports connect to closed stopper prefabs. All rooms use the same
ambient light, plus the player and hook lights.

`levels/shaft-1km.crs` connects the radial starting room through a short hex
tunnel and adapter to a continuous girder shaft. Its source defines the section
count and total shaft length. An adapter with closed stoppers caps the far end.

`levels/cylinder.crs` connects two ends of one cylindrical room. The small
opening doubles player size; the large opening halves it. The hook uses
the same portal transforms. All runtime options follow the level filename.

In `levels/radial.crs`, each pair of room openings connects through a one-metre hexagonal tunnel.
The near end joins the room directly. The far end transfers the drone and
hook to the paired opening. The tunnel has solid walls and generated metal
textures. Inspect its recipe with `crust viewer.crs assets/rooms/hex-tunnel.crs`.

Hold LMB to launch and retain the hook. R or Space starts fast reeling.
Release LMB to release the hook. Hold RMB with a movement key to burst; hold F to brake.
WASD and Ctrl/Space apply thrust. The mouse turns the drone. Q/E apply roll
when level assist is off. L toggles level assist. P toggles prediction.
Tab pauses; Esc closes the window. All bindings use the game binding file.

A portal transfers position, orientation, velocity, and remaining motion.
Wall and rim contacts before the centre crossing take priority. The hook
uses the same link table. Its local mesh anchor remains in its owning space.
The cable stores a similarity transform into the player frame. Length and reeling
use this unfolded frame, not the short distance between two local positions
in the same room. The cable passes through obstacles, as in the game.
A flying hook still snaps at 120 m of unfolded distance. An attached cable
retains its extent until the winch shortens it or the player releases it.

The renderer shows up to six portal crossings. Reaching this view depth does
not stop physical traversal. View storage is a separate render budget; an
exhausted budget rejects the frame with an error. Recordings identify the demo
application and reject playback in the graph game. Use the same level file
for recording and playback.

Use `crust tests.crs collision` for CPU crossing and tether checks.
Use `crust tests.crs portals --width 320 --height 180` for a short check of the
production room links, simulation, and GPU frames on both sides of a portal.
This check does not run an expedition or assert room dimensions or mesh counts.

## Contact sparks

A drone impact above 1.5 body metres per second emits a short spark burst.
Sliding contact above 1 body metre per second emits a sparse trail, up to 36
sparks per second. Hook impacts use the same burst threshold and the hook’s
scale. A hit emits one burst; an attached hook emits no further sparks. A
stationary drone contact emits no sparks. Speed is relative to the contacted
surface, including moving surfaces and portal scale.

Sparks start at the contact point and move into the free side of the surface.
They inherit surface motion and part of the sliding velocity. They slow down,
change from pale yellow to orange, and expire after 0.15 to 0.4 seconds. Solid
contact ends a spark. Portal crossings transform its position, velocity, and
size. Room overlap placements keep it visible at an opening.

The cosmetic pool holds 256 records. New emissions replace the oldest slots
when the pool is full. Reset clears the pool and its random sequence. The fixed
simulation tick owns this state; prediction workers do not copy or update it.
Sparks do not change drone motion, emit light, or cast shadows.

Run `crust tests.crs particles` for contact and sprite checks. The check writes
an impact image to `build/test-sparks.ppm`.
