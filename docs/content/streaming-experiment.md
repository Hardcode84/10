# Room visibility experiment

The experiment supports cached visibility and partial mesh uploads. Its scope is
visibility selection and retained-list replacement. Collision and source meshes
stay resident. GPU buffer capacity stays allocated.

## Method

Run the production scene builder and Vulkan renderer on three graph-backed levels:

```sh
crust tests.crs streaming levels/shafts.crs --width 960 --height 540
crust tests.crs streaming levels/shaft-1km.crs --width 960 --height 540
crust tests.crs streaming levels/doors-64.crs --width 960 --height 540
```

The runner disables sound and uses headless output. It compares full residency
with three selection methods: portal-plane clipping, aperture separator clipping,
and point-eye clipping. The room methods cover all camera positions in the source
room. The point method covers all directions from one position. Each path uses
its connection transforms and keeps separate clipping state.

For each method, replace the retained mesh list, render, and compare every output
pixel with full residency. A negative control removes all room meshes and must
produce a different image. Render again to measure a warm frame. Sample the start
and twelve portal approaches, then return to the start. The first sample includes
pipeline startup; exclude it from timing summaries. Keep all door leaves resident.

Start a worker forecast with a flying hook while replacing GPU meshes. Compare
its markers with a serial forecast. This checks overlap with retained collision;
it does not check collision eviction or an attached hook.

The bounds are 128 polygon vertices, 64 path levels, and 4096 room visits per
query. Exhaustion selects every room and records the event. These are experiment
bounds. They do not change renderer limits. Floating-point clipping remains an
experimental implementation; image agreement is evidence for the sampled views.

## Measurements

Hardware: Ryzen Threadripper PRO 7995WX, Radeon PRO W7900 Dual Slot, RADV.
Resolution: 960 × 540. Times below are CPU wall times, including completion where
applicable. These are single-run measurements, not Intel or browser results.
MB means one million bytes. The raw records include every sample and query limit.

| Shaft region, 107 rooms | Selected rooms | Query median / maximum, ms | Median upload, MB | Median replacement plus first frame, ms | Median warm frame, ms |
|---|---:|---:|---:|---:|---:|
| Full residency | 107 | — | 25.93 | 58.91 | 5.35 |
| Portal planes | 25–64 | 0.279 / 0.528 | 11.34 | 32.04 | 5.25 |
| Aperture separators | 10–31 | 75.860 / 115.982 | 6.04 | 18.46 | 5.24 |
| Point eye | 9–21 | 0.567 / 1.562 | 4.70 | 15.12 | 5.26 |

Query time is separate from replacement time. The renderer already rejects
invisible geometry, so selection gives little warm-frame benefit in these views.
The current replacement path uploads every selected mesh array and rebuilds its
retained hierarchy. It retains 43.92 MB of mesh capacity in all four modes.

The separator search considers each source edge with each passing vertex, then
checks the polygons against each candidate plane. Shaft ports have 48 vertices.
Repeating that search along long shafts explains the large CPU cost. Use the
cheap plane result while a worker computes the tighter result. Cache the result;
do not perform this search each frame.

On the 1 km shaft, median uploads stay near 30.20 MB after aperture clipping,
compared with 30.24 MB for full residency. Median warm time stays near 7 ms.
A visible long shaft must retain most of its geometry. Visibility cannot replace
asset sharing or a separate level-of-detail policy there.

All 126 selected-set images matched their full-residency reference exactly.
All three worker forecasts matched four serial markers. The door chain exercised
the query depth limit: incomplete queries retained all rooms. Doors stayed at
their initial closed state; this is not an open-door admission test.

## Loading waves

A second experiment builds a complete room-to-room aperture table, then expands
three visibility waves from the start. This room table is a conservative, broader
approximation of the proposed directed-entrance cache.

| Scene | Rooms | Cache build, s | Table bytes | Wave 0 | Through wave 1 | Through wave 2 | Exhausted table rows |
|---|---:|---:|---:|---:|---:|---:|---:|
| Shaft region | 107 | 4.1 | 45796 | 13 | 44 | 68 | 0 |
| 1 km shaft | 36 | 4.1 | 5184 | 34 | 36 | 36 | 0 |
| Door chain | 73 | 0.11 | 21316 | 73 | 73 | 73 | 6 |

Wave distance alone does not bound residency. Long sightlines and conservative
query exhaustion can select the entire graph.

## Decision and next gate

Proceed with one bounded arena experiment. Keep shell and visibility work off
frame admission. Preserve a cheap conservative result until tighter work finishes.
Require partial uploads and GPU capacity reclamation; clearing the current mesh
list achieves neither.

Before broader integration, prove one room unload and reload across CPU snapshots,
GPU retirement, an attached hook, and prediction. The collision scene and worker snapshots now retain independent room chunks, as
measured below. Admission must select which chunks each job requires before the
game can release unused rooms. Rendering also requires
arena-aware mesh references instead of one global mesh range.

The image tests do not prove light/shadow dependency selection, transformed cycles,
scale cycles, stale-result rejection, or memory-budget recovery. The radial and
cylinder demos have no room graph; the runner rejects them explicitly. Complete
these checks at the ownership gate in the [streaming design](streaming.md#implementation-gate).

The experiment also found and fixed a repeat-upload defect: door upload replaced
CPU source ranges with GPU ranges. Door records now keep both ranges separately.
The door-chain run repeatedly uploads them after different room selections.

Raw results: [shaft region](measurements/streaming-shafts.txt),
[1 km shaft](measurements/streaming-shaft-1km.txt),
[door chain](measurements/streaming-doors-64.txt).
Runner: [tests/streaming](../../tests/streaming).

## Fixed-arena witness

```sh
crust tests.crs arena levels/shafts.crs --width 960 --height 540
crust tests.crs arena levels/prefabs.crs --width 960 --height 540
```

This second experiment reserves one fixed extent inside the current mesh buffers.
The allocator stays in test code. It uses bump allocation, live allocation records,
and generation handles. The rest of the scene uses ordinary retained meshes.
Collision, source meshes, and textures stay resident.

Select the largest room with a valid portal approach. Compare its arena rendering
with the full-residency image. Hide the room as a negative control, release its
allocation, and reload it into the second half of the arena. Then release it,
reset the empty arena, and reload it at the original offset. Compare each restored
image exactly. Reject the old handle after release and after generation reuse.
Also reject an over-budget load, a reset with live data, and a duplicate release;
verify that the live allocation survives those rejected operations.

Submit through `SubmittedFrame`. Release and reset require exclusive renderer
inputs after retirement and no queued instances. Existing ownership checks reject
input access during a submitted frame. No worker waits for this GPU completion.

| Scene | Room triangles | Initial full mesh upload, MB | Room reload, MB | Warm or hidden-room mesh upload |
|---|---:|---:|---:|---:|
| Shaft region | 4744 | 25.93 | 0.835 | 0 |
| Prefab course | 17236 | 12.23 | 3.034 | 0 |

Both restored images match exactly. Removing the target room changes 482467
pixels in each selected view. With a second allocation live, the first half of
the arena remains trapped. Empty-arena reset recovers it. Arena backing capacity
stays allocated; this proves reuse, not release of a GPU buffer to the driver.

The shared renderer now rebuilds and uploads the dirty mesh interval. A regular
renderer regression edits an interior triangle in a multi-triangle mesh, checks
the exact hierarchy upload size and rendered reference, then checks zero mesh
uploads on the next frame. Buffer replacement still requires a full upload.

The CPU snapshot ownership witness below extends this result.
The allocator has no shipping consumer yet. Multiple independent GPU buffers,
room collision reclamation, attached-hook pins, and asynchronous asset generation
still require the complete gate above. Multiple separated edits currently merge
into one dirty interval; use per-arena intervals when adding independent arenas.

Raw results: [shaft arena](measurements/arena-shafts.txt),
[prefab arena](measurements/arena-prefabs.txt).


## Collision snapshot witness

The same `streaming` command now exercises room-owned collision chunks. The
production scene and its worker snapshots share immutable geometry. Each snapshot
owns its instance state and room residency table. Runtime reference counting is
private to the platform layer.

For the shaft scene, a snapshot references about 17.68 MB of geometry and allocates
0.36 MB of private metadata. One measured snapshot took about 0.02 ms on the
machine specified above. Geometry bytes are shared, not copied per context.

The witness prepares a display snapshot, removes the current room from the source
scene, and then starts the production prediction job. The worker uses its retained
snapshot. Rendering uses the display snapshot while the source room is absent.
The four forecast markers and every image pixel match the resident reference.
The source scene releases its reference to 212464 bytes for that room. Its worker,
display, and explicit pin keep the storage alive until their references end.

A focused sanitizer fixture also checks an attached hook after source destruction,
interleaved room instances, stable contact IDs, motion isolation, and restoration.
It checks the final owning reference and lets normal resource destruction release
it. Collision queries into an unloaded room require admission to stop first;
they cannot return an empty-room miss.

This proves independent room lifetime through the current snapshot consumers.
The next integration step is to maintain required-room sets for physics,
prediction, sound, and render snapshots. Prediction admission is tested below. Current game contexts still retain all
rooms. They must release unused references before GPU and CPU residency budgets
can control actual memory use. Pins restored by this witness come from the same
construction; new recipe versions require explicit versioned publication.

Raw results: [collision snapshots](measurements/room-chunks-shafts.txt).


## Collision admission witness

Run `crust tests.crs collision --sanitize` and `crust tests.crs flight`.

The room set selects an exact subset of the snapshot's collision chunks.
The fixture requests a room absent from the source and checks that rejection
preserves the target. It restores that room and repeats admission. The target
then retains the requested room and releases the excluded room.

Continuous sweeps, overlap contacts, correction sweeps, drone motion, and hook
flight report missing geometry across a translated and rotated portal.
They identify the destination room. Reeling and an attached hook also expose
the missing room. Restoring the room makes normal portal motion and hook
attachment succeed. A scaled-portal retry returns the same contact as the
resident reference.

The flight check runs the production prediction task against a selected snapshot.
One case moves the drone through the portal. In a second case only the launched
hook reaches it. Both return the missing room, with no markers or published door
requests. After explicit admission, the repeated job matches the fully resident
forecast's marker positions and door requests.

This completes the prediction admission boundary. The game still creates all
room geometry at load. Integrating asynchronous loading requires required-room
selection for active simulation, sound, and rendering, plus a coordinator that
loads reported rooms and retries from the original state before publication.
The arena allocator still needs that production coordinator and GPU retirement
integration before it can control game residency.
