# Light visibility and surface response

## Surface style

The renderer uses one normal per triangle. It computes this normal from the
submitted positions, after the instance transform. The visible side faces the
camera. Curved parts keep their facets. No asset currently requires smooth
vertex normals or a normal map.

The light equation and palette response do not change. Each point light uses
Lambert diffuse response and inverse-square attenuation:

`amount = max(dot(unit_normal, unit_to_light), 0) / (1 + distance / radius)^2`

The light record stores radius squared. A zero radius disables the light.
Each light contribution is truncated to one of eight intensity bands before
the contributions are added. Ambient light is supplied per space.

Light intensity is sampled on the 16 by 16 screen grid. The selected dither
pattern chooses a grid corner. Visibility is tested at the actual surface pixel,
so the grid does not move a shadow across a wall edge.

## Visibility

A point light affects only surfaces in its declared space. A line segment from
the surface pixel to the light must be clear. Any intervening triangle in that
space blocks the segment from either side. Camera culling does not remove
shadow blockers. This includes retained instances and their transformed geometry.

A cutout triangle blocks light only where its texture sample is opaque. The
shadow query uses the same UV interpolation, address modes, and transparent
palette index as the surface. Full-bright texels remain visible without light.
They do not emit light. They block light like other opaque texels. Triangle
flag bit 2 disables shadow casting. The hook uses this flag so its visible
mesh does not block its own lamp. Prediction markers also use this flag.

The receiver triangle is excluded from its own query. Segment fractions at or
below 0.00001 and at or above 0.99999 are excluded to prevent endpoint contact
from blocking the light. These tolerances scale with the segment length. Content
must keep separate blocking surfaces outside that endpoint interval.

Lights do not travel through transformed portal connections. A lamp must have
a record in each space that it is to illuminate. Portal faces block local light
segments. Ambient light has no visibility test. The camera light follows the
visible camera ray, including transformed views; the visible surface has a clear
camera path by the raster visibility contract.

## Submission and storage

Call `input_lights(input, count)` to select the active count and reserve storage.
Fill all active records before drawing. `LIGHT_DATA` is a header word that gives
the float offset of the records. Each record has an eight-float stride:
seven light values and one unused slot. `LIGHT_SPACE` gives the word offset
of a separate array of unsigned 32-bit room IDs. Call `input_light_space`
for each active light. Room IDs retain all 32 bits.

| Field | Meaning |
| --- | --- |
| 0, 1, 2 | Position in the declared space |
| 3 | Radius squared; zero disables the light |
| 4, 5, 6 | Non-negative RGB intensity |
| 7 | Unused padding |

Storage grows with the count. Eight records are allocated initially; eight is
not a count limit. Growth, geometry allocation, and image resize preserve light
records. Device storage range and allocation failures return an error. Failed
growth preserves the active allocation and count.

Frame submission rejects a count outside the reserved storage, non-finite
values, and negative radius or colour values. A failed frame
must not be presented. Correct the input before submitting another frame.

## Cost and checks

After instance expansion, the GPU uses two levels of bounding-volume trees.
Each retained instance has a triangle tree. All lights share these trees.
A small tree for each light selects instances in the light's room. A separate
tree contains dynamic shadow-casting triangles in that room. A shadow ray
visits intersected bounds and candidate leaves, not the scene triangle list.
Each leaf contains at most four triangles or instances. Escape links avoid
a fixed-size traversal stack and a tree depth limit.

Retained trees remain on the GPU between frames. Mesh data, instance mesh
ranges, transforms, or instance count changes cause a rebuild. Buffer
replacement also causes a rebuild. A changed light or camera does not rebuild
retained trees. Triangle indices are relative to the retained geometry, so
changes in the number of preceding dynamic triangles do not invalidate them.
Instance room and material changes take effect through the current metadata.

The per-light instance trees and dynamic trees are rebuilt each frame. They
read instance metadata and dynamic triangles; they do not scan retained
triangles. Retained trees build in parallel across instances. Each tree splits
on the longest box axis. Unbalanced partitions use equal counts. Bounds are
expanded conservatively for floating-point box intersection. Compute barriers
make completed trees available to raster queries. There is no tree readback.

For triangle capacity T, instance capacity I, and light capacity L, tree
storage uses 84 * ((L + 1) * T + L * I) bytes in each buffer. Storage allocation
and geometry limits include this cost. Available device storage limits the
counts; the tree code does not impose a separate geometry cap.

The raster pass rejects lights in other rooms and contributions below the
first intensity band. Triangle intersection, cutout sampling, and endpoint
rules remain the same. Prediction markers, cockpit display geometry, and
portal number labels do not cast shadows. Physical room geometry, props,
beacons, and cables still cast shadows.

Measure the actual start, start with a flying hook, and ending-room views:

```sh
crust tests.crs benchmark 1024 768 --lit-rooms --width 1024 --height 768
```

On Intel Arc Pro B60, default seed and complexity, the same three views gave:

| View | Per-light triangle rebuild mean | Shared trees mean | Shared trees maximum |
| --- | --- | --- | --- |
| Start | 15.62 ms | 9.32 ms | 9.93 ms |
| Start with hook | 17.39 ms | 10.22 ms | 10.76 ms |
| Ending room | 8.57 ms | 6.63 ms | 6.95 ms |

Each view uses four warm-up frames and eight measured frames. All three image
hashes match the control exactly. These are headless frame times; they exclude
window presentation and compositor cost. Start-room upload, instance expansion,
shadow preparation, and image initialization together fell from 5.97 ms to
0.24 ms. No resolution reduction is used. With the same internal resolution
and 3840 by 2160 output, the hook-lit start view averages 10.37 ms, with a
10.85 ms maximum. This measurement also excludes window presentation.

Run `crust tests.crs render 11`. It checks a closed bulkhead, a transparent
cutout, a blocker in another space, a transformed retained blocker, a distant
lamp, full-bright texels without lamps, and a contributing seventeenth light, a non-shadow-casting surface, and a light
in a room with an ID above the float exact-integer range.
Extra off-screen blockers force multi-level tree traversal in each case.
Each image is compared with the CPU reference. Repeated frames check tree reuse,
changed dynamic counts, source flags, transforms, instance removal and return,
and buffer replacement. It also checks rejected growth,
invalid input, and recovery. With visibility disabled, the closed-bulkhead case
reports 1,092 incorrectly lit pixels outside the reference edge band.

Run `crust tests.crs render 4` for the 50-frame lighting and faceted-pipe
regression. The viewer and expedition checks also use the same generated
faceted parts.

Set `SHARED_AMBIENT` to one to use the ambient RGB at `SPACE_LIGHT` for every
space ID. This mode supports room graphs whose IDs exceed the fixed ambient
table. Zero selects the per-space table and requires IDs within that table.
The graph game uses shared ambient and a camera lamp. This choice does not
change point-light visibility or permit out-of-range per-space table reads.
