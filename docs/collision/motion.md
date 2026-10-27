# Sphere motion and overlap

## Contract

The static solver supplies sphere motion in one collision space.
[Interval queries](kinematic-meshes.md) add moving surfaces and time intervals.
The game uses the interval solver for flight, reeling, and prediction. The collision component has no drone,
input, frame, or level data. The game applies the cable travel constraint before
each contact step.

`collision_move` takes a finite position, displacement, velocity, and positive
radius. The scene must remain unchanged during the call. A successful result
has status zero and no remaining travel. Contact response can remove motion
into a surface. It keeps feasible motion along that surface or a corner crease.

A failed result contains the current position, velocity, unconsumed travel, and
contact identity. Do not use a failed result as a completed step. The game
reports the status, space, instance, surface, and contact count, then stops.
It does not discard remaining travel and continue the run.

| Status | Cause |
| --- | --- |
| 1 | Contact storage allocation or address range failed. |
| 2 | No feasible separation was found for the nearby contact set. |
| 3 | The call reached 1024 contact steps without completion. |
| 4 | The initial centre is inside an explicit solid volume. |
| 5 | The separation path crosses another surface. |

Status 3 is an execution budget, not successful truncation. The caller receives
the unresolved contact and travel. Status 4 identifies the solid instance; its
surface ID is absent because the centre need not touch any triangle.

## Contact set

At each impact, the spatial index finds all triangles within the sphere radius
plus two separation margins. Each triangle supplies a contact normal and a
required separation. Equal normals share the largest separation constraint.
The set is rebuilt at the next impact. A surface that is no longer nearby does
not constrain subsequent motion.

The solver finds the nearest feasible displacement in the intersection of the
contact half-spaces. It tests the unconstrained vector, individual planes,
pairs of planes, and triples of planes. In three dimensions, these candidates
include the solution when the constraints have a feasible intersection. It
checks every candidate against the full set. It does not assume that a corner
has only two surfaces. For velocity and remaining travel, the constraints pass
through zero; zero is always feasible.

A zero determinant is treated as dependent. Separation must meet
every constraint within one eighth of the margin. Velocity and travel use a
roundoff tolerance of `1e-6` times their vector length. An infeasible or
numerically unresolved separation returns status 2. Face contacts retain the
plane normal. Candidate comparison uses the difference of squared distances,
so a large blocked component does not hide a small feasible component.

The margin in metres is:

```text
radius * 0.00002 + max(abs(x), abs(y), abs(z)) * 0.0000005
```

The coordinate term allows for binary32 rounding. Content dimensions and sphere
radii must be representable at their space coordinates. A space-local origin
reduces this rounding cost. The margin is not a fixed world-scale offset.

The solver runs for zero travel as well as moving bodies. It separates an
initial surface overlap, then checks the new position again. The correction
has its own swept query. This query excludes triangles already overlapped at
the start; the contact constraints require separation from those triangles.
It rejects a correction that crosses any other triangle. Recovery therefore
cannot move a body through a separate wall to satisfy a distant corner.

## Solid volumes and body placement

`collision_append` creates two-sided surfaces. Even a closed surface mesh does
not imply filled space. Use this operation for room interiors and open portal
boundaries.

`collision_append_solid` creates an explicit filled volume. A mesh with no triangles is
rejected. At finish, each geometric edge must have exactly two incident faces
with opposite edge directions. Open, inconsistently wound, and non-manifold
edges fail the build. A failed finish preserves the previous scene.

The inside test counts signed ray crossings through the triangle hierarchy.
A nonzero count means inside. Surface orientation must
be consistent within each shell. Opposite shell orientation defines a cavity;
equal orientation defines filled overlapping volume. Edge validation does not
prove that separate faces have no geometric intersections. The winding rule
still specifies the volume in that case.

Space and instance bounds reject outside points before the ray query.
The query skips hierarchy nodes that the ray cannot reach. Shared projected
edges belong to one triangle, so a ray through a face diagonal counts once.
The query uses no temporary allocation. Room surface instances skip this test.

The game builds complete collision volumes for solid parts and capped pipes.
Render face masks can omit hidden faces; they do not remove volume boundaries
from collision. Room panels remain surface instances.

Use `collision_position_valid` for a static scene after spawn, load, or scene
replacement. Use `collision_position_valid_at` when the scene has moving meshes.
These queries reject non-finite positions, invalid radii, embedded centres, and surface
overlap greater than one quarter of the margin. The game checks the spawn and
saved parked position after load. Restart uses the same checked spawn in the
same immutable scene. Each motion call also rejects an embedded centre.

An externally supplied invalid position is rejected, not moved to a guessed
free location. Ordinary surface overlap during motion uses contact recovery.
For a replacement scene, validate all body positions before simulation resumes.
[Kinematic interval queries](kinematic-meshes.md) supply relative motion and
surface velocity for moving colliders. A rebuilt static snapshot does not
provide that contract.

## Storage and cost

Sphere motion is a hot path. Each call owns its contact storage. Eight planes
fit in local storage. Larger sets grow by allocation, with an explicit failure
result. There is no fixed contact-set capacity and no shared mutable scratch
buffer. The continuous sweep and volume query do not allocate.

Candidate enumeration has worst-case fourth-order cost in the number of nearby
planes, because each three-plane candidate checks the complete set. Typical
wall and corner sets have few planes. The 12-plane trapped-body test exercises
the storage growth and infeasible-set path.

## Witness and checks

The generated elbow witness starts at `(4, 0.1, 0)` with travel
`(0, 20, 0)` and a 0.35 m radius. The four-contact loop discarded 13.518690 m of
remaining travel. The contact-set solver completes the step through eight
contacts and leaves the open elbow exit. The stationary plane witness started 0.1 m from the plane;
the old loop left 0.25 m of penetration. The contact-set solver separates this
state with zero input travel.

Run the focused checks with `crust tests.crs collision`. This target builds the
collision component, shared math, mesh storage, and small geometry fixtures.
Use `crust tests.crs collision --sanitize` for AddressSanitizer and
UndefinedBehaviorSanitizer. Add `--build-only` to compile without execution.
The checks cover:

- The elbow witness and 2400 repeated sliding steps along its bend.
- Acute corners with slopes of 0.2 and 0.00005 that preserve crease travel.
- Two-plane and three-plane overlap, and conflicting contact constraints.
- Separation blocked by a second wall.
- Coplanar seams and 200 repeated stationary steps without drift.
- Rotated instances, translated spaces, and body scales of 0.01, 1, and 100.
- Embedded spawns in a box and a closed concave elbow, plus an empty room.
- Rejection of an open mesh supplied as a solid.

The component target checks the contact solver. Game layout and expedition
completion are separate checks.

The scaling witness used 16 predictions of 240 ticks. Its largest case took
about 7 ms with the four-contact loop and about 8 ms with the contact-set
solver in an optimized build. This checks the production path; it does not bound the cost of a dense local contact set.

The standalone executable takes 0.04 s in the optimized build and 1.04 s with
sanitizers in the measured run. The first sanitizer build plus execution took
14.82 s. These times separate test execution from compiler work.
