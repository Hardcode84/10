# Renderer architecture review

## Decision and scope

Stop expansion of the current global geometry-batch pipeline. Its measured
improvement does not meet the frame budget. Keep the persistent mesh storage
and exact image checks as inputs to a replacement experiment.

The first replacement experiment shall use screen-tile ownership. Each
workgroup traverses spatial bounds, projects a bounded triangle chunk, and
rasterizes its owned pixels. It repeats this work locally until the tile is
complete. A global geometry queue shall not control that loop.

The first 8 by 8 experiment failed its timing gate; see the result below.
Larger screen blocks have not been measured.
Keep lighting separate so that its work and register use can be measured.

Use these engineering targets at 1920 by 1080 on the measured Intel Arc Pro
B60: renderer GPU p99 at most 10 ms, and complete non-pacing frame work p99 at
most 12 ms. The 16.67 ms display interval is a deadline, not the renderer budget.
Record maximum frame time and missed display deadlines as well as percentiles.
These targets reserve time for simulation, effects, and frame-time variation.
They are acceptance targets, not performance claims.

## Geometry requirements

The measured prefab course has 117,110 source triangles and 80 rooms. The shaft
has approximately 24,600 triangles. The hub has approximately 60,300. Much of
this geometry forms thin pipes, flanges, beams, and faceted walls.

| Content | Required representation |
| --- | --- |
| Shaft | A 48-sided shell and spindle, six placed X rotors, and service pipes between rotors. |
| Hub | Eighteen socket faces, eight hexagonal corners, twenty-four cut faces, eight beams, and routed pipes. |
| Pipes | Twelve-sided sections and curved segments. Their silhouettes, shadows, and collision are visible features. |
| Room surfaces | Large polygons, independent UV frames, cutout decals, and portal polygons. |
| Moving objects | Shared rigid meshes with changed poses, including future rotating rotor sections. |
| Effects | Camera-facing sprites, tether geometry, and prediction markers. |

The asset format already has part meshes and placements.
[Part assembly](../../src/assets/parts/assemble.crs) flattens them into room
triangles. [Graph assembly](../../src/game/graph/assemble.crs) then submits one
mesh instance per room. This loses useful placement and surface boundaries.
The six shaft rotors share one 48-triangle source part but become 288 triangles
in the flat room mesh. The immediate saving is small; the placement boundary
is necessary for rotation without rebuilding static room geometry.

The persistent representation shall retain exact positions, indexed triangle
corners, UV seams, stable primitive IDs, part placements, and spatial bounds.
Preserve authored surface IDs where available. A generic mesh path must handle
pipes and arbitrary props. Do not introduce pipe-specific raster rules.

Cold preparation may visit all changed mesh data. Warm work shall depend on
visible spatial regions, portal views, changed placements, and dynamic effects.
Unreachable rooms shall not add triangle work to the current image.

Required image contracts include exact portal masks, destination-plane clipping,
scaled and recursive views, repeated anchors in the same room, cutout opacity,
stable depth ties, two-sided surfaces, sprites, UV modes, vertex snapping,
palette lookup, and screen-grid dithering. A room ID does not identify a view.
Camera-facing geometry and light-facing shadow casters require separate tests.
Keep the current finite affine instance contract, including singular transforms.

## Controlled cost measurements

[The cost table](architecture-cost-probes.csv) records diagnostic runs of the
current renderer. The device is an Intel Arc Pro B60, with Mesa 25.2.8. Each
run uses eight warm-up frames and 128 measured stationary frames at 1080p.
Room 1 is the open hex stopper, room 10 the shaft, and room 11 the hub. All use
pose 0. Each variant uses the same geometry and command schedule.

| GPU median, ms | Passage | Shaft | Hub |
| --- | --- | --- | --- |
| Current renderer | 13.493 | 22.153 | 25.330 |
| Room-shadow tests disabled | 13.656 | 22.135 | 25.283 |
| Lighting evaluation replaced by a constant palette state | 9.268 | 18.428 | 21.024 |
| Current renderer, repeated | 13.493 | 22.153 | 25.331 |
| Zero-workgroup dispatch control | 1.537 | 2.123 | 2.199 |

The constant-lighting diagnostic preserves texture reads, depth, cutouts,
portal decisions, geometry, shadow setup, and command recording. It changes
colour output. It is a cost experiment, not an accepted rendering mode.
Removing lighting still leaves both rotor rooms above the display deadline.
Differences between variants estimate removable work; they are not additive
pass timings because shader compilation and execution can change.

The zero-workgroup control preserves command recording, bindings, updates,
barriers, uploads, and timestamp queries. It replaces direct and indirect
dispatches with direct dispatches of zero workgroups. It produces no valid
image. Its lower cost shows that command processing alone cannot explain the
constant-lighting result. It excludes indirect-argument processing and shader
entry costs, so it is not an exact measure of empty production rounds.

The room-shadow diagnostic is a negative control. The course benchmark uses
`graph_run = false`. [Room lamp submission](../../src/game/graph/lighting.crs)
therefore returns before adding lamps. The shaft and hub contain seven
transported player-light records; the passage contains five. All are unshadowed.
This fixture cannot measure room-shadow cost. Add explicit shadowed lamps and
moving effects to the acceptance route.

The diagnostic edits were confined to a separate checkout. To reproduce them,
use the [course benchmark](renderer-build.md#persistent-visibility-measurements)
with room 1, 10, or 11 and pose 0. In `light_at`, disable only the `light_visible`
condition for the shadow control. For the constant-lighting run, replace the
`lit_state` call in `surface_color` with `LIGHT_STATES - 1`. Restore the source
and repeat the baseline. These edits must not enter the application.
For the zero-workgroup control, change only the native `command_direct` and
`command_indirect` bodies to call `vkCmdDispatch` with zero X workgroups.

## Failure mechanisms

### Dense screen work

[Tile binning](../../src/render/device/bin.crs) visits every projected
32-triangle group for each active 8 by 8 tile. At 1080p, a full screen has
32,400 such tiles. Group bounds reduce triangle tests but do not remove the
tile-by-group scan. Each pixel then scans the resulting bitset in
`next_tile_candidate`. Moving spatial culling before this path leaves its
screen-area multiplier intact.

### Conservative global rounds

The host computes possible geometry work from graph connectivity, then records
a complete planner, transform, compact, bin, raster, and shade sequence for
each round. Invisible paths still contribute to that bound.

| Spawn view | Recorded rounds | Nonempty geometry batches |
| --- | --- | --- |
| Passage | 20 | 5 |
| Shaft | 44 | 10 |
| Hub | 46 | 6 |

At these capacities, each round has six dispatch sites, sixteen barriers,
and five scalar command updates. The hub therefore records 276 geometry
dispatch sites and 736 barriers, before the other frame stages. Empty indirect
dispatches retain command and dependency costs. These are source-derived
command counts using measured round counts; they are not pass-time estimates.

An indirect dispatch changes the number of workgroups. It cannot issue another
producer/consumer dispatch sequence. A finite shared queue between global
stages therefore needs a proven whole-workload capacity, conservative refill
rounds, or host intervention. Cross-workgroup spinning has no portable forward
progress guarantee. Replacing the bitsets with queues without resolving this
contract repeats the scheduling problem.

### Lighting and scene membership

The 16 by 16 lighting grid currently selects sample positions per pixel. It
does not reduce evaluation to distinct samples. Normals, plane intersections,
light loops, and possible shadow queries are repeated. Light selection scans
the global list before rejecting other rooms.

View setup also scans all tasks and instances to find each view's members.
Shadow setup builds per-light instance structures each frame. Persistent room
membership and separate transient storage are appropriate replacements, but
they do not by themselves remove the measured raster cost.

## Replacement proof

### Work ownership

Start with the existing persistent mesh data and portal frontier. One workgroup
owns one `(view, screen tile)` job until that job's geometry is complete:

1. Read its room, transform, exact pixel mask, and destination plane.
2. Construct conservative spatial tests for the tile, including vertex snapping.
3. Traverse room and mesh bounds. Reject subtrees before reading triangles.
4. Load a fixed-size triangle chunk into workgroup storage.
5. Transform, clip, and rasterize the chunk. Each pixel has one owner and keeps
   its nearest depth and stable primitive tie key.
6. Continue the local traversal until all relevant geometry is processed.
7. Store completed visibility and emit winning portal pixels.

Use escape-linked trees or another bounded traversal representation. A full
chunk saves a local cursor. Mesh size changes local loop iterations, not the
number of global geometry dispatch sequences. No workgroup waits for another
workgroup to produce geometry or release queue space.

Keep material and lighting resolve outside this kernel. A larger block can
share setup across more pixels, but may do more rejected work and use more
registers. Compare 8 by 8 ownership with larger blocks through measured variants.
Measure duplicated transforms, tree visits, candidate tests, register use,
spills, and long-running workgroups. Large walls and dense pipe crossings are
required cases. A flat cluster scan is a control for traversal overhead.

### Portal completion

Keep a separate finite sequence for the declared portal crossing budget in the
first proof. At each depth, a pixel follows at most one winning portal. The
active masks for distinct views partition those pixels. Thus the number of
nonempty `(view, tile)` jobs is at most the pixel count, independently of scene
triangle count. Use that proven bound for the initial frontier storage. Report
allocation failure; do not drop masks to fit a smaller queue.

Tile-local recursive portal traversal is a separate experiment. It can remove
global depth passes, but carries more transform state and can increase long
workgroup tails. Do not add it before the geometry-local proof passes.

### Compiler and backend contract

The shared-chunk loop requires a workgroup-uniform continuation condition and
barriers executed by all lanes. Crust now supplies generated
`<workgroup-resource>_uniform_load(index)` accessors for u32 and f32 arrays.
The checker requires uniform participation and a uniform index. Shared-value
continuation loops preserve collective participation after a checked failure.
Native and translated WGSL execution tests cover this contract.

Require no optional 64-bit atomics or subgroup width. Pixel ownership avoids
atomic updates of a combined depth and primitive ID. Backend-specific resource
and submission operations stay below the common renderer API.

### Alternatives

Triangle-driven coarse bins remain a competitor if they provide a measured
storage and completion contract. Increasing a global reference buffer or
recording worst-case refill rounds is not sufficient evidence.

Software primary rays naturally follow portals and avoid projected queues.
They also repeat traversal per pixel. Screen-snapped coverage and affine/span
UV modes require projected-candidate handling to preserve current images.
Test this path only as a bounded challenger if local raster traversal fails.
Do not infer ray throughput from triangle count alone.

Nanite-scale geometry streaming and automatic LOD do not address this workload
first. Analytic pipe intersections would change the generic mesh and image
contract. Neither is part of this proof.

### Lighting after visibility

If lighting remains over budget, compact requested samples into separate work.
For exact reuse, the initial key is `(view, receiver triangle, grid corner)`.
Material follows from the triangle. Room light lists bound the relevant lights.
Per-pixel resolve selects the existing dither corner and consumes its result.

An authored plane ID can permit more reuse only after defining canonical plane
arithmetic and receiver exclusion. Current triangles can differ in floating
point evaluation and exclude only themselves from shadow queries. Equal plane
labels do not prove equal current results. A changed surface contract requires
explicit image review and tests.

## Acceptance and stop conditions

First prove the complete production visibility path, including transformed
portals and final image output. Reuse application mesh ownership and retirement.
Do not build a separate renderer with synthetic-only consumers.

- Aim for at most 5 ms GPU time for geometry, portal visibility, and output
  without lighting at 1080p. The current measurements leave approximately four
  milliseconds for lighting. The complete renderer must meet the 10 ms target.
- Preserve exact coverage, depth ties, cutouts, UV rules, and existing images.
  Check native and WebGPU from the same source.
- Small shared chunks must produce the same image through local continuation.
  Large triangles, dense pipes, singular instances, and portal crossings must
  finish without truncation or unbounded scratch.
- Unreachable rooms must not add triangle work. Dynamic effect counts must not
  invalidate static geometry. The simple passage must not regress.
- Measure full moving routes with the hook, sparks, body anchors, room lamps,
  rotating instances, resize, and near-eye portal crossings. Warm pipelines
  before timed flight. Measure startup separately.
- Use sufficiently long runs for tail latency. The 128 stationary samples are
  attribution probes, not a steady-frame acceptance test. Record frame maxima,
  presentation misses, input timing, and deliberate pacing separately.
- Measure paired CPU and GPU intervals. Subtracting independent percentile
  values does not measure CPU cost. Check diagnostic timing overhead against
  an uninstrumented run.

If the first visibility proof misses its budget, inspect duplicated setup and
workgroup tails, then compare the declared alternative. Stop expansion until
one path passes. A relative speedup alone does not authorize migration.

The generic API retains resource-bounded geometry support. A frame-rate claim
must name device, resolution, and production workload. Extend that workload
when content grows. Test vendor performance separately; Intel timing does not
establish AMD, NVIDIA, or browser timing.

## Research basis

Three independent code and research reviews examined geometry, hot-path costs,
and alternative architectures. Claude Opus reviewed the evidence in two rounds.
The second round included the lighting controls and recorded-round counts.
Claude received a source-derived brief; it did not inspect the repository.

The initial reviews favoured global coarse-bin lists. The follow-up identified
their unresolved bounded-memory and refill contract. Tile-owned local traversal
was selected because that contract is explicit and its duplicated work can be
measured. Agreement between reviewers is not performance evidence.

The review did not adopt estimated ray throughput, a ratio of source triangles
to screen pixels as a coverage estimate, or an 8 ms visibility budget. None
establishes the required headroom. A flat scan that grows with unreachable world
geometry also fails the scene-membership contract, regardless of local timing.
The near-proportional round counts and total times do not prove that empty
rounds dominate. The zero-workgroup control retains substantial command work
but costs far less than the constant-lighting frame.

[Laine and Karras](https://research.nvidia.com/sites/default/files/pubs/2011-08_High-Performance-Software-Rasterization/laine2011hpg_paper.pdf)
separate setup, bin, coarse, and fine raster work and use tile ownership. This
supports local candidate processing. Their CUDA execution assumptions and
timings do not establish a portable implementation or this game's performance.

[The Visibility Buffer](https://www.jcgt.org/published/0002/02/04/) separates
visibility from attribute work. The current renderer already shades winners;
the missing changes are work assignment and repeated sample evaluation.

[Aila and Laine](https://research.nvidia.com/publication/2009-08_understanding-efficiency-ray-traversal-gpus)
show why GPU traversal efficiency depends on execution and work distribution.
A BVH alone does not prove that primary rays will be faster.

[WGSL uniform workgroup loads](https://www.w3.org/TR/WGSL/#workgroupUniformLoad-builtin)
provide a relevant collective contract for local refill loops. Ordinary shared
memory access does not by itself establish uniform control flow.

## Tile-owned experiment result

The first tile-owned implementation fails the performance gate. Keep it disabled
in applications. The course benchmark and renderer regression runner can select
it with the `SPINWARD_TILE_PROOF=1` environment variable.

```sh
SPINWARD_TILE_PROOF=1 crust tests.crs course-benchmark levels/prefabs.crs 11 0 --samples 2 --width 1920 --height 1080 --capture build/tile-proof.ppm
SPINWARD_TILE_PROOF=1 crust tests.crs render 7
```

Omit the variable for the normal-renderer control. A short sample count is only
for rejection probes. The benchmark default remains 128 measured frames.

The implementation uses the existing room membership, retained mesh trees,
instance transforms, portal frontier, and material resolve. Eight setup lanes
traverse disjoint subtrees. A workgroup holds eight clipped triangle slots and
owns an 8 by 8 tile. Consecutive transient triangles share a chunk. The group
continues locally through a checked uniform shared-memory load. Its scratch
size does not depend on the number of mesh triangles.

The hub probe at 1920 by 1080 produced a byte-identical capture. The packed
variant measured approximately 918 ms GPU time, compared with 25.364 ms for
the normal renderer in the paired check. This short rejection probe used eight warm-up frames
and two measured frames. It is sufficient to reject this variant; it cannot
establish tail latency.

The diagnostic frame recorded:

| Work | Count |
| --- | ---: |
| Mesh node visits | 12,157,660 |
| Triangle setup candidates | 9,764,086 |
| Shared chunk rounds | 2,709,872 |
| Largest accumulated round count in a reused task slot | 344 |
| Submitted transient triangles | 220 |

An earlier variant put one transient triangle in each round. Packing up to
eight reduced approximately 1.9 seconds to 0.92 seconds, but retained the
per-tile repetition. The tree bounds prune retained geometry; transient
triangles still reach setup in each relevant tile. The counts include portal
views. They are not counts of unique visible primitives.

This result rejects this implementation as a production replacement. It does
not establish that every tile-owned rasterizer has the same cost. Exact
per-tile clipping, uneven traversal lanes, repeated setup, and synchronization
remain combined in this measurement. No register-pressure or spill attribution
has been established.

Do not add lighting caches or tile-local portal recursion to this variant.
The next architecture comparison must move triangle setup out of these small
tile loops, with an explicit bounded storage and completion contract, or test
the declared primary-ray challenger. Either must first produce the same
production image. The 60 FPS requirement remains unmet.
