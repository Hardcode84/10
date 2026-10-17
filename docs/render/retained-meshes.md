# Retained meshes and the asset viewer

## Submission contract

`Mesh` owns generated triangles and their bounds. Each vertex has a position
and independent UV coordinates. Each triangle has a material, portal ID, and
flags. Bit 0 enables cutout coverage. Bit 1 enables one-sided coverage: the
cross product `(B - A) × (C - A)` points toward the visible side. A one-sided
triangle casts a shadow only when this side faces the light. Lighting uses
normals from transformed positions. Bit 2 disables shadow casting. Negative scale reverses winding.

Call `input_mesh` with a scoped `FrameInput` borrow. It copies the mesh into
renderer-owned storage and returns a `MeshRange`. The source mesh can then
be released. The range stays valid until that renderer closes or
`input_clear_meshes` is called, including across storage growth. Use the range
only with its originating renderer. Mesh storage is append-only between clears.

Call `input_frame` before each frame. Submit dynamic triangles first, then
retained instances. Each `MeshInstance` contains a range, a row-major 3 by 4
affine transform, a space ID, and a material override. The value `0xffffffff`
selects the mesh materials. Positions, UVs, transforms, and transformed
positions must be finite. Bounds come from mesh vertices; preserve them when
copying a range. An empty mesh is permitted. `InstanceList` owns a reusable
list of placements; `input_instances` submits that list.

The renderer grows mesh, instance, and triangle storage from demand. Triangle
and room-projection capacity retain spare space after growth, so a small
addition does not require another scene allocation. If spare capacity would
exceed device storage, the renderer reserves only the required capacity. It checks
Vulkan storage-range limits before replacement. Allocation failure reports an
error. Successful replacement preserves retained meshes and current input.
The new GPU buffer receives the retained pool on its next draw. Otherwise,
unchanged mesh data is not uploaded again.

## Visibility and GPU work

The host transforms each local bound into a world-space axis-aligned bound.
It expands that bound for Float32 rounding. Changed instance data uploads 92 bytes per
instance: five words and eighteen floats. The GPU expands retained triangles
once per instance before view traversal. Dynamic triangles and expanded
triangles then use the same clipping, lighting, and raster passes. Retained
shadow trees are shared by lights and reused until geometry changes. See
[light visibility](lighting.md#cost-and-checks) for the invalidation contract.

At each portal depth, the GPU tests bounds against each actual view's camera
and destination clip plane. It keeps bounds that touch a plane, with a rounding
margin based on the uncombined plane terms. It does not reuse the root camera's
result for a transformed view. A separate one-sided face test also uses the
camera for that view. Portal masks and depth tests determine final coverage.

Each graph room has its own space ID. All room instances are submitted.
A portal view selects its destination space before bounds and face tests.

Expansion cost and projection storage still depend on all submitted triangles.
The visibility table uses four bytes per instance per reserved view. Each mesh
triangle uses 76 bytes in the retained pool. The instance table uses 92 bytes
per reserved instance. See the engine register for the separate frame-transfer
and portal-capacity tasks.

## Shared game assets

The graph assembler builds each room from its Crust recipe, once at launch.
Render and collision meshes share the same hull and openings. The retained
library holds room ranges in local coordinates. Markers and hooks are dynamic.

The player body uses the generated [drone mesh](../../assets/objects/player-drone.crs).
The session builds it once. Each frame submits its current pose as dynamic
geometry, so player movement does not invalidate the retained shadow trees.
Body anchors add placements where the collision sphere overlaps a connection.
Portal views can show the player, including rotated views into the same room.
The outward-facing hull is hidden from the camera inside it. Its surfaces cast
shadows from room lights. Player and hook lights remain unshadowed. Full-bright
front and rear markers do not emit light.

## Viewer

Build from the root source file:

```sh
crust viewer.crs assets/rooms/radial-start.crs
crust viewer.crs assets/rooms/radial-start.crs --view outside --capture build/room.ppm
crust tests.crs assets
crust tests.crs viewer
```

The viewer compiles the supplied Crust recipe. See the
[room viewer contract](../content/parametric-assets.md#implemented-recipe-workflow) for parameter controls,
camera modes, and captures. The retained-instance check keeps its separate
game-asset fixture with 256 copies; it does not define the recipe interface.

## Checks and measurements

```sh
crust tests.crs graph
crust tests.crs game
crust tests.crs body-view
crust tests.crs render 7
crust tests.crs viewer
```

The graph check renders each room with checked shaders. Test 7 converts the portal regression scene to retained instances
with nonidentity transforms. It checks 25 camera states against the CPU ray
reference and compares enabled and disabled culling. The viewer check requires
at least one rejected instance at its first frame when copies exceed one.
All comparisons also check that a second draw uploads no unchanged mesh data.

The old and new game paths were compared at 14 review views. Ten images were
byte-identical. Four differed at a small number of pixels after face winding
was corrected. A controlled build that kept the old vertex order produced
14 identical images. The final implementation uses consistent one-sided
winding; the change in interpolation arithmetic can change a texture sample
or quantized light value near a boundary.

The retained-instance fixture reports CPU submission time and total render/readback time in
nanoseconds. It excludes the first frame. It also reports retained triangle
count, instance count, frame upload bytes, and mesh upload bytes. Use the same
camera, resolution, driver, and frame count for comparisons. The `crust tests.crs viewer` check draws each
frame twice and reads debug data.

The earlier game-asset viewer measured a 60-frame capture at 960 by 540 on
RADV with a Radeon PRO W7900:

| Instances | CPU submission mean | Render and readback mean | Frame upload | Mesh upload after first frame |
| --- | --- | --- | --- | --- |
| 1 | 0.622 µs | 3.52 ms | 575,036 bytes | 0 |
| 16 | 1.247 µs | 4.15 ms | 576,416 bytes | 0 |
| 256 | 13.814 µs | 27.05 ms | 598,496 bytes | 0 |

These runs used asset 0 and no verification pass. Each added instance increased
upload by 92 bytes. The fixed 574,944-byte transfer includes palettes and other
frame data. The [transfer contract](transfers.md) records the reduced uploads.
These measurements establish submission and upload scaling. They do not
establish a speedup over the old renderer.
