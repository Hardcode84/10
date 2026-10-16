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

After instance expansion, a GPU pass builds a bounding-volume tree for each
active light. Each tree contains all shadow-casting triangles in the light’s
room, including dynamic triangles and instances outside the camera view.
Construction reads scene metadata once per light per frame. It partitions
triangle centres on the longest box axis. Unbalanced partitions use equal
counts. Each leaf contains at most four triangles.

The raster pass rejects lights in other rooms and contributions below the
first intensity band. A remaining shadow ray traverses intersected tree bounds
and tests candidate leaf triangles. It does not scan the scene triangle list.
Escape links permit traversal without a fixed-size stack or a depth limit.
Triangle intersection, cutout sampling, and endpoint rules are unchanged.
Bounds are expanded conservatively for floating-point box intersection.

Trees are rebuilt each frame, after transformed geometry is ready. A compute
barrier makes the completed trees available to the raster pass. The GPU keeps
all tree data; the host does not read it back. Tree scratch storage reserves
84 bytes per triangle-capacity unit per light-capacity unit in each buffer.
Storage allocation and geometry limits include this cost. The number of
lights and triangles is limited by available device storage, not a tree cap.

Measure the actual start, start with a flying hook, and ending-room views:

```sh
crust tests.crs benchmark 3840 2160 --lit-rooms --width 960 --height 540
```

On Intel Arc Pro B60, default seed and complexity, the same three views gave:

| View | Linear scan mean | Tree mean | Tree maximum |
| --- | --- | --- | --- |
| Start | 31.36 ms | 14.55 ms | 15.10 ms |
| Start with hook | 50.31 ms | 15.68 ms | 16.35 ms |
| Ending room | 29.11 ms | 7.81 ms | 8.11 ms |

Each view uses four warm-up frames and eight measured frames. All three image
hashes match the linear-scan control exactly. These are headless frame times;
they exclude window presentation and compositor cost.

Run `crust tests.crs render 11`. It checks a closed bulkhead, a transparent
cutout, a blocker in another space, a transformed retained blocker, a distant
lamp, full-bright texels without lamps, and a contributing seventeenth light, a non-shadow-casting surface, and a light
in a room with an ID above the float exact-integer range.
Extra off-screen blockers force multi-level tree traversal in each case.
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
