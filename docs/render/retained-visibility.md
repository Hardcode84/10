# Persistent geometry and visible work

## Status and decision

The first implementation is on the renderer branch. It has mesh-local trees,
parallel subtree traversal, resumable cluster batches, persistent instance
lookup, and shared mesh shadow data. Warm camera-only frames upload no mesh
data and perform no retained triangle expansion or triangle sort. Debug
reference checks can still request an expanded copy.

The complete-frame performance gate below is open. The course benchmark
measures synchronous CPU and GPU work without presentation. Keep the measured
scope explicit. Passing image checks and lower headless times do not establish
the required presented-frame p99.

See [the implementation contract](retained-meshes.md) and
[the benchmark command](renderer-build.md#persistent-visibility-measurements).

Build a persistent spatial hierarchy for each mesh. Store instances in their
own room spaces. Traverse these hierarchies for each visible portal view.
Queue clusters that survive the visibility tests, then project their vertices
and rasterize their triangles in bounded batches.

Camera movement must not expand, sort, validate, or upload all static triangles.
Instance movement must not rebuild the mesh hierarchy. Dynamic triangle count
must not change static geometry addresses.

## Baseline failure mechanism

The prefab course submits 117,110 triangles in 80 room instances. The shaft
has approximately 24,600 triangles and the hub has approximately 60,300.
Dynamic effects can change the exact submitted counts.

The baseline frame path had these costs:

| Path | Work on each frame | Required replacement |
| --- | --- | --- |
| [Instance expansion](../../src/render/device/instances.crs) | Transform and write every retained triangle before view traversal. | Read persistent mesh-local geometry. Transform visible vertices only. |
| [Space membership](../../src/render/host/projection.crs) | Build and sort a pair for every submitted triangle. | Persistent room-to-instance lists; a separate small dynamic list. |
| [Instance layout](../../src/render/host/retained.crs) | Place retained triangles after the dynamic prefix. A changed prefix changes their addresses. | Separate persistent and transient storage and identities. |
| [Batch planning](../../src/render/device/advance.crs) | Schedule all triangles in the view's room. | Traverse spatial bounds before scheduling triangle work. |
| [Projection](../../src/render/device/transform.crs) | Clear fan slots, test faces, transform, and clip scheduled triangles. | Perform this work only for surviving clusters. |
| [Tile binning](../../src/render/device/bin.crs) | Each active tile visits the compacted triangle groups. | Use coarse screen bins to restrict each tile's candidate groups. |

The baseline per-instance bounds test cannot reject parts of a large room mesh.
The projected group bounds are computed after triangle projection. They reduce
raster work but cannot remove the earlier triangle work.

The recent GPU measurements exclude CPU work and presentation. They show a
local improvement; they do not establish a 60 FPS frame-time bound. Retain
those measurements as a controlled comparison, not as completion evidence.

## Work classes

Mesh creation, mesh replacement, spatial partitioning, and buffer allocation
are cold paths. They can visit all vertices and triangles in the changed mesh.

Frame preparation, view traversal, cluster selection, and instance pose updates
are hot paths. Their work must depend on changed instances, visited hierarchy
nodes, visible clusters, and dynamic effects. It must not depend directly on
the total number of static triangles in the world.

Capture, GPU counters, and detailed timing are diagnostic paths. Read their
results after the measured frame retires. Do not add a production readback,
queue wait, or synchronous timing query to obtain those results.

## Persistent representation

### Mesh storage

A mesh version owns:

- Mesh-local vertex attributes and indexed triangles.
- Material, portal, and coverage flags for each triangle.
- A stable primitive ID that preserves the source tie order.
- Spatial clusters and a hierarchy over their conservative bounds.

Build clusters by spatial proximity. Source file order is not a spatial index.
Keep vertex attributes exact when making the indexed representation. Do not
merge vertices across a position, UV, or other attribute discontinuity.
Do not change texture mapping, vertex snapping, or cutout behaviour.

Choose cluster vertex and triangle capacities through the production experiment.
They limit one work item, not a mesh, room, or scene. A mesh of any supported
size occupies more clusters. Record cluster occupancy and bound overlap so
that a poor partition can be identified directly.

An optional normal bound can reject a wholly back-facing cluster only when
all its triangles permit that rejection. Mixed winding, two-sided surfaces,
sprites, and mirrored instances need explicit treatment. Use spatial bounds
first; add normal rejection only with a conservative proof and measured value.

### Instances and rooms

A persistent instance identifies a mesh version, a room space, a local pose,
and material overrides. Use a stable instance identity. Remove and create
instances explicitly; do not infer identity from a frame's triangle offset.

Each room owns an instance list and a hierarchy over instance bounds. Pose
changes update the affected bounds and hierarchy ancestors. An anchor can
place one object more than once in the same room. These are distinct instances.

Keep mesh storage, instance storage, and dynamic triangle storage separate.
A particle count change must not relocate mesh data or invalidate static
visibility or shadow structures.

### Ownership and retirement

A frame holds a coherent version of the mesh, instance, room, and portal tables
until all GPU readers retire. A replacement publishes a new version at a frame
boundary. Release old allocations only after the final dependent task completes.

Buffer growth preserves live handles or updates the complete frame table before
publication. No submitted frame may observe a mixture of old and new offsets.
Keep this ownership inside the renderer. Game code must not manage GPU fences
or buffer addresses.

## Per-view visibility and bounded work

Each portal view has its own room, transform, scale, destination clip plane,
and pixel mask. Traverse the room and mesh hierarchies with that view.
Reject bounds outside the view frustum or the portal coverage bounds before
reading leaf triangles. Keep touching bounds conservatively.

The portal mask provides the exact coverage restriction during rasterization.
A screen rectangle around the mask is only a conservative traversal bound.
A view into a room must remain distinct from another view into that room through
a different transformed or recursive portal path.

Queues contain hierarchy continuations and cluster references. They do not
contain copies of every room triangle. When a queue fills, save its traversal
cursor, consume the queued work, and resume. Queue capacity must not truncate
geometry, reduce portal depth, or require a CPU readback between batches.

Use portable compute operations for queue allocation and prefix sums. Verify
the same queue contract in Vulkan/SPIR-V and WebGPU/WGSL. Keep backend resource
and synchronization operations below the common renderer interface.

Project vertices only for selected clusters. Preserve the existing near-plane,
destination-plane, clipping, and coverage rules. Emit screen-space references
into coarse bins, then refine the active fine tiles. A fine tile must not scan
all projected clusters in its room. A large triangle that touches many bins
must remain correct when the bin-reference queue fills.

Keep nearest-hit data across batches. Compare depth first, then the declared
stable primitive tie key. Spatial reordering and queue execution order must
not change equal-depth results. Include view identity where the coverage
contract requires it. Shade and emit child portal masks only after all queued
geometry for that view is complete.

## Shadows and dynamic objects

Use persistent mesh-local acceleration data for shadow queries. Transform each
query into the instance's local space and preserve its finite segment parameter.
Do not build a transformed triangle copy for every light or every frame.
Shadow leaves must still apply cutout, one-sided, inactive, and no-shadow flags.
A surface that does not cast shadows can still be visible.

Visibility and shadow traversal can share spatial data where their contracts
match. Do not reuse the current filtered shadow tree as a visibility tree:
it excludes triangles with no-shadow flags, including visible room surfaces.

Use persistent instances for rigid objects, including the drone and moving
rotors. Use the separate transient path for changing geometry such as sparks
and tether segments. Both paths feed the same depth, lighting, and portal-mask
rules. A moving rigid object changes its pose and bounds, not its mesh vertices.

## Change and invalidation contract

| Change | Required work |
| --- | --- |
| Camera or portal-view transform | Traverse existing hierarchies and regenerate visible screen work. |
| Instance pose or anchor | Update that instance and its room hierarchy bounds. Preserve mesh data. |
| Mesh topology or vertex attributes | Create a new mesh version and rebuild its clusters and hierarchy. |
| Material override or palette | Update material state. Preserve spatial data unless the geometry contract changes. |
| Portal connection | Update connection data and affected view traversal. Preserve unchanged meshes. |
| Dynamic particle or marker count | Update transient geometry only. |
| Output resize | Replace image and screen-work storage. Preserve mesh and room hierarchies. |
| Buffer growth | Publish valid new tables and retire old resources after their readers. |

Validate generated mesh data at the public upload boundary. Internal traversal
consumes that validated version. Do not repeat full mesh validation each frame.
Report allocation and platform failures explicitly. Internal queue continuation
is normal operation, not an overflow fallback that discards work.

## Production experiment and acceptance gates

### 1. Establish the baseline

Use the connected prefab demo and the actual game frame path. Record camera
positions and orientations in the shaft and hub, including views through their
connecting portal, a turn with a small visible region, and an open room view.
Use the same recordings for each comparison. Include a simple tunnel control.

Measure 1024 by 768 and native 1920 by 1080 on Intel. Record the exact GPU and
software backend in the result artifact. Check correctness on AMD and WebGPU.
Do not infer NVIDIA timing from another vendor's result.

Separate cold mesh creation from warm frames. Record CPU preparation, GPU
execution, presentation wait, and complete frame intervals. Report p50, p95,
and p99. Do not add CPU and GPU times when the frame system overlaps them.
Keep capture readback outside the timed interval.

Collect diagnostic counts for static vertices expanded, hierarchy nodes visited,
clusters selected, triangles projected and clipped, bin references, batches,
upload bytes, and peak scratch bytes. These counts must explain any timing gain.

### 2. Prove one complete room path

Implement one path through persistent mesh ownership, room hierarchy traversal,
bounded queues, rasterization, shading, and the final displayed image. Exercise
it with the production rotor mesh and a transformed portal view. Use the same
source geometry and material data as the current path.

Before extending the architecture, require all of these results:

- A warm camera-only frame performs zero static mesh expansion, sorting,
  hierarchy rebuilding, or mesh upload.
- Adding rooms that have no visible portal path does not add triangle work to
  the measured view.
- A small portal opening rejects mesh regions before triangle transformation.
- Increasing transient effect counts does not invalidate static mesh data.
- Image comparison passes for ordinary, mirrored, and scaled portal views,
  cutout surfaces, shared edges, and equal-depth triangles.
- Small queue capacities produce the same image through multiple resumptions.
- Measured complete-frame p95 improves, with no p99 regression in the control
  views. A compiler build or a passing synthetic fixture is not this proof.

If these checks fail, retain the controlled experiment and fix the measured
mechanism. Do not add another dependent subsystem or switch production to the
new path based only on implementation progress.

### 3. Replace the frame-wide triangle path

After the room proof, migrate persistent instances, anchor placements, shadow
queries, buffer growth, and frame retirement. Remove frame-wide instance
expansion and per-triangle space sorting from production. Keep the old renderer
only as a test reference during the migration, then remove duplicate production
paths when the comparisons pass.

The completion target is a warm complete-frame p99 of at most 16.67 ms in the
recorded rotor course at both specified resolutions on the measured Intel GPU.
GPU time alone does not satisfy this target. Preserve resolution, geometry,
lighting, portal depth, and input-to-display behaviour during the comparison.

Document failures with the measured pass, workload count, and ownership or
algorithm contract that must change. Do not replace this gate with an average
FPS claim or a lower-resolution run.

## Implemented vertical slice

Mesh upload creates a separate range for each room. A cold median partition
builds a binary tree in local space. Leaves hold at most four triangles. A
visibility work item can accept a subtree with at most 64 triangles. Stable
source IDs preserve depth ties after this spatial reordering.

At each portal depth, the GPU computes active tile rectangles and instance
planes. Up to 64 lanes traverse disjoint subtrees. Eight traversal rounds form
one work quantum. Per-lane cursors preserve the node, subtree end, and partial
leaf offset. The host records a conservative batch bound from source counts
and instance counts. Queue completion needs no host readback.

A batch queues index ranges. Projection resolves a range once per triangle
and records its source ID for rasterization. Retained instance lookup is built
when mesh ranges or instance count change. A dynamic prefix or pose change
preserves that lookup. The shadow path shares the local tree and transforms
bounds for each query. It supports singular affine instance transforms.

The public batch limit permits small scratch budgets. The retained regression
alternates ordinary instances with grouped room meshes and seven-triangle
batches. It checks final images against the CPU ray reference. The diagnostic
course runner records selected work outside its timed frames. Work counters
saturate at the unsigned 32-bit maximum; the runner rejects a saturated report.

## Measured result

The [measurement table](retained-visibility-results.csv) records 128 frames
after eight warm-up frames for each pose. The GPU is an Intel Arc Pro B60
(BMG G21), with Mesa 25.2.8 and Vulkan loader 1.3.275. Both builds use the same
course, camera poses, resolution, lighting, and portal settings. All 12 final
images match byte for byte. The baseline uses the frame path described above.

These are synchronous frame times. They include CPU submission and GPU
completion. They exclude presentation and pixel readback. Pose 0 uses the room
spawn. Pose 1 faces the first portal from one metre inside the room.

| Resolution | Room | Pose | Baseline p99, ms | Persistent p99, ms |
| --- | --- | --- | --- | --- |
| 1024 × 768 | Shaft | 0 | 22.18 | 18.89 |
| 1024 × 768 | Shaft | 1 | 21.96 | 14.53 |
| 1024 × 768 | Hub | 0 | 23.16 | 17.63 |
| 1024 × 768 | Hub | 1 | 21.42 | 11.57 |
| 1920 × 1080 | Shaft | 0 | 30.26 | 26.27 |
| 1920 × 1080 | Shaft | 1 | 38.31 | 23.09 |
| 1920 × 1080 | Hub | 0 | 39.42 | 29.49 |
| 1920 × 1080 | Hub | 1 | 38.61 | 17.93 |

The CSV also includes the open hex stopper as a passage control. Its GPU p99
increases from 12.14 to 13.61 ms at 1080p, pose 0. Its synchronous frame p99
decreases from 19.25 to 17.10 ms. The extra traversal work has a GPU cost when
little geometry is visible. The shaft spawn GPU time is almost unchanged.
The strongest GPU gains occur at the rotor portal poses.

Warm upload at the shaft spawn decreases from 973,480 to 40,076 bytes per
frame. Mesh upload remains zero. Each device and staging allocation increases
from 818,496,000 to 836,240,640 bytes at 1080p. Capacity separation remains
necessary to remove the large scene-wide scratch reservation.

At 1024 × 768, the shaft spawn visits 2,241 hierarchy nodes and queues 49,830
triangles in 11 nonempty batches. The hub spawn visits 1,329 nodes and queues
32,698 triangles in six batches. These counts include all recursive portal
views. They are not unique source triangle counts.

Decision: retain this measured vertical slice on the renderer branch. The
16.67 ms completion gate remains open. Use these poses to test the next change
before expanding the architecture.

## Remaining acceptance work

The following contracts still require replacement and measurement:

- Room membership is a sorted range list rebuilt each frame. Persistent room
  records must update only changed placements and dynamic ranges.
- Vertex storage has separate attributes for each triangle. An exact cold
  vertex index must preserve UV seams. Visible batches must reuse transformed
  indexed vertices before this representation can reduce projection work.
- Fine tiles still visit compacted triangle groups and candidate bitsets.
  Bounded coarse bins and compact candidate queues must preserve coverage,
  source tie order, and queue continuation. A new pass must beat the measured
  pixel cost before it replaces this path.
- Dynamic geometry and shadow scratch still reserve capacity from the total
  submitted triangle count. Split that capacity from the retained instance
  index. Check allocation growth and retirement with changing particle counts.
- The final gate requires presented-frame p99 at both target resolutions.
  The headless course measurements exclude presentation and input scheduling.

Two measured experiments were removed. Sharing lighting results within one
tile increased GPU time. A summary over empty triangle-bitset words also
increased GPU time. These implementations provide no basis for another layer
of production machinery. Re-test a replacement with packed work and the same
camera recordings before adoption.
