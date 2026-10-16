# Portal traversal capacity

## Configuration

`RenderConfig` selects four independent values at renderer creation:

| Field | Contract |
| --- | --- |
| `portal_budget` | Number of directed portal records; zero is permitted |
| `view_budget` | Maximum total path views in a frame, including the root; must be positive |
| `task_budget` | Maximum masked tile tasks at one depth; must be positive |
| `crossing_limit` | Maximum portal crossings along a pixel path; zero renders the root only |

These values determine storage and command recording. They are not engine
constants. Create a new renderer to change them. Word 4 can select a smaller
crossing limit for a frame. A larger value fails before dispatch. A query pool
uses `4 + 4 * (crossing_limit + 1)` timestamps. The crossing limit must fit this
32-bit query count. Vulkan allocation failures report an error.

A portal ID in triangle metadata is one-based. Zero selects a solid surface.
Portal IDs must not exceed `portal_budget`; a shader check rejects a frame with
an invalid ID. Portal records use zero-based indices. `PORTAL_FLOAT` and
`PORTAL_META` are header slots that contain the current array offsets. Each
portal has 16 float elements and four word elements. Preserve the existing
rigid-transform and destination-plane contract when filling those records.

The game selects the graph portal count, 129 views, six crossings, and enough
tasks for its root tiles. These are application choices. Test 8 also checks
larger portal counts and crossing limits.

## Views and masks

A view is a path through portals, not a space ID. Two paths to the same space
can have different cameras, clipping planes, and coverage. Each child uses
`(parent view, directed portal)` as its key. The lookup table has
`view_budget * portal_budget` entries. The root and all child views consume the
same view budget. A cycle creates another path view at each crossing.

Rasterization stores only nonempty portal masks. Each tile stores a count and
up to 64 records. Each record holds a portal ID and a 64-bit mask. The first
pixel that selects a portal owns its record. Records follow pixel order.
A tile has 64 pixels, so it cannot need more than 64 records, regardless of
the total portal count. Only nonempty masks produce child tasks. Different child masks partition a parent
mask; they do not add coverage. Thus, live task count cannot exceed the image's
pixel count. A smaller task budget can still fail when one tile splits across
several portals.

Each scan workgroup produces a key bitset for its tasks. The bitset length comes
from the selected view and portal capacities. The advance pass combines these
sets across 64 lanes, then allocates child views in key order. No fixed 128-bit key set remains.
Portal IDs use unsigned integer workgroup storage and retain all 32 bits.

Task dispatches use batches of at most 32,768 tasks. This is a dispatch size,
not a work limit. The GPU writes indirect counts for each batch. The host records
all batches required by the selected capacity. Explicit buffer dependencies
order the batch base, indirect commands, shader results, and status accumulation.
Every dispatched workgroup reaches its barrier, including inactive edge lanes.

## Storage and errors

The host calculates layout sizes with 64-bit arithmetic before allocation.
Each word or float storage range must fit `maxStorageBufferRange`. Portal
records survive geometry, asset, and retained-mesh buffer replacement. Scratch
view and work arrays are regenerated each frame.

Let `P` be the portal capacity, `V` the view capacity, and `T` the task capacity.
In addition to geometry and image storage, traversal uses these ranges:

| Range | Four-byte elements |
| --- | --- |
| Portal and view transforms | `16 * (P + V)` floats |
| Two task lists | `8 * T` words |
| Child masks and counts | `193 * T` words |
| View lookup | `V * P` words |
| Portal and view metadata, compact counts | `4 * P + 5 * V` words |
| Task prefixes | `T` words |
| Group counts and prefixes | `2 * ceil(T / 64)` words |
| Group key bitsets | `ceil(T / 64) * ceil(V * P / 32)` words |
| Batch commands | `9 * ceil(T / 32768)` words |

Choose capacities from scene requirements. Child mask storage does not grow with portal count. Group key sets
can still consume substantial memory when several capacities grow together. A layout
that exceeds the device range fails before allocation; it does not truncate an
array. Instance visibility and projected geometry also scale with `V`, as
specified in the retained mesh contract.

Task exhaustion and view exhaustion have distinct frame error codes and
messages. The renderer rejects such a frame; the caller must not present it.
Root tile exhaustion is checked before task writes. A later valid frame resets
traversal state and can succeed on the same renderer.

Reaching the crossing limit is a normal terminal result. The renderer shades
the portal surface at that depth and does not request a child. It does not set
an overflow error. A cyclic connection therefore terminates without consuming
unbounded work.

## Verification

Run `crust tests.crs render 8`. It checks:

- 80 visible directed portals and 81 path views, with different transforms into
  the same destination space.
- One 8 by 8 tile with 64 distinct portals and 65 total path views.
- An 80-crossing cycle using portal ID 81, followed by a zero-crossing render.
- 65,536 child tasks from eight interleaved cutout portals; all batches must run.
- Task and view exhaustion, then recovery on the same renderer.
- Root task exhaustion, an invalid portal ID, and a rejected device-range plan.

Successful images are compared with the independent CPU ray reference. Test 7
also checks translated and rotated paths, clipping, hidden portals, and portal
crossings with retained instances. Both tests passed on RADV with a Radeon PRO
W7900 and on ANV with an Intel Arc Pro B60. No NVIDIA run was available.

For the 25-state retained portal check on the AMD device, the previous median
was 16.7 ms. The generalized bitset path measured 17.6 ms. This includes two
renders and readback per state. A rejected serial candidate scan measured
29.1 ms. These measurements justify the bitset path; they do not claim a speedup.
