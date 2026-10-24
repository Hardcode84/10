# Scaling portals

## Scope and use

Run `crust labyrinth.crs --scaling` for the scaling course. The browser launcher
has a **Scaling portal course** option. Both builds use the same scene and
simulation. The course has two blind hexagonal rooms, at profile scales 1
and 2, with a 60-degree connection roll. A solid stands near the destination
rim. A second solid rotates inside that room. Launch the hook through the
opening, attach it to the rotating solid, and reel across. Reach the gold
beacon, then return to the start. The HUD shows size in scientific notation.
Speed and cable length use base metres.

The implementation includes exact object and anchor scales, scaled collision
queries, actor-specific aperture caps, retained cable paths, and native/web
rendering. Normal generated expeditions keep identity profile scales. Use the
course to assess control feel before adding scale choices to random generation.

Implement positive uniform scale with rotation and translation. Keep one shared
simulation and renderer for native and web builds. Room recipes remain Crust
code. The design extends [room connections](../content/room-format.md),
[sphere motion](../collision/motion.md), and
[object anchors](../collision/kinematic-meshes.md).

A crossing changes the object's size relative to the destination room. Time,
orientation handedness, input controls, and simulation tick duration do not
change. Negative scale, reflection, shear, and independent axis scales are
outside this transform contract and must be rejected at authoring boundaries.

## Exact scale

Use `ScaleRatio` for authored positive `u64` numerator and denominator pairs.
Each portal stores the source and destination profile ratios separately. Use
`Rational` for composed values, with inline `u64` magnitudes and owned limb
storage for larger values. Every stored ratio is reduced by GCD. Identity is `1/1`. Zero is invalid.
Integer and rational operations belong to shared numeric infrastructure, with
no portal or game rules.
Author ratios directly in Crust. Do not infer them from floating-point geometry.

For ratios `a/b` and `c/d`, cancel `gcd(a,d)` and `gcd(c,b)` before multiplying.
Use checked inline products and promote to limb storage when required. The
reverse ratio is `b/a`. Equality compares the reduced pair. Ordered comparison
uses exact arithmetic with sufficient storage. It must not use floating-point
division or overflowing products.

Each object has an exact size ratio relative to its base asset. Each anchor has
an exact ratio from its object's primary room to the anchor room. A placement's
size is their reduced product. Crossing uses:

```text
object_scale_after = portal_scale * object_scale_before
radius = base_radius * float(object_scale)
```

Convert the exact quotient to binary32 with round-to-nearest, ties-to-even. Use
integer quotient and remainder operations to determine rounding; do not first
round each integer through binary64. Inline and limb representations must produce
the same bits. Cache this conversion with the ratio. Use the same multiplication
order for base dimensions on every path. Reciprocal crossings restore the exact
ratio and the same computed radius. They do not restore exact floating-point
positions or rotations.

A fixed `u64/u64` pair is insufficient even near normal physical size. For
example, repeated `3/2` and `1/2` loops can produce `3^40/2^63`, about `1.32`.
The next numerator or denominator product can overflow without a large size
change. Limb storage removes this fixed integer limit. Allocation and address
range failures remain explicit errors.

A crossing prepares all new ratios and converted values before it commits any
object, cable, or room state. Allocation failure leaves the crossing uncommitted
and stops the simulation with the object and portal identity. Never wrap,
saturate, approximate the ratio, or skip the crossing.

Treat ratios as immutable values. Explicit clone functions copy large magnitudes;
small values remain inline. Snapshots own their copies until their tasks and GPU
submissions retire. Cache derived
anchor ratios within their normal storage lifetime. Do not intern every scale
visited for the lifetime of a run. Exact arithmetic belongs at scale changes and
anchor construction, not inside triangle or pixel loops.

Reject non-finite, zero, or unusable derived dimensions. Use the collision
coordinate-resolution contract to assess dimensions at the actual local
coordinates. A finite radius alone does not prove that a contact is resolvable.
Do not increase contact tolerances to hide loss of geometric resolution.

## Transform contract

Store the exact ratio with its portal, object, or anchor owner. The copyable
`SpaceTransform` stores the converted factor. Keep its basis a proper
orthonormal rotation. A transform from room A to room B is:

```text
T(x) = t + s * R * x
inverse(T)(y) = transpose(R) * (y - t) / s
T2(T1(x)) = t2 + s2 * R2 * t1 + (s2*s1) * (R2*R1) * x
```

The ratio product is exact. Translation and rotation remain floating point.
Provide separate operations for points, displacements, unit directions, and
orientations. A displacement uses `s*R`; a unit direction uses `R`.
For a plane `dot(n,x) + d = 0`, with unit `n`, use:

```text
n_B = R * n_A
d_B = s * d_A - dot(n_B, t)
```

Do not hide scale in basis vectors. The current `space_inverse` uses a transpose
as the inverse; that assumption must remain valid for the rotation field.
Audit each direct `basis_vector(transform.basis, ...)` call for its units.

## Connection authoring

Keep the complete compatibility name as the authority for matching openings.
Do not add polygon matching. Extend each port with a positive rational
`profile_scale`, relative to its named profile's base opening. Identity keeps
the current dimensions. Generate the aperture and surrounding shell from that
same scaled recipe.

For matching endpoint profiles, A to B has scale `profile_scale_B /
profile_scale_A`. Compute the inverse link from the same ratio. Keep the current
shared rotation choices. Compute translation so the two port origins coincide
under the map and their outward normals oppose each other.

The link cannot specify a conflicting second scale. Different profile names
still cannot connect. Naming a profile with a dimension specifies its base
recipe; `profile_scale` states the deliberate size change. Check profile scale,
rotation choice, IDs, and finite transforms at the content boundary. Internal
consumers use the validated link.

## Object state and movement

Keep base mesh dimensions and base collision radius immutable. The player and
the flying hook each have their own primary room, exact scale, and orientation.
The hook starts with the player's scale at launch. It can then cross independently.
An attached hook retains the scale at attachment and its collider-local contact.
Current moving colliders have prescribed room-local motion. They do not cross
portals. If a collider becomes a portal-traversing object, its attached hook must
follow the same room and scale change through the host attachment transform.

Store linear velocity in base-object length units per second, oriented along
the primary room's axes. If `q` is the object's scale, room velocity is `q*u`.
On crossing, set `q'=s*q` and `u'=R*u`. Thus room velocity becomes `s*R*v`
without multiplying stored velocity by successive floating-point scale factors.
Rotation still introduces roundoff. Angular velocity uses rotation without scale.

Thrust, launch impulse, burst, brake, and reel rates use base-object units.
Durations and cooldowns use seconds. This preserves speed and control response
in ship lengths. Drag rates use inverse seconds. Convert room contact velocities
back to base units after collision response. Store work-per-mass diagnostics in
the declared base units and label their units consistently.

Room gravity and rotating-frame fields remain properties of their room. Evaluate
them at the object's room position and room velocity, then divide the resulting
linear acceleration by `q` before integration. A smaller ship can therefore
experience stronger environmental acceleration in ship lengths. A portal does
not promise energy conservation across differently scaled or oriented fields.

Speed limits and gameplay speed thresholds use base units. HUD speed and cable
length use base metres and base metres per second, with the current size ratio
shown separately. Numerical margins use the collision query's room units.
Screen-space HUD dimensions remain independent of object scale.

Keep the current kinematic-body and prescribed-surface model. Do not infer a
new mass or density law from geometric scale. Dynamic two-body momentum exchange
would require an explicit mass and impulse contract before it is introduced.

At a crossing, transform the remaining displacement, preserve remaining time,
and continue the same interval solve. Update scale, position, velocity basis,
body orientation, and the accumulated step transform together. Prediction uses
this exact simulation path.

## Supported size and portal admission

Finite-precision collision cannot support every positive rational size at every
room coordinate. The supported physical sphere radius is from 2^-12 through 2^12 room metres.
The scale interval for each body class is this radius interval divided by its
base radius. Plane-sweep tests cover each power of two in the interval. Content validation
also checks that these dimensions are resolvable in each room's coordinate range.
The numerical checks remain required even when scale is inside the interval.
The coordinate bound times 5e-7 must be at most 1/256 of the sphere radius.
Destination bounds include the aperture map and the room collision bounds.
The cable map uses its translation and mapped maximum reach. Squared scales,
inverse squared scales, and squared reach must remain finite. These are
admission checks; the contact solver keeps its coordinate error contract.

Test destination admission before the sphere first overlaps the opening, rather
than waiting for its centre to cross. An inadmissible destination supplies a
collision cap across that aperture for this actor. Use the same sweep and contact
solver as a solid face. Do not first create an invalid destination anchor.
Admission uses the exact candidate scale, body class, and destination validity
contract. The predicate must give the same result before and after an accepted
centre crossing. Fixed link data and reciprocal ratios preserve that condition;
it needs no time-dependent gate state.

Show an inadmissible aperture with a distinct border in the player's view. Hook
prediction must show when the hook is blocked even if the player can pass.
The rooms remain visually connected. A blocked crossing is an explicit movement
result, not a changed ratio, silent teleport, or simulation failure. Do not close
the portal globally: admission belongs to each actor and placement.

Apply admission to every physical overlap placement. A tether constraint must
also have a representable endpoint map and room-segment placements. Validate
these before either endpoint crosses; cap that crossing when the live cable
would leave its supported numerical range. Releasing the hook removes that
constraint. Do not add a new automatic snap or extend the cable to hide failure.

Supported scale intervals protect spatial resolution. They do not bound integer
bit length: non-cancelling factors can keep physical size near one while the
exact integers grow. Retain arbitrary-precision storage and explicit resource
failure. Do not restrict authored primes or require all graph cycles to be powers
of one ratio. Measure arithmetic time and storage on such loops in the fixture.

Room-force effects can still make a route difficult inside the numerical range.
Before generating scaled expeditions, test that the required outward and return
routes remain controllable with their permitted ship sizes and shared burst/brake
cooldown. A numerically valid graph alone is insufficient for a completable level.

## Collision across an opening

A sphere can overlap both rooms before its centre crosses. In anchor A to B,
transform centre and travel by `T`. Derive radius from `base_radius` and the exact
product of object and anchor ratios. Do not multiply a previously rounded query
radius by each portal scale. The overlap query and post-crossing body must obtain
the same radius bits for the same placement. Keep the time fraction unchanged.
Query the existing room-local static and moving geometry.

Bring contacts back into the caller's room before the common solve. A unit
normal transforms by `transpose(R)`. A separation length transforms by `1/s`.
A surface linear velocity transforms by `transpose(R)/s`. Angular velocity
transforms by `transpose(R)`. Transform contact points as points. All response
planes in one solve must use the same units.

Compute numerical margins in the query room from its coordinates and scaled
radius. Convert returned margins with the contact distances. Keep each contact's
converted error bound through the common solve. A single global maximum would
relax precise contacts; a global minimum could demand impossible accuracy from
another room. Check each plane with its own bound and report unresolved contact
sets. Do not reduce a room's required error bound merely because another room
has finer resolution. Preserve solid
volume tests, rim contact, swept separation, and contact-before-crossing order.
Do not accept a centre crossing when the body's scaled overlap hits a rim or a
destination obstacle first. Centre ownership changes once; overlap anchors
continue to represent both sides without creating independent physics bodies.

## Cable length and reeling

The cable remains a direct constraint through obstacles. It does not acquire
corner wrapping. Retain the actual portal path relating the endpoints; do not
choose another path because it is shorter. Distinct paths can have distinct
scale and placement even when they end in the same room.

Store the path as a sequence of directed link IDs. Remove adjacent inverse pairs.
Retain other loops, including loops with identity scale. Rebuild the floating-point
map from this reduced path in a fixed order when the path changes. Cache the map
until the next change. Returning to the same path restores the same map bits.
Portal links remain fixed for the lifetime of an expedition. Keep the cached
rotation orthonormal after composition; apply the same operation order on rebuild.
Storage exhaustion fails explicitly; it does not introduce a new cable snap rule.

Use the player's base-length metric for cable extent, reach, minimum extent,
reel speed, and the distance test. Let `q_p` be player scale and `H` map the hook's
primary room into the player's room. Then:

```text
cable_distance = length(H(hook_position) - player_position) / q_p
```

When the player crosses with map `T`, the path represents `T composed H`.
When the hook crosses with map `U`, it represents `H composed inverse(U)`.
These are equations for the updated path; do not repeatedly multiply the cached
floating-point map. Reduce the path, then rebuild it.
Retain exact ratio composition and reciprocal cancellation in these maps.
Player-only crossing scales both the mapped offset and `q_p` by the same factor,
so it cannot create a cable-length jump by itself. Base cable extent stays fixed
unless launch, reeling, or release changes it under the existing game rules.

Convert a correction in base cable units to player-room displacement before the
collision solver. Convert hook/contact velocity through the same map before a
relative-speed calculation. Never subtract velocities from different rooms or
units. Crossing the hook must not rescale the player's whole cable state.

Flying range exhaustion keeps the existing snap rule. Attached reeling remains
one-way and fast, with solid contact taking priority. Cable rendering uses the
retained portal path and per-room placements. The optical segment and the
constraint endpoint must refer to the same path. Cable width uses player base
units, converted from the base width with the exact placement ratio for each
room segment. Keep the current aperture clipping rules for the visible cable.

## Rendering, lighting, and anchors

The renderer maps each destination room into the current view with the full
similarity transform. GPU view recursion uses floating-point transforms derived
from exact per-link ratios. It already composes rotation and translation on the
GPU. This visual state is not an authoritative object scale. Do not add a GPU
readback or CPU view-construction pass to recover exact visible-path ratios.
Bound accumulated visual error with recursive image fixtures. Project
geometry in one consistent view metric so parent and child depths can be compared.
Transform portal clip planes with the plane rule above. Preserve inverse-depth
interpolation and world UV coordinates. Keep camera FOV unchanged.

Express near-plane distance relative to camera-object scale. Convert it to the
same view units as geometry. Body meshes, hook meshes, and cable width use their
placement scale. First-person suppression and clipping must still permit the
player's body to appear through another anchor.

Normals remain unit vectors. Transform normals with rotation or normalize them
after a uniform scale. Derive shadow biases and clipping distances in the same
units as the surface they apply to. Audit face culling, shadow projection, reconstruction
of world positions, and light distance evaluation. The renderer and its CPU
reference must consume the same scale contract. Shader input may use cached
floating-point transforms; exact ratios remain host state.

Player and hook light radii use their object's scale. Room lamps use room units.
For a propagated light anchor, transform position by its map. Derive reach and
attenuation radius from base values and the exact total placement ratio. Use
attenuation as a function of distance divided by radius, preserving intensity
at corresponding points. Audit absolute-distance terms and shadow biases. This
is the game's lighting rule; it does not model optical energy conservation.
Keep current shadow policies. Use one placement per portal
path; repeated appearances in the same room can have different scales.

Anchor identity uses object ID and directed portal path. Keep its exact composed
ratio as placement data. Neither room ID nor floating-point transform equality
can identify a placement. Keep existing object identity and ownership;
an anchor never duplicates health, cable state, or simulation integration.

## Loops, budgets, and failures

A graph cycle can multiply scale by a ratio other than one. This is valid content.
The reverse path restores scale; a different return path need not do so. Never
force an object back to its initial scale merely because it enters the start room.

Recursive visibility and light propagation can encounter infinitely many distinct
placements. Use explicit work budgets and clipping. The renderer keeps completed
solid pixels and uses the background colour for unfinished views. Repeated room
IDs and distinct scales remain separate views. Test branching and shrinking
cycles against the [traversal contract](../render/rendering.md#dynamic-traversal-and-termination).

Exact integer storage does not solve binary32 spatial resolution. Host anchor
construction can fail allocation. At content load, reject per-link ratios that
cannot be represented in shader inputs. Before dispatch, validate source geometry,
retained instance bounds, lights, camera data, and individual portal transforms.
Cache the static connection bounds. This check takes O(links) time when portal
data changes. Before it admits a child view, the GPU checks the composed scale,
inverse scale, and translation against the finite arithmetic envelope. Unsafe
compositions end child expansion. This requires no CPU readback between rounds.
Debug shader checks can verify the bound. A floating-point logarithm of scale
does not make an overflowing translation or projected coordinate representable.
Exact physical scales must never be reconstructed from GPU view matrices.

## Components and data ownership

| Component | Change |
| --- | --- |
| Shared spatial code | Exact ratios, similarity maps, typed transform operations, anchor scale |
| Asset and graph assembly | Scaled profile recipes, reciprocal links, authoring validation |
| Collision | Scaled sphere queries, contact conversion, overlap and interval traversal |
| Game flight | Object scales, base-unit velocity and forces, cable metric and path, admission |
| Game view | Scaled body, hook, cable, prediction, and propagated light placements |
| Renderer | Similarity view maps, clipping, depth, shadows, shared native/web ABI |
| Recording | Include reduced ratios and path state in serialization and state hashes |
| Tests | Ratio arithmetic, physical traversal, tether, images, replay, and failure cases |

The main source interfaces are in `src/collision/portal-storage.crs`,
`src/collision/portals.crs`, `src/spatial/anchors.crs`,
`src/game/flight/collision.crs`, and `src/game/flight/tether.crs`.
`src/game/view/portals.crs` uploads inverse similarity transforms.
`src/game/view/light-anchors.crs` derives light reach from the exact product of
object and anchor scale. Room lamps use an identity object scale.

Declare all new state in the checked ownership interfaces. Task inputs capture
one immutable snapshot containing ratios and their derived values. Do not read
scale from live mutable state after GPU setup starts. Native and browser builds
use the same integer arithmetic and conversion rules.

## Implementation gate and checks

First establish an identity-scale baseline with the current targeted flight,
portal collision, hook-light, body-view, and image checks. Record frame time,
anchor count, and allocation count. Identity scale must preserve current output
and motion, without new per-pixel rational arithmetic or per-frame allocation.

Implement one vertical slice before changing generated levels: two rooms with
matching named openings at scales `1/1` and `2/1`, one rotated link, a rim obstacle,
a moving contact surface, and an attached hook across the opening. Show the
player body and light through both sides. Keep this as a targeted fixture.

Required checks:

- Reduce ratios, cross-cancel before products, reject zero, and exercise
  inline-to-limb promotion. Restore identical radius bits after repeated
  reciprocal crossings. Include large integers with a quotient near one.
- Compare scale-one output and simulation with the baseline.
- Cross both ways at speed and while touching a rim. Test a large body whose
  centre fits but whose sphere cannot pass. Test overlap before centre crossing.
- Verify transformed contact time, normal, separation, and moving-surface speed.
- Cross the player and hook separately, then both in one tick. Check cable length,
  range, reel response, and collision. No artificial winch impulse at crossing.
- Render near-plane intersections, parent/child depth overlap, body anchors,
  shadow casters, fixed lamps, and propagated player/hook lamps. Verify that
  host bounds reject unrepresentable recursive transforms before dispatch.
- Traverse a scale-changing cycle and its inverse. Exercise allocation failure and
  loss of spatial resolution. Resource failure must not leave partially changed
  state. Unsupported destination sizes must stop at a marked aperture cap before
  overlap. Test different player and hook admission results, and cable admission.
- Replay the same inputs on native and web. Check exact rational state and use
  the existing numerical contract for floating-point motion and images.
- Measure identity and scaled fixtures against the baseline. Attribute additional
  cost to anchor count, queries, or shader work before expanding generation.

For control feel, compare reciprocal `2/1` and `1/2` routes with equal distances
in ship lengths. Observe whether pilots can cross, turn, attach, and reel without
an unexplained speed or cable jump. Test room-force effects separately. Use this
small playtest to assess the chosen units before tuning level difficulty.

### Validation commands and measured cost

Run `crust tests.crs ratios`, `crust tests.crs collision --sanitize`, and
`crust tests.crs scaling`. The scaling target checks image equivalence, moving
contact units, cross-room hook attachment and reeling, the outward and return
route, and rejection of unsafe renderer bounds. Run
`bun tests/web/check.mjs --scaling` against the web build for browser input,
scaled crossing, native/browser replay hashes, and capture comparison.

At 320 by 240 on the Radeon PRO W7900, the 80-frame task witness measured a
6.94 ms median frame for the identity expedition and 14.60 ms for the scaling
course. The corresponding simulation and prediction medians were 5.84 ms and
13.52 ms. The course includes a rotating contact surface. Its 95th-percentile
frame was 18.00 ms. These scenes have different collision work; the comparison
cannot isolate the cost of scale arithmetic. The course prediction can run 240
fixed simulation steps against moving geometry each frame. Random scale choices
must remain disabled until that workload meets the frame-time gate on the
required hardware. Authored links remain available.
