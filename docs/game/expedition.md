# There and Back

Start in the radial room. Find the gold beacon near the closed end of the
ending room. Enter its 2 m activation radius, then return to the cyan beacon
at the start position. The HUD changes to RETURN after collection and shows
ROUND TRIP COMPLETE on return. Backspace resets the run in the same graph.

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

## Graph construction

Each room has a separate local space. The generator does not place rooms in
one global coordinate system or reject connections that overlap in such a
system. Named HEX-6M profiles determine compatibility. Each link chooses one
of six mating rolls. The reverse link is its inverse.

Each of the eight start ports leads to a route of `complexity + 6` pieces.
Corridor choices are 70% straight tunnels and 30% elbows. The generator
places exactly `1 + floor(complexity / 3)` T junctions across these routes.
It does not select X junctions. At the default complexity, this gives two
T junctions in the whole graph.

Junction positions have a fixed spacing: four corridor pieces before the
first possible junction, then five corridor pieces between possible
junctions. The generator selects positions from this set without retries.
Each T side route has four to six corridor pieces before it can join or end.
A join connects open route ends from different start branches. It does not
add a junction room. Construction depth does not restrict joins.

The generator reserves one terminal, joins two start routes, then pairs
remaining route ends across branches where possible. Dead ends close the
remaining sockets. Every port has a reciprocal connection; none opens into
a void. Most wrong turns lead around a loop rather than directly into
another fork.

After all joins, insert a 10 m straight tunnel wherever two non-straight
rooms connect directly. This includes start exits, joins, and terminal entries.
An existing straight tunnel supplies the separation without another insertion.
All paths between decision rooms have at least four two-port corridor rooms.
The start room counts as a decision room.

The generator then computes shortest graph distances from the start. It
replaces a farthest terminal with the ending room. Collection requires travel
to its far end. Complexity mainly increases route length; the junction budget
increases once per three complexity steps. Joins can shorten the shortest
path, so complexity does not prescribe travel time.

Destination room numbers appear above port centres. Gold means unvisited;
cyan means visited. A visit persists until restart. These marks help the
player recognize joins and choose a return route without a global map.

## Flight

Use the shared [flight controls and physics](movement.md). Boost and brake
have unlimited uses and share a three-second simulation cooldown. Each pulse
lasts 0.15 seconds. A press during cooldown is ignored, not queued. If both
arrive in the same ready tick, brake wins. Holding a button does not repeat it.
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
| `src/game/graph/generate.crs` | Connectivity, rolls, and terminal selection |
| `src/game/graph/routes.crs` | Corridor runs, junction quota, and side routes |
| `src/game/graph/assemble.crs` | Room recipes, local meshes, and shared portal links |
| `src/game/graph/progress.crs` | Collection, return, and visits |
| `src/game/graph/view.crs` | Port numbers, beacons, and objective HUD |
| `src/game/flight/` | Shared drone and tether simulation |
| `src/game/host/` | Input, window, recording, and command-line options |

Graph generation and mesh assembly run once at launch. Storage scales with
room and socket counts. Frontier and join selection scan sockets; distance
relaxation repeats edge scans until distances stop changing. Generation can
therefore take quadratic time as complexity grows. The renderer uploads room
meshes once and submits local-space instances. It displays up to six portal
crossings, with 129 reserved views independent of total room count. Exhausted
view storage rejects the frame. Physical traversal has no view-depth limit.
All spaces use shared ambient light plus the camera lamp.

## Checks

```sh
crust tests.crs graph-layout
crust tests.crs flight
crust tests.crs reel
crust tests.crs graph --seed 42 --complexity 8 --width 640 --height 480
crust tests.crs collision
```

The fast `graph-layout` check tests generation without a GPU. It checks the
junction quota, corridor density, and spacing across 101 seed and complexity
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
