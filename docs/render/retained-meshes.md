# Retained meshes and the asset viewer

## Submission contract

`Mesh` owns generated triangles and their bounds. Each vertex has a position
and independent UV coordinates. Each triangle has a material, portal ID, and
flags. Bit 0 enables cutout coverage. Bit 1 enables one-sided coverage: the
cross product `(B - A) × (C - A)` points toward the visible side. Lighting uses
normals from transformed positions. Negative scale reverses winding.

Call `input_mesh` with a scoped `FrameInput` borrow. It copies the mesh into
renderer-owned storage and returns a `MeshRange`. The source mesh can then
be released. The range stays valid until that renderer closes, including
across storage growth. Use the range only with its originating renderer.
Mesh storage is append-only for this lifetime. Close the renderer to release
its mesh library.

Call `input_frame` before each frame. Submit dynamic triangles first, then
retained instances. Each `MeshInstance` contains a range, a row-major 3 by 4
affine transform, a space ID, and a material override. The value `0xffffffff`
selects the mesh materials. Positions, UVs, transforms, and transformed
positions must be finite. Bounds come from mesh vertices; preserve them when
copying a range. An empty mesh is permitted. `InstanceList` owns a reusable
list of placements; `input_instances` submits that list.

The renderer grows mesh, instance, and triangle storage from demand. It checks
Vulkan storage-range limits before replacement. Allocation failure reports an
error. Successful replacement preserves retained meshes and current input.
The new GPU buffer receives the retained pool on its next draw. Otherwise,
unchanged mesh data is not uploaded again.

## Visibility and GPU work

The host transforms each local bound into a world-space axis-aligned bound.
It expands that bound for Float32 rounding. Each frame uploads 92 bytes per
instance: five words and eighteen floats. The GPU expands retained triangles
once per instance before view traversal. Dynamic triangles and expanded
triangles then use the same clipping, lighting, and raster passes.

At each portal depth, the GPU tests bounds against each actual view's camera
and destination clip plane. It keeps bounds that touch a plane, with a rounding
margin based on the uncombined plane terms. It does not reuse the root camera's
result for a transformed view. A separate one-sided face test also uses the
camera for that view. Portal masks and depth tests determine final coverage.

Rooms in the expedition share one space. All room instances are submitted.
The bounds test can reject a room outside a view; it cannot reject a room
merely because the camera is in a different room. It does not test occlusion.
A wall that hides a room is handled by depth testing.

Expansion cost and projection storage still depend on all submitted triangles.
The visibility table uses four bytes per instance per reserved view. Each mesh
triangle uses 76 bytes in the retained pool. The instance table uses 92 bytes
per reserved instance. See the engine register for the separate frame-transfer
and portal-capacity tasks.

## Shared game assets

The game and viewer call `game_static_build`. It generates room wall panels,
solid faces, and pipe faces once, from the same descriptions used by the game.
The generated library contains 230 triangles for the current expedition.
Gameplay markers, the hook, and other changing geometry remain dynamic.
Collision queries still use the game collision descriptions; this change does
not add mesh collision or cache collision queries.

## Viewer

Build from the root source file:

```sh
crust viewer.crs
crust viewer.crs --asset 0 --capture build/room.ppm
crust viewer.crs --asset 0 --copies 256 --frames 60 --capture build/instances.ppm
crust tests.crs viewer
```

Left and Right select an asset. Space pauses camera rotation. Esc closes the
window. Room shells use a camera inside their bounds. Other assets use an
orbit camera. `--capture` selects headless output. `--width` and `--height`
set image size. Capture defaults to one frame; window mode runs until closed.
`--copies` repeats the selected mesh on a grid without duplicating mesh storage.
An invalid asset index or zero copy count reports an error.

## Checks and measurements

```sh
crust tests.crs review
crust tests.crs game
crust tests.crs render 7
crust tests.crs viewer
```

The room review compares complete pixel images with culling enabled and
disabled. Test 7 converts the portal regression scene to retained instances
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

The viewer reports CPU submission time and total render/readback time in
nanoseconds. It excludes the first frame. It also reports retained triangle
count, instance count, frame upload bytes, and mesh upload bytes. Use the same
camera, resolution, driver, and frame count for comparisons. Use `crust viewer.crs` for timing. The `crust tests.crs viewer` check draws each
frame twice and reads debug data.

A 60-frame capture at 960 by 540 on RADV with a Radeon PRO W7900 gave:

| Instances | CPU submission mean | Render and readback mean | Frame upload | Mesh upload after first frame |
| --- | --- | --- | --- | --- |
| 1 | 0.622 µs | 3.52 ms | 575,036 bytes | 0 |
| 16 | 1.247 µs | 4.15 ms | 576,416 bytes | 0 |
| 256 | 13.814 µs | 27.05 ms | 598,496 bytes | 0 |

These runs used asset 0 and no verification pass. Each added instance increased
upload by 92 bytes. The fixed 574,944-byte transfer includes palettes and other
frame data; R7 covers its reduction. These measurements establish submission
and upload scaling. They do not establish a speedup over the old renderer.
