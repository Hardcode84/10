# Static mesh collision

## Scope

C1 supplies continuous sphere queries for static triangle surfaces. The game
uses these queries for drone movement, hook flight, reeling, and prediction.
The drone radius is 0.35 m. The hook radius is 0.06 m.

Build collision from the same construction data as the visible mesh. A surface
is two-sided for collision, even if rendering draws only its front side. Texture
cutouts do not remove collision. Model a physical opening as a hole in the mesh.
Do not submit a renderer portal surface as a solid collision surface.

## Ownership and build

`CollisionScene` owns local triangles, static instance records, and a
[spatial index](spatial-index.md). The root
session owns the scene. Simulation and prediction receive checked read borrows.
Surface queries do not allocate, rebuild geometry, or access a global collision
cache. The motion solver owns separate contact storage.
The native provider owns allocation and exposes value records to checked code.

`collision_append` copies a mesh into a `CollisionBuilder` and appends an
instance. `collision_finish` consumes this builder to make an immutable scene.
It accepts a finite
translation and a proper orthonormal basis. It rejects scale, reflection,
non-finite coordinates, and degenerate triangles. Apply dimensions in the
construction recipe. A rejected append preserves all prior instances.

Instance IDs are append indices. Surface IDs are triangle indices within that
instance. They remain valid for the life of the scene. Each append stores its
own triangle data. Allocation and address-range failures return an error.
The game builds room panels, solids, and pipe surfaces before simulation starts.

The build records shared coplanar edges from equal construction coordinates.
An edge is internal only when its adjacent triangles cover opposite sides of
that edge in the same plane. Internal edges do not produce capsule contacts.
Boundary edges and non-coplanar edges remain contact features. For surface instances, duplicate or
non-manifold surfaces are treated as a union of two-sided triangle surfaces;
they do not define an inside volume.

## Query contract

`collision_sweep` takes a scene, a space ID, a start position, a displacement,
and a nonnegative radius. All query values must be finite. Positions and
lengths must remain within the precision of binary32 coordinates. Simulation
supplies these trusted values; the inner triangle loop does not validate them.

The result contains:

- `hit.time`: the first contact fraction in [0, 1], or 2 for no contact.
- `hit.normal`: the contact normal in the selected space.
- `point` and `local_point`: contact coordinates in the space and instance.
- `instance`, `surface`, and `space`: the contact owner.
- `penetration`: initial overlap depth against the surface, or zero.

Equal-time contacts use append and surface order. At time zero, a deeper surface
overlap takes priority. A stationary query also reports surface overlap. If the
sphere centre is exactly on a surface, winding selects the normal; approaching
motion selects its opposing side. These rules make the result deterministic.

Face tests use the offset plane and triangle containment. Edge tests use finite
cylinders with endpoint spheres. The sphere equation uses the nearest point on
the travel line to avoid subtracting large squared terms at high speed.
Instance bounds reject a query before triangle tests. Both query endpoints
remain part of the continuous interval; high speed does not skip a thin wall.

The surface query does not infer solid volume. C3 adds explicit solid instances,
volume classification, and a contact-set motion solver. See [sphere motion](motion.md)
for spawn validation, overlap recovery, and failure handling.

## Rooms and portals

Each query tests only instances in its selected space. Rooms in different spaces
can occupy identical coordinates. A rigid instance can rotate around any axis.
The query transforms position and displacement into instance coordinates and
returns the normal and contact point in the selected space. Sphere radius and
contact fraction are unchanged by a rigid transform.

Openings can have non-rectangular and concave boundaries. The collider preserves
the opening triangles and their rim. Ordinary connected rooms in one space use
matching open boundaries. The expedition tests sweep each seam in both directions.

A collision query does not transfer a body between spaces. W2 must split movement
at a portal crossing, transfer state, and continue in the destination. It must
also query destination surfaces while a sphere overlaps the opening. This
includes the interval before its centre crosses the portal plane. W2 must apply
the same path to the hook, cable, prediction, and rendering. C1 supplies the
space-local surface query for that work; it does not flatten the portal graph.

## Checks and measured cost

Run `crust tests.crs game`. The checks include:

- Face, edge, and vertex contacts with a 10,000 m displacement, from both sides.
- Tangent contact, stationary surface overlap, and coplanar seam sliding.
- A rotated narrow brace compared with analytic box collision.
- Concave openings with 7, 8, and 13 edges, arbitrary rigid rotation, and isolated
  overlapping spaces. Drone clearance and hook rim contacts are both checked.
- 144 surface samples on a swept, revolved elbow, against its generated triangles.
  Drone movement and launched-hook attachment also use this mesh.
- Invalid instance and mesh rejection without scene replacement.
- Every expedition doorway in both directions, sealed room boundaries, movement,
  hook flight, winching, prediction, replay, and expedition completion.

A controlled run used 2,048 queries across the actual course and expedition.
Both paths used the same positions, displacements, and drone radius. The old
analytic path rebuilt wall panels per query. It took 126.8 ms. The baked mesh
path took 14.2 ms. Each contact time matched within 0.00001 of the query interval. This measures these samples, not
a complete frame or a large generated level.

The two worlds contain 41 instances and 534 triangles. Collision payload is
35,484 bytes, excluding allocator metadata and temporary construction meshes.
There is no query allocation. Existing flight and expedition test summaries,
including their deterministic state hashes, matched the baseline run.

C2 replaces both linear scans with spatial indices and replaces pairwise
adjacency construction with sorted edges. The measurements above record the
C1 baseline. See the [index measurements](spatial-index.md#evidence-and-checks)
for current storage and query behaviour.

For prescribed translation and rotation, use the
[kinematic interval API](kinematic-meshes.md). Static queries exclude moving instances.
