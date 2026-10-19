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

## Why the tile experiment failed

The [follow-up probes](tile-cost-probes.csv) separate synchronization scope,
triangle setup, pixel tests, and transient geometry. Each run uses the same
stationary hub view, eight warm-up frames, and four measured frames. Timed
frames have no pixel readback. Diagnostic counts come from a separate frame.

The first portal depth always has the same camera, geometry, and full-screen
tile masks. Removing pixel tests changes later portal views. Therefore use
the first-depth timestamp interval for those comparisons. The scope series
includes material resolve in this interval. The setup series moves its end
timestamp before resolve. Do not subtract values between these series.

### Device-storage fences in a shared-memory loop

The original Crust barrier lowered to
`OpControlBarrier Workgroup Device AcquireRelease|UniformMemory|WorkgroupMemory|ImageMemory`.
The generated Intel instructions include both a device-memory eviction fence
and a shared-memory fence. The tile loop has seven synchronization points per
chunk: five explicit barriers and two inside its uniform load.

Only workgroup storage is exchanged between lanes in this loop. Mesh and
texture buffers are read-only here. Each output pixel has one owner. The
next dispatch has a separate command-buffer barrier. Device-storage fences
inside each chunk thus exceed this loop's synchronization requirements.

Changing only the three barrier instructions in the unoptimized SPIR-V module
to workgroup scope and workgroup memory reduces the full frame from 915.529 ms
to 559.029 ms. The capture is byte-identical. The loop and work counts stay
the same. This isolates the barrier contract from geometry changes.

Crust now has `shader_workgroup_barrier()`. Uniform workgroup loads and shared
storage initialization also use workgroup scope. The original
`shader_barrier()` retains storage-buffer and image synchronization. Native
tests check the SPIR-V operands as well as collective execution. WGSL uses
`workgroupBarrier()` for the narrower operation.

### Repeated setup with mostly empty chunks

The first view contains 220 transient triangles. Each is offered to all
32,400 tiles: 7,128,000 transient candidates and 907,200 rounds. There is no
spatial rejection for these triangles before setup.

Retained geometry adds 2,410,904 candidates in 1,682,426 rounds. That is only
1.43 candidates per eight-slot chunk. Eight traversal lanes start in eight
fixed subtrees. A small tile usually intersects a narrow part of the tree.
When seven subtree walkers finish, the remaining walker still supplies only
one triangle per round. Empty slots are not filled from that walker's next
triangles. At most eight of the 64 lanes perform setup; sparse chunks use
still fewer.

Adjacent tiles repeat tree traversal, instance reads, vertex transforms,
clipping, and projection for the same source triangles. The normal renderer
queues 34,273 candidates across the complete frame. The tile experiment queues
9,764,086. These counts measure setup attempts, including candidates rejected
by facing or clipping tests.

| Setup-series control | First-view geometry median, ms |
| --- | ---: |
| Complete tile kernel | 544.423 |
| Pixel tests and winner updates skipped | 481.156 |
| Pixel tests and triangle setup skipped | 115.085 |
| Transient candidates skipped; pixel tests skipped | 427.935 |
| Transient candidates and all setup skipped; pixel tests skipped | 107.663 |

The remaining 115 ms includes traversal, chunk control, shared synchronization,
and the compiled kernel's register costs. It excludes projection and pixel
coverage work. Thus faster pixel tests alone cannot rescue this implementation.
Removing transient candidates saves about 53 ms with setup enabled. Retained
setup and traversal dominate the remaining time.

These are runtime branches in the same compiled shader. They preserve the
first view's membership and tile masks. They do not produce valid final images.
Differences estimate removable work in this kernel; they are not independent
pass timings.

### Clipping copies for polygons already inside a plane

For each clip plane, the old clipper copied every surviving vertex to scratch
and then back. A triangle wholly inside all six planes caused 216 component
stores and 216 corresponding copy loads, in addition to distance calculations.
These copies occur in shared memory in the tile kernel.

A per-plane inside test can return the unchanged polygon immediately. It
preserves vertex order and floating-point values; intersecting polygons still
use the existing clipping arithmetic. In the controlled setup series, this
test reduces first-view geometry from 544.423 ms to 449.613 ms. The complete
capture is byte-identical. With transient candidates skipped, it removes
approximately 94 ms. The extra copies therefore mainly affect retained setup.

The shared clipper now contains this fast path. Both renderer paths use it.

### Register allocation is evidence, not a complete explanation

An Intel Mesa shader dump identifies the original raw tile kernel as SIMD16,
with 5,790 reported instructions, 10 spill stores, 13 reloads, and 10,432 bytes
of workgroup storage. These are static compiler counts. They do not measure
dynamic spill traffic or occupancy.

The lighting shader has 195 spill stores and 183 reloads. It is shared by the
normal renderer and the experiment. Assigning that count to the tile kernel
would be incorrect. The fixed-view probes locate most of the regression before
lighting. No claim that spills alone caused the failure is supported.

Use Mesa's [shader dump controls](https://docs.mesa3d.org/envvars.html) to inspect
the generated code. Match native-code records to pipeline creation order;
this application compiles every pipeline at startup. Disable the shader disk
cache for the dump. Do not use the driver cost estimate as a measured duration.

### Consequence for the replacement

The selected granularity duplicates expensive setup and gives sparse walkers
too little useful work per synchronization round. Correct barrier scope and
an efficient clipper remove avoidable costs, but leave this structural problem.

The next proof needs shared setup across screen tiles and compact candidate
chunks whose occupancy is independent of which subtree supplied them. It also
needs spatial admission for transient geometry. A larger chunk alone does not
repair an idle subtree lane, and removing global dispatch rounds does not
guarantee less GPU work. Preserve the bounded storage and completion contract
when testing that replacement.

After applying the two generic fixes, a separate paired run measures 458.316 ms
for the tile renderer and 25.275 ms for the normal renderer at 1080p. This run
uses eight warm-up frames and sixteen measured frames. Both captures match the
original hub capture byte for byte. The tile path remains disabled by default.

To reproduce the diagnostic series in a separate checkout, reserve one uploaded
header word for a runtime bit mask. Mask value 1 returns from `tile_prepare` after
clearing the fan count. Value 2 skips `tile_select` and winner updates. Value 4
advances over all consecutive transient ranges in one empty round. Value 8 enables
the per-plane inside test; disable the unconditional inside test for the control.
Keep all branches in one shader binary for paired comparisons. Mode numbers in
the CSV are the sums of these bits. Move the first-depth end timestamp before
`shade` for the setup series. Restore all diagnostic edits after the experiment.

## Shared projected-geometry proof

The bounded proof reuses the current batch producer and projection pass. Each
triangle is transformed and clipped once per view and batch. A binary hierarchy
contains screen bounds for groups of 32 compact projected triangles. Each tile
workgroup searches disjoint parts of this hierarchy. It writes the existing
candidate bitmap and uses the normal raster and shade passes.

The hierarchy occupies clipping scratch after projection has completed. For N
projected triangles, even a tree with one triangle per leaf needs fewer than 4N
nodes and four floats per node. N is at most eight times the source batch size.
The tree thus needs fewer than 128 floats per source triangle. The existing
scratch reserves 144. Grouping the leaves reduces this requirement further.
Each view's tree stays within its own batch slice. Empty padded leaves have
empty bounds. No hierarchy lookup crosses a view's allocation.

This proof adds no geometry-sized allocation, reference queue, or host readback.
It keeps the current bounded completion schedule. The final candidate bitmap,
identity order, clipping, cutout tests, portal masks, and lighting are unchanged.
The proof is selected only by test entry points:

```sh
crust tests.crs course-benchmark levels/prefabs.crs --build-only
SPINWARD_PROJECTED_PROOF=1 build/course-benchmark 11 0 --samples 128 \
  --width 1920 --height 1080 --capture build/projected-hub.ppm
SPINWARD_PROJECTED_PROOF=1 crust tests.crs render 7
```

Unset `SPINWARD_PROJECTED_PROOF` for the control. Select the same Vulkan device
for both runs. The test rejects simultaneous selection of the tile-owned and
projected-tree experiments.

### Result and decision

The [paired results](projected-proof.csv) use the Intel Arc Pro B60, eight warm-up
frames, and 128 measured frames at 1920 by 1080. The renderer does not present
frames or read pixels during timing. Each pair has a byte-identical final
capture. Both paths allocate 836,759,040 device bytes and the same staging size.
These tests use fixed production room views. They do not prove moving-camera
frame pacing or room-shadow performance.

| Room | Normal GPU p99 | Projected tree GPU p99 | Projected tree frame p99 |
| --- | ---: | ---: | ---: |
| Passage | 13.65 ms | 13.35 ms | 16.54 ms |
| Rotor shaft | 22.17 ms | 21.37 ms | 25.16 ms |
| Rotor hub | 25.34 ms | 23.32 ms | 27.35 ms |

The proof fails the 10 ms GPU and 12 ms frame targets. Keep the normal path as
the application default. Do not expand this experiment into a new scheduling
system on the strength of the small relative gain.

### Why the proof still fails

Temporary GPU timestamps isolate the first four hub batches in one measured
frame. Projection takes 0.321 ms, compaction and tree construction take 0.826 ms,
binning takes 4.430 ms, and rasterization takes 4.581 ms. The first three shade
calls have no finished view. The fourth shade call takes 5.406 ms, including
portal-mask output. These are pass intervals from a diagnostic frame, not
independent percentile measurements.

Shared projection removes repeated setup, but tile admission still searches
projected groups for each screen tile. Rasterization still searches the dense
candidate bitmap for each pixel. The tree narrows the admission search. It does
not remove either screen-sized cost, and it leaves the batch command schedule
and portal processing in place.

A separate diagnostic removes only the `lit_state` evaluation from
`surface_color`, while retaining texture access and portal classification. The
hub then takes 18.922 ms GPU median and 18.947 ms p99 over 128 samples. The full
proof takes 23.292 ms median. Thus surface lighting accounts for about 4.37 ms
of this comparison. Even removing that work entirely leaves the geometry and
portal path above the target. The diagnostic image is not a valid game image.
The lighting bypass and temporary timestamps are removed from the source.

### Rejected variants

All variants below use the same hub pose and resolution. Each valid-output
variant produces the control capture byte for byte. These short trials use
sixteen measured frames and do not replace the paired acceptance run.

| Variant | GPU median | Cause of rejection |
| --- | ---: | --- |
| Triangle-leaf tree with serial tile collection | 45.33 ms | About 20.5 million serial node visits |
| Grouped tree with shared candidate packing | 49.51 ms | Collection and repeated chunk synchronization remain costly |
| Nonempty-word summary hierarchy | 37.82 ms | Summary construction and dependent successor searches exceed the saved scans |
| Packed nonempty words | 24.01 ms | A second traversal to count and write entries exceeds the raster savings |

The packed-word variant also increases device and staging storage to
1,102,309,376 bytes each. The final proof retains the faster parallel tree
binning and the original dense bitmap. The rejected variants are removed.

The next geometry contract must avoid a tile-by-projected-group search and a
pixel-by-empty-word search together. A bounded spatial assignment pass must
produce only tile intersections and supply directly enumerable candidates.
Before replacing the current producer, prove its overflow continuation through
recursive portal masks and the final image. Measure the whole frame: the
lighting ablation shows that a lighting-only change cannot meet the target.
