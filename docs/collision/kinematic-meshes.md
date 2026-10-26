# Moving mesh contacts and anchors

## Motion contract

Moving meshes use prescribed kinematic bodies. Each instance has a reference origin and
basis, a constant centre velocity, and a constant angular velocity. All values
use the instance's collision space. Time is in seconds. Angular velocity is in
radians per second. The reference pose is at time zero.

The machine drive maintains this motion. Player and hook impulses do not change
the machine trajectory. This is an externally driven body, not a finite-mass
rigid body. Release keeps the player's current velocity.

Append the mesh, then call `collision_set_motion` once before `collision_finish`.
Construction rejects non-finite velocities. Zero velocities specify a static
instance. Geometry and identities remain immutable after construction. Constant
motion remains fixed. Controlled translation uses the schedule below. Queries
can run concurrently on one snapshot. No query changes a pose or rebuilds the index.

For a local surface point `q`, the pose and velocity are:

```
origin(t) = origin(0) + linear_velocity * t
R(t) = rotation(angular_velocity * t) * R(0)
point(t) = origin(t) + R(t) * q
surface_velocity(t) = linear_velocity + angular_velocity cross (R(t) * q)
```

Use `collision_sweep_interval` and `collision_move_interval` for a scene with
moving bodies. Supply a finite start time, nonnegative duration, finite motion,
and positive sphere radius. A zero duration queries one pose. The older
`collision_sweep` and `collision_move` APIs query static instances only.
Use `collision_position_valid_at` for spawn, load, or scene replacement.
A retained attachment belongs to its scene. Clear attachments before replacing
that scene. Instance indices must not be reused through an active attachment.

## Continuous queries and response

The static index serves static instances. A linked list identifies moving
instances without a scan of all static instances. A swept centre bound encloses
each moving mesh for the complete interval.

Translation uses the exact sphere sweep in relative motion. Rotation uses
conservative advancement against triangle distance. Its bounds include relative
linear speed, angular speed, and the mesh radius. A supporting plane bound also
includes the local point acceleration. This bound permits progress near tangent
contact without skipping a rotating surface. Contact distance tolerance is one
quarter of the sphere separation margin from the [motion contract](motion.md).

A query has at most 256 advancement steps per triangle. Status 6 reports failure
to converge or to make numerical progress. It does not report a miss. Motion
retains the failed contact and the unconsumed interval. The game prints the
failure and stops. The 1024-contact motion budget and statuses 1–5 still apply.

At contact, the solver gathers both static and moving surfaces. It projects the
player velocity onto all constraints:

```
dot(player_velocity, normal) >= dot(surface_velocity, normal)
```

It applies corresponding constraints to the remaining displacement and then
continues the continuous query. Rotation can require more contacts as the
surface direction changes. Opposed surfaces can make these constraints
infeasible. Status 2 reports that condition. The solver does not teleport a
body through a machine or silently discard the rest of the step.

The moving-instance list and the per-instance bound use no query allocation.
Translation queries use the mesh index. A rotating mesh that passes its bound
can require a visit to each triangle. Contact storage uses the existing inline
planes and grows when necessary. Thus a large rotating detailed mesh has a
triangle-dependent query cost; it does not have a triangle-count limit.

## Hook and energy contract

The attached cable stores instance identity, surface identity, and the local
surface point. Its anchor is on the surface, not at the projectile sphere
centre. Each simulation tick evaluates that point and its velocity at the end
of the interval. Prediction uses a copy of the same simulation clock and the
same pose function. Rendering uses that pose function too.

The player mass is one. Let `n` point from anchor to player, `a` be anchor
velocity, `v` be player velocity, and `r` be reel speed. Reeling has `r < 0`.
For a taut cable, the constraint impulse is:

```
j = max(0, dot(v - a, n) - r)
v_after = v - j*n
winch_work += -j*r
machine_work += -j*dot(a, n)
cable_loss += j*j/2
```

In the current collision-space frame, this gives:

```
change in player kinetic energy = winch_work + machine_work - cable_loss
```

These counters describe cable impulses. `contact_work` separately records the
net change in player kinetic energy from mesh contact response. It includes
contact dissipation. Force integration and launch recoil are separate from
these counters. All counters are per unit player mass. Only positive winch
work uses battery charge. Machine work can have either sign. It does not use
the player's battery. The machine drive absorbs the opposite cable impulse.

## Integration and checks

The trial and expedition each contain a rotating beam near the start. Its mesh
is a solid collider. The visible beam and collider use the same dimensions and
pose. Physics advances at 120 Hz. Reeling queries the final pose without
advancing machine time again. Replay state includes the simulation clock,
attachment identity, local point, and energy counters in its state hash.

Run these focused checks:

```
crust tests.crs collision
crust tests.crs collision --sanitize
```

The fixture has no level, window, renderer, or shader build. It uses the
production flight, hook, tether, force, and collision components. Checks cover:

- Relative translation time, surface point, velocity, and space isolation.
- A rotating beam which crosses a stationary sphere between endpoint poses.
- A translated and rotated local frame and its retained hook point.
- Fast impacts on a stationary player and rotating contact response.
- Actual projectile launch, attachment, riding, and release.
- Separate winch work, machine work, cable loss, and contact energy.
- Opposed machine contacts that must report infeasible motion.

## Room overlap anchors

A body keeps one primary room and one simulated state. Swept-sphere queries
create room anchors for the apertures that overlap the swept volume. Each
anchor maps the primary room into a query room. A room can occur more than once
with different transforms. The centre crossing still changes the primary room.
The sweep stops at the next centre crossing; the caller transforms the remaining
motion and continues in the destination room.

Before the centre crosses, destination surfaces can contact the body. Contact
points and normals return in the query caller's frame. The contact also retains
the surface room, instance, mesh-local point, and a transform from the surface
room to the caller's frame. Attachments use that transform to preserve the cable
frame. Contact planes and surface velocities use the same transform.

A contact must lie through every aperture on its anchor path. Surface candidates
are checked before nearest-contact selection and before contact planes are
merged. Static room-local queries remain available for mesh inspection. Gameplay
uses the interval queries for both static and moving surfaces.

A reverse connection index identifies the link back to the source. Construction
rejects invalid or non-reciprocal reverse indices. A one-way connection uses the
absent-index value. No polygon comparison is used to find reverse links.
Body overlap traversal reports status 7 on allocation failure or when a path
reaches 1024 connections. It does not silently discard the remaining overlap.

Run crust tests.crs collision for transformed seam contacts, pre-crossing hook
attachments, and moving destination surfaces. Run crust tests.crs hook-light
for physical light anchors and the recursive GPU capture.

## Controlled translation

A controlled body can start a finite translation during a run. It stays in the
moving-body query list while stopped. Each motion has a starting offset and a
final offset from the reference position. The pose stays at the starting offset
before the start time and at the final offset after the stop time. Sweeps split
at these times. Surface velocity is zero outside the motion interval. A new
target starts at the current position. The final offset is stored explicitly,
so a completed closing movement returns exactly to the reference pose.

The open hex stopper contains two separate solid leaves. Each leaf has a retained
render mesh and a collider. Both use the same translation schedule. The jagged
leaf edges and the face texture use one joint profile.
The open octagonal stopper has four leaves. Their edges follow the texture's
central cross and the fixed triangular pipe plates. Each leaf moves diagonally
outward and has a green full-bright indicator. Both door types use the same
controller, prediction trigger, closing delay, and hook-release rules.

A ship forecast requests a door when a predicted segment enters its finite
approach volume from either side. The volume is in the door room's local space.
Prediction splits segments at portals before this test. The next simulation tick
starts the opening movement. Each completed forecast replaces the request for
every door, including doors that are already open. When a request ends, the door
waits for the close delay and then closes. A returning request reverses a closing
door from its current position. A ship in the approach volume also holds the
door open while a forecast is pending. The occupancy check includes the ship
placements in adjacent portal spaces and their scale. A run reset restores the
closed pose. See
[src/game/doors/state.crs](../../src/game/doors/state.crs) for timing and distance
values.

An attached hook releases when its leaf starts to move. A moving leaf rejects a
new hook attachment. Release preserves ship velocity and waits for the tether
control to be released before another launch. Other moving bodies keep
their attachment rules.

Recordings store all door requests on each simulation tick and include controlled
motion and close deadlines in the state hash. Replay uses these requests instead
of forecast completion time. Worker jobs query independent scene snapshots.
