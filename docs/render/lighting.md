# Light visibility and surface response

## Surface style

The renderer uses one normal per triangle. It computes this normal from the
submitted positions, after the instance transform. The visible side faces the
camera. Curved parts keep their facets. No asset currently requires smooth
vertex normals or a normal map.

Point lights use a softened angular response and distance attenuation:

`amount = sqrt(max(dot(unit_normal, unit_to_light), 0)) / (1 + distance / radius)^2`

This response increases light on surfaces at grazing angles. It reaches zero
continuously at the light horizon. Back-facing surfaces receive no direct light.
The camera lamp keeps the Lambert angle term, without the square root.

The light record stores radius squared. A zero radius disables the light.
Each light contribution is truncated to one of eight intensity bands before
the contributions are added. Ambient light is supplied per space.

Light intensity is sampled on the 16 by 16 screen grid. The selected dither
pattern chooses a grid corner. Light intensity and room-light shadow visibility
use that same corner, projected onto the receiving triangle plane. Shadow
boundaries follow the screen grid and its dither pattern. The sample can lie
outside the triangle; depth, texture coverage, and portal masks still use the
actual pixel. Portable lights remain unshadowed.

## Visibility

A room light (`LIGHT_ROOM`) affects only surfaces in its declared space. A line segment from
the selected grid sample to the light must be clear. Any intervening triangle in that
space blocks the segment if its front faces the light. Two-sided triangles block
the segment from either side. Camera culling does not remove
shadow blockers. This includes retained instances and their transformed geometry.
Dynamic solids submit all selected faces with outward winding and one-sided
coverage. The camera pass rejects faces that point away from the camera. The
shadow pass rejects faces that point away from the light before the triangle
intersection test. These tests use the same geometry and separate directions.

A cutout triangle blocks light only where its texture sample is opaque. The
shadow query uses the same UV interpolation, address modes, and transparent
palette index as the surface. Full-bright texels remain visible without light.
They do not emit light. They block light like other opaque texels. Triangle
flag bit 2 disables shadow casting. The hook uses this flag so its visible
mesh does not cast shadows from room lamps. The tether, prediction markers,
and generated convex room shells also use this flag. Room shells still
receive light and shadows from interior props. A shell cannot block a segment
between an interior lamp and another interior surface. Excluding the shell
also prevents grid samples beyond a face edge from producing false shadows
from adjacent shell faces. Collision and portal visibility do not change.

The receiver triangle is excluded from its own query. Segment fractions at or
below 0.00001 and at or above 0.99999 are excluded to prevent endpoint contact
from blocking the light. These tolerances scale with the segment length. Content
must keep separate blocking surfaces outside that endpoint interval.

Game objects have one primary room and one physical position. A room anchor
refers to the object and maps its primary frame into another room. Several
anchors can refer to the same object in the same room. Simulation state is not
copied. Light emission, collision queries, and the visible hook use these
placements.

The game expands light anchors through connections whose apertures intersect
the light range. The range ends where even a face-on contribution falls below
the first intensity band. Each link has an explicit reverse index. Expansion
does not immediately return through that reverse link. Each anchor retains its
parent and composed rigid transform. Expansion uses the frame crossing limit;
thus it includes recursive images through that number of connections. This
limit is independent of the number of anchors or room IDs. Allocation failure
stops submission.

Each light anchor supplies a room-local position. All views of that room use
the same anchor list. Camera motion does not move these lights. Fixed lamps
use `LIGHT_ROOM`, with a room-local shadow query for each anchor. The hook uses
`LIGHT_UNSHADOWED`. The player uses `LIGHT_HEADLAMP`, which also has no shadow
query and retains the Lambert angle term. Portable lights can illuminate across
connections; props do not block them. Ambient light has no visibility query.

The renderer also accepts an explicit view-relative light, `LIGHT_VIEW`, for
camera-space effects. The game does not use this mode for physical objects.
The separate camera-light input has the same view-relative purpose.

## Submission and storage

Call `input_lights(input, count)` to select the active count and reserve storage.
Fill all active records before drawing. `LIGHT_DATA` is a header word that gives
the float offset of the records. Each record has an eight-float stride:
seven light values and a mode. `LIGHT_SPACE` gives the word offset
of a separate array of unsigned 32-bit room IDs. Call `input_light_space`
for each active light anchor. Room IDs retain all 32 bits. Only `LIGHT_VIEW`
ignores this room ID.

| Field | Meaning |
| --- | --- |
| 0, 1, 2 | Room position; camera coordinates only for `LIGHT_VIEW` |
| 3 | Radius squared; zero disables the light |
| 4, 5, 6 | Non-negative RGB intensity |
| 7 | `LIGHT_ROOM` (0), `LIGHT_VIEW` (1), `LIGHT_UNSHADOWED` (2), or `LIGHT_HEADLAMP` (3), stored as a float |

Storage grows with the count. Eight records are allocated initially; eight is
not a count limit. Growth, geometry allocation, and image resize preserve light
records. Device storage range and allocation failures return an error. Failed
growth preserves the active allocation and count.

Frame submission rejects a count outside the reserved storage, non-finite
values, negative radius or colour values, and unsupported modes. A failed frame
must not be presented. Correct the input before submitting another frame.

## Cost and checks

After instance expansion, the GPU uses two levels of bounding-volume trees.
Each retained instance has a triangle tree. Room lights share these trees.
A small tree for each room light selects instances in its room. A separate
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

The room-light instance trees and dynamic trees are rebuilt each frame.
These builds read instance metadata and dynamic triangles; they do not scan
retained triangles. Portable lights skip both per-light tree construction and
shadow queries. Retained trees build in parallel across instances. Each tree splits
on the longest box axis. Unbalanced partitions use equal counts. Bounds are
expanded conservatively for floating-point box intersection. Compute barriers
make completed trees available to raster queries. There is no tree readback.

For triangle capacity T, instance capacity I, and light capacity L, tree
storage uses 84 * ((L + 1) * T + L * I) bytes in each buffer. Storage allocation
and geometry limits include this cost. Available device storage limits the
counts; the tree code does not impose a separate geometry cap.

The raster pass rejects room lights in other rooms and contributions below the
first intensity band. Triangle intersection, cutout sampling, and endpoint
rules remain the same. Prediction markers, cockpit display geometry, and
portal number labels, tether geometry, and generated convex room shells do
not cast shadows. Interior props and beacons still cast shadows.

Measure the actual start, start with a flying hook, and ending-room views:

```sh
crust tests.crs benchmark 1024 768 --lit-rooms --width 1024 --height 768
```

The following acceleration comparison used Lambert point-light response for
both versions. On Intel Arc Pro B60, default seed and complexity, the same
three views gave:

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

With the softened point-light response and unshadowed portable hook, the
same native 1024 by 768 views average 9.60 ms, 9.38 ms, and 6.98 ms. The
hook-lit view has a 10.08 ms maximum. Image values change with the angular
response and portable-light visibility rules.

Run `crust tests.crs render 11`. It checks a closed bulkhead, a transparent
cutout, a blocker in another space, a transformed retained blocker, a distant
lamp, full-bright texels without lamps, and a contributing seventeenth light, a non-shadow-casting surface, and a light
in a room with an ID above the float exact-integer range.
Reversed dynamic and retained faces check light-facing rejection. An explicit
two-sided face must still block light from its back side.
Extra off-screen blockers force multi-level tree traversal in each case.
Two translated and rotated portal crossings check portable and player lamps.
A bulkhead checks the portable-light shadow bypass. Unsupported modes are rejected.
Each image is compared with the CPU reference. The bulkhead case checks
visibility at the selected grid corner, including pixels near its shadow edge. Repeated frames check tree reuse,
changed dynamic counts, source flags, transforms, instance removal and return,
and buffer replacement. It also checks rejected growth,
invalid input, and recovery. Using pixel-position shadows instead of grid-corner shadows fails the
bulkhead check outside the reference geometry-edge band.

Run `crust tests.crs hook-light` to check that a solid is invisible from inside
and visible from outside. It also checks an attached-hook wall patch at grazing
incidence. The check uses the actual attachment and lamp code, with camera
light disabled. It saves `build/test-hook-attached.ppm` for visual review.

Run `crust tests.crs render 4` for the 50-frame lighting and faceted-pipe
regression. The viewer and expedition checks also use the same generated
faceted parts.

Set `SHARED_AMBIENT` to one to use the ambient RGB at `SPACE_LIGHT` for every
space ID. This mode supports room graphs whose IDs exceed the fixed ambient
table. Zero selects the per-space table and requires IDs within that table.
The graph game uses shared ambient and a camera lamp. This choice does not
change point-light visibility or permit out-of-range per-space table reads.
