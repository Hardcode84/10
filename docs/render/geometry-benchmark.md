# Hardware rasterization comparison

This experiment compares the normal compute renderer, the projected-tree
compute renderer, the direct tile-list experiment, and a Vulkan graphics pipeline. It uses the passage, rotor
shaft, and rotor hub from `levels/prefabs.crs`, at their recipe spawn poses.
The application renderer stays compute-only.

## Workload

All paths use the same retained meshes, instance transforms, camera,
UVs, texture indices, and palettes. The benchmark selects one room. It disables
portal traversal, dynamic triangles, lights, shadows, and the interface. Portal
surfaces remain opaque at the zero-crossing limit. Materials use full-bright
palette entries and perspective-correct UV interpolation.

The graphics pipeline reads the retained vertex data from storage buffers. Its
vertex shader applies instance and camera transforms. Vulkan clips, rasterizes,
interpolates UVs, and tests depth. The fragment shader reads the same indexed
textures and palettes as compute. Cutout texels discard the fragment. Texture
sampling uses storage-buffer reads in both paths. Hardware texture filtering
is not part of this measurement.

Crust compiles both graphics stages to validated SPIR-V. The benchmark and
Vulkan graphics declarations are in `tests/render/graphics/`. The application
build does not include them.

## Run

Build from the repository root:

```sh
crust tests.crs course-benchmark levels/prefabs.crs --build-only
SPINWARD_GEOMETRY_PROOF=1 build/course-benchmark 11 0 --samples 128 \
  --width 1920 --height 1080
```

Use room 1 for the passage, 10 for the shaft, and 11 for the hub. Select a GPU
with `VK_DRIVER_FILES` when necessary. The queue must support graphics.
Run each case separately. Keep other GPU workloads idle.

Each path runs eight warm-up frames and 128 measured frames. The scene stays
fixed. Geometry and textures stay on the device after the first upload.
Pipeline creation, scene construction, image capture, and presentation are
outside the GPU intervals.

The output reports three intervals:

- **GPU:** Complete submitted render work, before pixel readback. Compute
  includes input transfers, view setup, traversal bookkeeping, and composition.
- **Geometry GPU:** Compute visibility, projection, binning, rasterization, and
  texturing for the root view. Graphics includes its attachment clear, draws,
  and attachment transitions. It excludes compute setup and composition.
- **Submission frame:** CPU command preparation, queue submission, and waiting
  for completion. It excludes simulation and presentation.

The benchmark writes `build/geometry-compute.ppm`,
`build/geometry-projected.ppm`, and `build/geometry-graphics.ppm`.
Preserve these files before running another case.
Compare the captures before interpreting timings.

## Results

The [measurement table](geometry-raster.csv) records Intel Arc Pro B60 results
at 1920 by 1080 and 1024 by 768. The course contains 43,342 source triangles
across 80 rooms. Each measured draw selects only the current room.

Geometry GPU intervals at 1920 by 1080, in milliseconds:

| Room | Normal compute p50 / p99 | Projected compute p50 / p99 | Graphics p50 / p99 |
|---|---:|---:|---:|
| Passage | 3.854 / 3.940 | 3.828 / 3.917 | 0.096 / 0.097 |
| Rotor shaft | 6.997 / 7.070 | 6.438 / 6.505 | 0.150 / 0.151 |
| Rotor hub | 9.042 / 9.113 | 8.049 / 8.131 | 0.165 / 0.182 |

The complete hub GPU intervals are 9.47 ms, 8.48 ms, and 0.165 ms at p50.
Compute setup and composition account for approximately 0.43 ms of the
compute totals. The geometry interval accounts for most of the difference.
Hardware rasterization reduces the measured geometry time by 40 to 55 times
against normal compute.

The two compute paths produce identical captures in all six cases.
The passage captures also match hardware graphics exactly. At 1920 by 1080, the shaft differs at
0.220% of pixels and the hub at 0.182%. Differences occur at polygon edges,
coplanar depth ties, and nearest-texel boundaries. Hardware subpixel coverage,
depth interpolation, and UV interpolation do not reproduce the compute
arithmetic bit for bit. RGB root-mean-square errors are 0.714 and 0.369 on a
0 to 255 scale. The table records the image differences at both resolutions.
Vulkan validation, including synchronization validation, reports no errors
for the graphics path.

## Compute acceptance gate

Keep compute rendering as the application architecture. Use hardware graphics
as the performance reference. The next compute experiment must take at most
twice the complete GPU time of hardware graphics for the same workload. Check
both p50 and p99 in each room at both recorded resolutions. Compare paired
runs on the same device with the same input and output dimensions. Include all
per-frame compute setup, scratch clears, geometry passes, texture reads, and
composition. Keep capture, presentation, and cold preparation outside both
intervals. Report submission time and memory use separately.

The current 1080p measurements give these approximate budgets in milliseconds:

| Room | Compute p50 budget | Compute p99 budget |
| --- | ---: | ---: |
| Passage | 0.191 | 0.194 |
| Rotor shaft | 0.299 | 0.302 |
| Rotor hub | 0.329 | 0.364 |

These are acceptance targets. The current compute paths fail them. The measured
hub setup and composition alone take approximately 0.43 ms. A raster-only
replacement with the same surrounding work cannot meet the complete GPU gate.

The next bounded experiment must share triangle setup across screen tiles and
produce directly enumerable spatial candidates. It must remove tile-by-group
searches, pixel-by-empty-word searches, and the current global batch overhead.
Use bounded storage with an explicit completion rule. Do not repeat the failed
per-tile projection and clipping experiment described in the
[architecture review](architecture-review.md).

Check final images before accepting timings. Preserve depth ordering, cutouts,
UVs, and palette values. Investigate image differences; do not increase an error
tolerance to accept a faster path. Use GPU timestamps to separate setup, spatial
assignment, coverage and depth, and shading. Stop expansion if the complete GPU
gate fails. Record the remaining costs and revise the algorithm before adding
more renderer features.

The measured gap applies to the current implementations. It does not establish
an inherent compute performance limit. This isolated gate also does not establish
full-game frame time. After it passes, prove recursive portal masks, transformed
views, lighting, particles, and interface composition through the shared renderer
input contract and final moving-course output. The full-game frame budgets in
the architecture review remain separate acceptance requirements.

## Direct tile-list checkpoint

The benchmark also runs a direct tile-list compute experiment from
`tests/render/scatter/`. The application uses its current renderer. The
[checkpoint table](scatter-raster.csv) records all four paths from paired runs,
with 128 samples after eight warm-up frames. All six direct tile-list captures
match the normal compute captures byte for byte.

Complete GPU times on Intel Arc Pro B60, in milliseconds:

| Room | Output | Normal p50 | Tile lists p50 / p99 | Graphics p50 / p99 | Tile lists / graphics p50 |
| --- | --- | ---: | ---: | ---: | ---: |
| Passage | 1920 by 1080 | 4.284 | 0.268 / 0.291 | 0.096 / 0.097 | 2.79 |
| Passage | 1024 by 768 | 2.109 | 0.149 / 0.150 | 0.045 / 0.045 | 3.29 |
| Shaft | 1920 by 1080 | 7.436 | 0.390 / 0.397 | 0.150 / 0.166 | 2.61 |
| Shaft | 1024 by 768 | 3.563 | 0.310 / 0.317 | 0.074 / 0.074 | 4.19 |
| Hub | 1920 by 1080 | 9.483 | 0.394 / 0.399 | 0.165 / 0.167 | 2.39 |
| Hub | 1024 by 768 | 4.660 | 0.243 / 0.248 | 0.093 / 0.094 | 2.62 |

This checkpoint fails the two-times gate. Keep it as an experiment. It has no
portal recursion, lighting, dynamic geometry, or application consumer. These
exclusions match the hardware comparison. Do not use these results as full-game
frame times.

### Data flow and storage

Cold preparation builds a source-range table from retained instances in the
selected room. Each frame clears tile headers, culls source triangles, projects
admitted vertices, and clips each admitted triangle once. Clipping creates
assignment tasks with at most 256 bounding-box tiles each. A large triangle can
therefore use many workgroups. Assignment appends actual triangle references to
each overlapping tile. Rasterization visits those references, tests coverage
and depth, samples the winning texture, and writes the final pixel directly.
There is no separate pixel clear or composition pass for this root-view output.

The experiment allocates no additional device or staging buffers. It reuses
renderer scratch as follows:

- The batch ID region holds two-word retained source ranges. The primitive
  region holds admitted source IDs. Batch walker words hold counters and pool
  parameters.
- Compact scratch holds two words per admitted source for material data, then
  a queue of three two-word tasks per projection slot.
- Projected scratch holds the existing clipped fans. Clip scratch holds tile
  bounds after projection finishes.
- Tile statistics hold reference counts and overflow heads. Bitmap scratch
  holds 32 inline references per tile, then a shared pool of two-word overflow
  nodes. A node holds a projected triangle ID and the next node index.
- Hit and debug scratch hold contiguous depth and source identity. The normal
  present buffer receives the final color.

The assignment dispatch completes before rasterization reads the lists. Every
node has a unique allocation index. Atomic exchange inserts it into one tile
list. A compute barrier makes both the head and node contents visible to readers.
On pool exhaustion, allocation clamps the counter to its capacity and reports
an error. The pool occupies at most half the unsigned word address space;
capacity plus all concurrently active invocations cannot wrap the counter.

This experiment rejects projection, assignment queue, and reference pool
exhaustion. It also rejects an image with more than 32,768 eight-by-eight tiles
and a source table beyond the dispatch or scratch bounds. It never accepts a
partial image as a valid result. Production integration requires bounded
continuation through these capacities and recursive portal masks. Increasing
fixed capacities does not establish that contract.

Use `SPINWARD_SCATTER_INLINE=1` to exercise overflow lists. Use
`SPINWARD_SCATTER_NODES=0` with that setting to force pool exhaustion. These
controls affect only the experiment. The benchmark writes the additional
`build/geometry-scatter.ppm` capture.

### Cost evidence and rejected changes

A representative 1080p hub capture spends approximately 0.013 ms on tile clear,
0.089 ms on culling, projection, and clipping, 0.039 ms on assignment, and
0.258 ms on rasterization and texturing. These are single-frame stage timestamps;
use the table for complete-workload percentiles. The driver-generated raster
shader has no register spills.

The original passage assignment let one triangle invocation walk its entire
screen bounds. Chunking that work reduced assignment from approximately
0.49 ms to 0.03 ms. A shared error-word atomic in every assignment lane also
serialized work; removing it reduced hub assignment from approximately
0.26 ms to 0.04 ms. Pool exhaustion remains explicit.

The checkpoint excludes variants that failed paired checks: shared-memory
candidate staging, multiple pixels per invocation, precomputed coverage edges,
full-tile coverage flags, separate shading, smaller tiles, fused setup passes,
and an extra clipping fast path. Fused setup helped the hub slightly but made
the passage slower. Full linked lists increased allocation contention; the
retained design uses inline lists with an overflow pool.

The remaining measured cost is coverage, depth, and texture access, followed by
triangle setup. Another algorithm experiment must reduce those costs across all
six cases before application integration. Preserve the current captures and
repeat complete GPU percentiles and image checks for each replacement.

The checkpoint also passed the AMD hub image check, the forced overflow-list
image check, forced pool exhaustion, and Vulkan synchronization validation.
Crust shader tests exercise the new unsigned atomics in storage and workgroup
memory through both SPIR-V and WGSL, including invalid-index and failed-lane
behavior.
