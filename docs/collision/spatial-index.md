# Static collision index

## Contract

The index selects candidate instances and triangles for the
[sphere query](static-meshes.md). It does not change the contact equation.
The game uses it for movement, hook flight, reeling, and both predictions.

A `CollisionBuilder` accepts generated meshes and static rigid poses.
`collision_finish` consumes the builder and creates a `CollisionScene` with
immutable room geometry and private instance state. A failed finish releases construction data and preserves
the previous scene. A successful finish replaces and releases the previous
scene. Queries cannot receive a builder or change a scene.

Dynamic poses do not modify this static index. The [kinematic contract](kinematic-meshes.md)
supplies interval queries with swept bounds and surface velocity. A change to
static geometry requires a new builder and complete scene replacement before
the next query.

## Storage and selection

The scene stores a sorted directory of space IDs. Each space has a balanced
bounding-volume hierarchy over its instances. Each instance has a second
hierarchy over its local triangles. Different spaces never share a query tree,
even when they occupy the same coordinates. IDs need not be consecutive.

Portals have a separate sorted index of room IDs and original portal IDs.
Crossing and overlap queries find the room by binary search, then visit its
connections in append order. This preserves equal-time crossing selection and
reverse links. Rooms can have portals without collider instances. Index storage
is eight bytes per portal; queries require no allocation.

A node stores two bounds, a leaf ID, and the index after its complete subtree.
Queries use that index to skip rejected subtrees. They need no allocation,
recursion, fixed-size traversal stack, or mutable scratch storage. Concurrent
read queries use the same immutable scene.

Instance bounds enclose the eight transformed corners of the local bounds.
Triangle bounds enclose their three vertices. The swept-sphere bounds test
expands these bounds by the radius and a binary32 precision allowance. That
allowance changes candidate selection only. It does not change surface contact
positions, clearance, or normals.

Leaves retain append and surface IDs. Packing faces into room chunks preserves
these IDs.
Equal-time contacts select the deeper initial overlap, then the lowest instance
ID, then the lowest surface ID. The result therefore does not depend on tree
traversal order. Queries do not prune at the current best time; equal-time
contacts remain candidates.

## Construction cost

Construction uses geometric growth for face and instance arrays. It does not
copy the complete scene for each append. The finish step allocates node storage
from the face and instance counts. Allocation and address-range failures return
an error. Transformed bounds outside the coordinate range also return an error.

The builder splits each tree at the median on its longest axis. Both children
therefore contain at most half the items, rounded up. Each split sorts its
range. With an O(n log n) comparison sort, build cost is O(n log-squared n).
Tree depth is O(log n). A tree
with n leaves has 2n-1 nodes. This is a balance guarantee, not a guarantee that
any particular scene has few intersecting bounds.

Adjacency construction sorts undirected edges by their endpoint coordinates.
It compares only faces that share an edge. Manifold meshes therefore take
O(e log e) construction work instead of comparing each face with every face.
For a non-manifold edge with k incident faces, contact adjacency still tests
up to k-squared face pairs. This preserves the first coplanar neighbour rule.
Meshes with many faces on one edge must split that topology or use a grouped
plane/side index to reduce this specific cost; distant triangles no longer
participate in it.

After construction, faces and both tree levels are packed into one immutable
chunk per room. Packing walks each room's instance-tree leaves. It releases the
combined face and node arrays. Temporary sort items and edge records are also
released before the scene is used.

`collision_bytes` reports scene metadata plus referenced chunk bytes. Metadata
includes instance capacity, the space directory, room frames, portals, and the
portal index. Shared geometry counts in each referencing scene. The count
excludes allocator metadata, temporary sort data, and the caller's source mesh.

## Room lifetime

`collision_snapshot` copies private instance, motion, directory, portal, and
frame data. It retains immutable room chunks through atomic reference counts.
Dropping a scene releases its references. The final reference releases the
chunk's faces and trees. Queries perform no reference-count operations.

`collision_room_pin` retains one room independently. `collision_room_unload`
removes only the calling scene's reference. Snapshots and pins retain their own
references. `collision_room_restore` restores a pin from the same construction;
it preserves instance IDs and motion schedules. Geometry replacement still
requires a new construction. Rooms without collider geometry need no chunk.

Residency changes require an exclusive scene borrow. A `CollisionRooms` set
selects chunks from the same scene construction. Allocate the set at scene load;
clear and reuse it between admissions. `collision_snapshot_admit` first checks
all requested source chunks. If one is absent, it returns that room ID and leaves
the target unchanged. Success retains exactly the selected chunks and releases
excluded references. Admission scans the room table and allocates no storage.

Continuous sweeps, overlap contacts, and correction sweeps return
`COLLISION_UNRESOLVED` with a room ID when required geometry is absent. Portal
overlap checks all uncapped body anchors before querying their geometry.
Direct instance queries still require the caller to retain the instance's room.
The game still loads all rooms.

`simulate_admitted` can stop during a speculative tick. Discard that scratch
drone on an incomplete result. Admit the reported room, then retry from the
original state. The ordinary `simulate` entry requires complete coverage and
terminates on a missing room.

The sanitizer test unloads and restores a room, keeps private motion separate,
and queries an attached hook after destroying the source scene. The production
[streaming witness](../content/streaming.md#collision-snapshot-witness)
starts a prediction job while its source room is absent.

## Room regeneration

`collision_rebuild_plan` captures a room's collider IDs and immutable layout.
It retains no face or tree storage. This is a cold loading operation. It scans
the scene instance table and allocates one small record per room collider.

Use the same recipe, parameters, static poses, and collider append order to
build the room again. `collision_rebuild_finish` consumes that room builder and
returns a new `CollisionRoom`. Allocation or construction failure preserves
the previous output. A changed collider layout violates the unchanged-recipe
contract and terminates the operation.

Publish with `collision_room_restore` after the room is unloaded and the build
task has finished. Existing instance records keep their IDs and motion state.
Old snapshots keep their original geometry until their references end.
A recipe or scene-construction change requires a separate publication version;
this API requires the original construction.

The [worker reload witness](../content/streaming.md#worker-regeneration-witness)
checks new geometry with the production renderer and prediction task. The
sanitizer fixture also checks interleaved global IDs, controlled motion, and an
attached hook after the old geometry is released.

## Evidence and checks

Run `crust tests.crs game`. Run only the scaling measurement with
`crust tests.crs game collision`.

The correctness checks compare every contact field against an exhaustive mesh
scan. They include frozen industrial fixtures, 17 rotated instances with concave
openings and curved surfaces, sparse space IDs, overlapping spaces, stationary
overlap, high-speed impacts, equal-time contacts, and empty scenes. Sorted edge
adjacency is also compared with an exhaustive construction check. Every fixture
triangle and every triangle of one rotated curved mesh has a targeted query.
The 17-placement test uses eight evenly spaced faces per instance, including
the first and last face. Each scene also has 128 deterministic queries spread
through the position, radius, and space cases. This avoids repeating the same
full-mesh comparison for every triangle in every copy. A rejected
replacement must leave the previous scene queryable.

Ownership rejection checks prevent scene copies and use of a consumed builder.
The game checks retain movement, hook, winch, prediction, and replay. Test geometry does not select a different production
query implementation.

The scaling fixture uses frozen industrial room and pipe generators from `tests/fixtures/industrial/`.
It adds distant room instances and adds distant pipe surfaces to one compound
room mesh. The nearby geometry and input remain fixed. Half of the added rooms
use a different space. Each row measures 256 independent active ticks and
16 independent prediction paths of 240 simulation ticks. Both use the actual
`simulate` function. Final positions must remain equal across all rows.

The baseline is the linear mesh scan. Both versions use the C backend at O2.
The acceptance target was equal results and at least four times lower prediction
cost in the largest case. The controlled run produced these times:

| Instances | Triangles | Build, scan / index (ms) | Active ticks, scan / index (ms) | Prediction, scan / index (ms) |
| --- | --- | --- | --- | --- |
| 42 | 552 | 1.54 / 0.74 | 5.16 / 0.38 | 73.38 / 5.91 |
| 74 | 1,448 | 17.06 / 1.71 | 43.52 / 0.48 | 662.27 / 7.08 |
| 298 | 6,440 | 224.46 / 6.38 | 169.66 / 0.47 | 2,545.14 / 7.02 |

These measurements precede the addition of complete solid boundaries and
volume classification. See [sphere motion](motion.md) for its measurements.

These values measure the stated CPU workload. They are not frame-rate claims.
Both indices keep the largest prediction case close to the smallest one while
the number of distant surfaces grows. Rendering work is unchanged.

Persistent allocated storage for the three indexed cases is 94,220, 209,804,
and 881,164 bytes. A rebuild temporarily retains the old scene, the new scene,
and the new scene's sort data. Publication releases the old scene; a rejected
build releases the new one. An empty scene needs no index allocation.

The full suite passed. The game suite also passed AddressSanitizer,
UndefinedBehaviorSanitizer, and leak checks. A headless expedition completed
with the same state summary and byte-identical final image as the linear-scan baseline.

The game test executable took 14.15 s with the repeated full-mesh comparisons
and 1.25 s with this coverage split in an optimized build. The contact-solver regressions remain in the default suite.
