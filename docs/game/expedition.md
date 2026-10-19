# There and Back

Start in the radial room. Find the gold beacon near the closed end of the
ending room. Enter its 2 m activation radius, then return to the cyan beacon
at the start position. The HUD changes to RETURN after collection and shows
COMPLETE on return. The completion HUD and terminal show the run time in minutes
and seconds. Time starts with the first thrust, boost, brake, or hook input.
It excludes pauses and stops when the round trip is complete. It uses simulation
time, so slow mode advances it at the slower simulation rate. Backspace resets the run in the same graph.

```sh
crust main.crs --seed 42 --complexity 8
crust main.crs --seed 42 --complexity 8 --width 1280 --height 960
crust main.crs --fullscreen --seed 42 --complexity 8
```

Use `--fullscreen` for a borderless window at the desktop size. `--width` and
`--height` still set the internal render resolution. The output scales to the
window. This option also works with `demo.crs`. It cannot be combined with
`--headless` or `--capture`.

The defaults are seed 1 and complexity 3. Seed accepts an unsigned 32-bit
integer, including zero. Complexity must be positive and fit the graph's
address range. Allocation failure reports an error. The same options and
build produce the same graph, port rolls, and room numbers.

## Corridor styles

Each connected run of two-port rooms uses one metal texture style. This includes
straight tunnels, elbows, and straight sections inserted during assembly. Style
changes occur at junctions. Start, end, and junction rooms keep their base materials.

Six styles are available: steel plates, folded ribs, tread plates, paired strips,
split bars, and inset studs. The last three have full-bright markings. These
markings remain visible in darkness but do not emit light. They have no travel
direction and do not indicate the goal or visited state.

The seed determines style selection. Selection first tries styles not used by
other corridors at either end. Styles can repeat elsewhere; they are not unique
room identifiers. Style selection does not change graph edges or portal rolls.
A closed run without a junction uses one style throughout.

## Graph construction

Each room has a separate local space. The generator does not place rooms in
one global coordinate system or reject connections that overlap in such a
system. Named HEX-6M profiles determine compatibility. Each link chooses one
of six mating rolls. The reverse link is its inverse.

Each of the eight start ports leads to a route of `complexity + 6` pieces.
Corridor choices are 70% straight tunnels and 30% elbows. The generator
shuffles the start routes, then merges them in pairs through three levels
of T junctions. All eight routes lead toward the goal. No route requires a
return through the start room to reach it.

After these merges, the shared route has `1 + floor(complexity / 3)` forks.
Each fork has two separate corridor routes that join again farther ahead.
The shared route ends at the ending room. Every port has a reciprocal
connection; none opens into a void. The generator does not select X junctions
or add dead ends.

Four to six corridor pieces separate junctions and form each fork arm.
The seven approach merges and two junctions per fork give eleven T junctions
at the default complexity. Junctions are sparse along each flight route;
at least 90% of rooms outside the start are two-port corridors.

After all joins, insert a 10 m straight tunnel wherever two non-straight
rooms connect directly. This includes start exits, joins, and terminal entries.
An existing straight tunnel supplies the separation without another insertion.
All paths between decision rooms have at least four two-port corridor rooms.
The start room counts as a decision room.

The generator computes shortest graph distances from the start. Collection
requires travel to the far end of the ending room. Complexity increases the
approach lengths and adds one fork per three steps. Seed changes corridor
choices, start-route pairs, route lengths after merges, and portal rolls.

Destination room numbers appear above port centres. Gold means unvisited;
cyan means visited. A visit persists until restart. These marks help the
player recognize joins and choose a return route without a global map.

## Flight

Use the shared [flight controls and physics](movement.md). Boost and brake
have unlimited uses and share a simulation cooldown. Pulse timing uses the
[flight tuning definitions](../../src/game/flight/physics.crs).
Hold right mouse with a movement key to burst in that
direction. Hold F to brake. Held inputs repeat when the cooldown ends.
Movement keys apply normal thrust during cooldown. If both actions arrive
in the same ready tick, brake wins.
The tether uses the same projectile, portal, collision, and latched reel rules
as the room demo. There is no charge resource.

The drum is stopped and auto-level is off at launch. F4 changes the spin mode
and restarts the run. L changes level assist. Pause stops simulation time and
the cooldown. Completion freezes simulation until restart.

## Recording and capture

```sh
crust main.crs --seed 42 --complexity 8 --record build/run.rec
crust main.crs --seed 42 --complexity 8 --replay build/run.rec
crust main.crs --seed 42 --complexity 8 --capture build/start.ppm
```

Recordings store the scene, seed, complexity, initial spin mode, commands, and
per-tick simulation hash. Replay requires the same seed, complexity, and build.
A mismatch reports an error. Capture runs without a window and defaults to one
tick. `--ticks N` selects a longer run. Run progress is held in memory.

## Components and costs

| Component | Responsibility |
| --- | --- |
| `src/game/graph/storage.crs` | Owned room and socket arrays, seeded random state |
| `src/game/graph/generate.crs` | Connectivity, rolls, and graph distances |
| `src/game/graph/routes.crs` | Corridor runs, approach merges, and downstream forks |
| `src/game/graph/assemble.crs` | Room recipes, local meshes, and shared portal links |
| `src/game/graph/progress.crs` | Collection, return, and visits |
| `src/game/graph/view.crs` | Port numbers, beacons, and objective HUD |
| `src/game/flight/` | Shared drone and tether simulation |
| `src/game/host/` | Input, window, recording, and command-line options |

Graph generation and mesh assembly run once at launch. Storage scales with
room and socket counts. Route construction takes linear time; distance
relaxation repeats edge scans until distances stop changing. Generation can
therefore take quadratic time as complexity grows. The renderer uploads room
meshes once and submits local-space instances. It displays up to six portal
crossings, with 129 reserved views independent of total room count. Exhausted
view storage rejects the frame. Physical traversal has no view-depth limit.
The start room has a fixed warm lamp at its centre with a 16 m attenuation
radius. The ending room has a fixed warm lamp halfway along its axis with a
12 m attenuation radius. These lamps light only their own rooms and remain
on when the hook is released.

Tunnel ambient light is zero. The camera lamp has a 6 m attenuation radius.
The flying and attached hook adds a yellow point light with a 6 m attenuation
radius. The attached lamp sits outside the contacted surface and follows its
motion. Release or a snapped cable removes the lamp. Player and hook lamps
are unshadowed and follow transformed portal views. Walls and props do not
block them. The hook position uses the tether's portal transform when it is
in another room. Fixed room lamps remain shadowed and local to their rooms.
Full-bright markings remain visible.

## Checks

```sh
crust tests.crs graph-layout
crust tests.crs hook-light
crust tests.crs flight
crust tests.crs reel
crust tests.crs graph --seed 42 --complexity 8 --width 640 --height 480
crust tests.crs collision
```

The fast `graph-layout` check tests generation without a GPU. It checks the
goal access without a return through start, downstream forks, junction counts,
corridor density, and spacing across 102 seed and complexity
combinations. The graph check also tests deterministic generation, connected rooms, cross-branch
joins, reciprocal rolls, and terminal selection. It crosses each assembled
portal in both directions, checks collection and return through the production
step function, and renders every room with checked shaders. Objective checks
place the drone at selected boundaries; they are not a full automatic playthrough.
Flight checks test pulse duration and shared cooldown in both directions.

Claude Opus recommended a route-first graph and destination numbers with visit
cues. The game uses both. It keeps the requested shared cooldown and the
portal-spanning tether. Human play is needed to assess navigation and enjoyment;
a passing simulation check does not measure either.
