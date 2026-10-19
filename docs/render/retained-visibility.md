# Persistent geometry and visible work

## Status and decision

This document specifies a renderer replacement. The current implementation
still uses the frame path described in [retained meshes](retained-meshes.md).
Do not claim that this design improves frame rate until the production checks
below pass.

Build a persistent spatial hierarchy for each mesh. Store instances in their
own room spaces. Traverse these hierarchies for each visible portal view.
Queue clusters that survive the visibility tests, then project their vertices
and rasterize their triangles in bounded batches.

Camera movement must not expand, sort, validate, or upload all static triangles.
Instance movement must not rebuild the mesh hierarchy. Dynamic triangle count
must not change static geometry addresses.

## Current failure mechanism

The prefab course submits 117,110 triangles in 80 room instances. The shaft
has approximately 24,600 triangles and the hub has approximately 60,300.
Dynamic effects can change the exact submitted counts.

The current hot path has these costs:

| Path | Work on each frame | Required replacement |
| --- | --- | --- |
| [Instance expansion](../../src/render/device/instances.crs) | Transform and write every retained triangle before view traversal. | Read persistent mesh-local geometry. Transform visible vertices only. |
| [Space membership](../../src/render/host/projection.crs) | Build and sort a pair for every submitted triangle. | Persistent room-to-instance lists; a separate small dynamic list. |
| [Instance layout](../../src/render/host/retained.crs) | Place retained triangles after the dynamic prefix. A changed prefix changes their addresses. | Separate persistent and transient storage and identities. |
| [Batch planning](../../src/render/device/advance.crs) | Schedule all triangles in the view's room. | Traverse spatial bounds before scheduling triangle work. |
| [Projection](../../src/render/device/transform.crs) | Clear fan slots, test faces, transform, and clip scheduled triangles. | Perform this work only for surviving clusters. |
| [Tile binning](../../src/render/device/bin.crs) | Each active tile visits the compacted triangle groups. | Use coarse screen bins to restrict each tile's candidate groups. |

The current per-instance bounds test cannot reject parts of a large room mesh.
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
