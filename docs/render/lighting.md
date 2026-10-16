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
mesh does not block its own lamp.

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

The raster pass first rejects lights in other spaces and contributions below
the first intensity band. Only a non-zero contribution starts a shadow query.
The query stops at the first opaque blocker. Its worst-case cost is proportional
to the number of scene triangles for each contributing light and shaded pixel.
There is no light-count truncation or camera-frustum filter for blockers.

A controlled 120-frame demo run, starting at frame zero at 640 by 360 on an
AMD Radeon PRO W7900 Dual Slot, measured these CPU submission, GPU, and readback
times. Both runs used the same light storage and scene. The control disabled
only the visibility query.

| Mode | Median | 99th percentile |
| --- | --- | --- |
| Visibility query disabled | 3.96 ms | 6.03 ms |
| Visibility query enabled | 4.17 ms | 7.72 ms |

This short run supports the complete scan for the current demo. It does not
establish room-scale cost for arbitrary content. Before replacing the scan,
measure the target room and compare the indexed query with the complete query.
Both must produce the same visibility.

Run `crust tests.crs render 11`. It checks a closed bulkhead, a transparent
cutout, a blocker in another space, a transformed retained blocker, a distant
lamp, full-bright texels without lamps, and a contributing seventeenth light, a non-shadow-casting surface, and a light
in a room with an ID above the float exact-integer range.
Each image is compared with the CPU reference. It also checks rejected growth,
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
