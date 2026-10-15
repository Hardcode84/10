# Static collision index

## Contract

The C2 index selects candidate instances and triangles for the C1
[sphere query](static-meshes.md). It does not change the contact equation.
The game uses it for movement, hook flight, reeling, and both predictions.

A `CollisionBuilder` accepts generated meshes and static rigid poses.
`collision_finish` consumes the builder and creates an immutable
`CollisionScene`. A failed finish releases construction data and preserves
the previous scene. A successful finish replaces and releases the previous
scene. Queries cannot receive a builder or change a scene.

Dynamic poses do not modify this static index. C4 must supply a separate
kinematic instance update contract, with swept bounds and surface velocity.
Until that contract is implemented, a changed static assembly requires a new
builder and a complete scene replacement before the next query.

## Storage and selection

The scene stores a sorted directory of space IDs. Each space has a balanced
bounding-volume hierarchy over its instances. Each instance has a second
hierarchy over its local triangles. Different spaces never share a query tree,
even when they occupy the same coordinates. IDs need not be consecutive.

A node stores two bounds, a leaf ID, and the index after its complete subtree.
Queries use that index to skip rejected subtrees. They need no allocation,
recursion, fixed-size traversal stack, or mutable scratch storage. Concurrent
read queries use the same immutable scene.

Instance bounds enclose the eight transformed corners of the local bounds.
Triangle bounds enclose their three vertices. The swept-sphere bounds test
expands these bounds by the radius and a binary32 precision allowance. That
allowance changes candidate selection only. It does not change surface contact
positions, clearance, or normals.

Leaves retain append and surface IDs. Sorting does not move the face records.
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
up to k-squared face pairs. This preserves C1's first coplanar neighbour rule.
Meshes with many faces on one edge must split that topology or use a grouped
plane/side index to reduce this specific cost; distant triangles no longer
participate in it.

Temporary sort items and edge records are released before the scene is used.
`collision_bytes` reports persistent allocated bytes, including spare face and
instance capacity, nodes, and the space directory. It excludes allocator
metadata, temporary sort data, and the source mesh held by the caller.

## Evidence and checks

Run `crust tests.crs game`. Run only the scaling measurement with
`crust tests.crs game collision`.

The correctness checks compare every contact field against an exhaustive mesh
scan. They include actual game geometry, 17 rotated instances with concave
openings and curved surfaces, sparse space IDs, overlapping spaces, stationary
overlap, high-speed impacts, equal-time contacts, and empty scenes. Sorted edge
adjacency is also compared with an exhaustive construction check. A rejected
replacement must leave the previous scene queryable.

Ownership rejection checks prevent scene copies and use of a consumed builder.
The full game checks retain movement, hook, winch, prediction, replay, and
expedition completion. Test geometry does not select a different production
query implementation.

The scaling fixture uses the actual expedition room and pipe generators.
It adds distant room instances and adds distant pipe surfaces to one compound
room mesh. The nearby geometry and input remain fixed. Half of the added rooms
use a different space. Each row measures 256 independent active ticks and
16 independent prediction paths of 240 simulation ticks. Both use the actual
`simulate` function. Final positions must remain equal across all rows.

The baseline is the C1 linear mesh scan. Both versions use the C backend at O2.
The acceptance target was equal results and at least four times lower prediction
cost in the largest case. The controlled run produced these times:

| Instances | Triangles | Build, scan / index (ms) | Active ticks, scan / index (ms) | Prediction, scan / index (ms) |
| --- | --- | --- | --- | --- |
| 42 | 552 | 1.54 / 0.74 | 5.16 / 0.38 | 73.38 / 5.91 |
| 74 | 1,448 | 17.06 / 1.71 | 43.52 / 0.48 | 662.27 / 7.08 |
| 298 | 6,440 | 224.46 / 6.38 | 169.66 / 0.47 | 2,545.14 / 7.02 |

These values measure the stated CPU workload. They are not frame-rate claims.
Both indices keep the largest prediction case close to the smallest one while
the number of distant surfaces grows. Rendering work is unchanged.

Persistent allocated storage for the three indexed cases is 94,220, 209,804,
and 881,164 bytes. A rebuild temporarily retains the old scene, the new scene,
and the new scene's sort data. Publication releases the old scene; a rejected
build releases the new one. An empty scene needs no index allocation.

The full suite passed. The game suite also passed AddressSanitizer,
UndefinedBehaviorSanitizer, and leak checks. A headless expedition completed
with the same state summary and byte-identical final image as the C1 baseline.
