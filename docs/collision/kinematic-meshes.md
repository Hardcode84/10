# Moving mesh contacts and anchors

## Motion contract

C4 uses prescribed kinematic bodies. Each instance has a reference origin and
basis, a constant centre velocity, and a constant angular velocity. All values
use the instance's collision space. Time is in seconds. Angular velocity is in
radians per second. The reference pose is at time zero.

The machine drive maintains this motion. Player and hook impulses do not change
the machine trajectory. This is an externally driven body, not a finite-mass
rigid body. Release keeps the player's current velocity.

Append the mesh, then call `collision_set_motion` once before `collision_finish`.
Construction rejects non-finite velocities. Zero velocities specify a static
instance. Geometry, identities, and motion remain immutable after construction.
Queries can run concurrently. No query changes a pose or rebuilds the index.

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
advancing machine time again. Replay version 11 includes the simulation clock,
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
