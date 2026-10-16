# Room format

## Scope

This format defines generated rooms and their named connections. The game
uses separate local spaces and rigid links. See the
[current graph assembly](../game/expedition.md) and [open engine work](engine-gaps.md).

A room defines a convex interior hull in its own local coordinate space.
Selected hull polygons are connections. A connection can lead to another room
instance through a rigid portal transform. The room can contain smaller props,
lights, and gameplay objects. All of these use room-local coordinates.

Crust recipes generate this data. This contract defines its meaning, not a
binary file layout or a new text language.

The radial asset implements named hexagonal ports, local frames, and closed
unused openings. The viewer draws port IDs and profile names. This asset does
not yet have room links or cross-room traversal.

## Data model

| Record | Required data |
| --- | --- |
| Connection profile | Compatibility name, shared opening recipe in metres, reference axes, supported rotation counts, passage clearance |
| Room definition | Asset ID, local hull vertices, hull polygons, connections, local prop instances |
| Hull polygon | Stable face ID, ordered vertex indices, surface/material assignment |
| Room connection | Unique local port ID, compatibility name, face ID, local frame, allowed rotation count, closure surface/material |
| Prop instance | Unique local ID, generated asset reference, rigid local pose |
| Room instance | Unique instance ID, room definition reference, room-local state |
| Room link | Two room-instance/port-ID endpoints and one allowed rotation choice |

A connection name selects a shared profile. It is a compatibility key, not a
unique endpoint ID. For example, a corridor can have ports `entry` and `exit`
which both use the name `service_square_4m`. Matching uses the complete name;
there are no wildcard names or automatic size conversions.

The name is the authority for compatibility. Assembly does not compare polygon
vertices, edges, dimensions, or shapes. Recipes that use the same name must
produce compatible openings. Use a different name for an incompatible profile.

A room instance has a separate space identity even when it shares its asset
with another instance. A local prop reference consists of the room-instance ID
and the prop ID. It cannot refer to a prop in another copy of the room.

## Hull and shell

Use metres and a right-handed room coordinate system. The origin and axes
belong to the asset. They need not coincide with the hull centre or a port.
Instance links do not rewrite the asset's coordinates.

Hull polygons are planar, convex, and nondegenerate. List their vertices
counterclockwise when viewed from outside. Their normals point out of the room.
For an outward unit normal `n` and a point `a` on the polygon, the interior obeys:

```
dot(n, p - a) <= 0
```

The hull is closed, has positive volume, and has no gaps or overlapping face
interiors. Each edge has two incident polygons with opposite edge directions.
Coplanar face subdivisions are permitted. Each subdivision is a hull polygon
with its own face ID. Shared boundaries use the same vertex indices.

A connection occupies one complete hull polygon. To make a small door in a
large wall, the recipe partitions that wall into a portal polygon and solid
surround polygons. It does not remove the entire large wall. A face can own at
most one connection. Solid shell faces render toward the room interior and
supply collision surfaces.

An unused connection is closed by its closure polygon. A linked connection has
no blocking polygon across its opening. The hull still includes that polygon
for containment and crossing tests. Thus the mathematical hull remains closed
when the physical doorway is open. Drawing, collision, and traversal consume
the same opening boundary. Darkness does not close a hole.

A non-convex route consists of several convex rooms. An elbow can use several
connected cells. A large open area is a large convex room. Props can obstruct
views and divide flight routes without changing the convex hull definition.

## Connection frames and rotations

A port frame has an origin on its plane, a reference right axis, an up axis,
and an outward normal. It is a proper orthonormal frame. The normal agrees
with the hull face. The frame fixes zero roll; polygon enumeration order does
not select an arbitrary zero roll.

The shared profile defines the opening recipe and its zero-roll orientation.
Room recipes use this profile to construct their openings. The author must
account for the opposite-facing mating orientation and each declared rotation.
This is an authoring contract, not a polygon-matching operation.

For rotation count `n`, the allowed roll angles are:

```
angle(k) = 2*pi*k/n, for k = 0 .. n-1
```

| Profile | Permitted counts | Angles for the largest count |
| --- | --- | --- |
| Square | 1, 2, 4 | 0, 90, 180, 270 degrees |
| Regular hexagon | 1, 2, 3, 6 | 0, 60, 120, 180, 240, 300 degrees |
| Non-square rectangle | 1, 2 | 0, 180 degrees |

Every declared position must preserve the opening profile. A count of 1 permits
only zero roll. An author can restrict the count to preserve a floor direction,
a prop clearance, or a visual alignment. A square need not permit four rolls.

Both endpoints must permit the selected roll. For counts `a` and `b`, their
shared choices have count `gcd(a, b)`. Thus a square with four choices and one
with two choices can connect at 0 or 180 degrees. A hexagon with two choices
and one with three choices can connect only at zero roll.

Assembly selects a roll from the shared choices using the names and declared
counts. It does not infer symmetry from geometry. Do not scale an opening,
mirror a room, or search for an approximate rotation. For an arbitrary polygon,
the author defines the valid counts in its named profile.

## Links and space transfer

Each port is either closed or linked to exactly one port of another room
instance. Multiple ports can connect the same two room instances. Store one
bidirectional link; derive both directed traversals from it. A link cannot
have one open end and one closed end.

Let `A` and `B` map each port frame into its room coordinates. For the selected
roll angle `theta`, define the source-to-destination transform:

```
T_A_to_B = B * rotate_z(theta) * rotate_x(pi) * inverse(A)
T_B_to_A = inverse(T_A_to_B)
```

The half-turn opposes the outward normals. It is a proper rotation, not a
reflection. Store the selected discrete rotation. No vertex correspondence is
required. The reverse traversal uses the exact inverse transform.

Positions use the full rigid transform. Directions use its rotational part.
Body velocity transfer must also account for the selected drum frames. Renderer,
player, hook, tether, prediction, and saved references must use the same link.
The [gameplay portal task](engine-gaps.md#w2-gameplay-portals--world-feature)
defines the remaining runtime work.

A global embedding is optional. An ordinary assembly can place both openings
at the same world plane, with opposite normals and non-overlapping interiors.
A transformed portal needs no such placement. A cycle can return with a net
transform; this does not invalidate a portal graph. Do not reject a valid
portal graph because its rooms cannot fit in one global coordinate system.

## Props and clearances

Props reference generated meshes and collision assets. Their rigid poses are
relative to the room. Moving props evaluate their poses in that same space.
Hook attachments retain the owning room, prop identity, and local surface point.
Recipe parameters define size changes before asset validation; runtime poses
do not apply non-uniform scale.

Props and their collision volumes must remain inside the room hull. A prop
that must occupy two rooms is split into local parts with an explicit shared
identity at the assembly layer. Decorative shells cannot extend the room's
playable bounds or create an exit into the void.

Each connection profile defines its passage clearance. Props and socket trim
must preserve that clearance on both sides for every permitted mating position.
Moving props must preserve it over their declared motion. A traversable opening
must provide clearance for the player sphere and hook sphere. The opening
polygon alone does not prove that the route beyond it is clear.

## Validation and first implementation

Validate generated assets and graph edits at the build or load boundary. Report
the room, face, or port that violates a contract. Runtime queries consume the
validated topology and transforms.

Reject invalid hulls, duplicate IDs, unknown profile names, rotation counts not
declared by the profile, occupied endpoints, incompatible names, invalid port
frames, and props that violate hull bounds or required clearance. Hull checks
do not compare one port polygon with another. Runtime seam coordinates come
from the shared opening recipe; do not round the two sides independently.

The first implementation must prove a small complete assembly before more room
content is added:

- Two convex rooms with a matched square opening and a closed unused port.
- A rectangular opening cut into a larger coplanar wall subdivision.
- Square and hexagonal rotation choices, including restricted endpoint counts.
- A non-axis-aligned hull, a rotated room connection, and local solid props.
- A translated portal and a cycle that needs separate room spaces.
- Exact inverse traversal, visible seams, player/hook passage, and local anchors.
- Rejection of wrong names, invalid hulls, occupied ports, and blocked clearance.
- Same-name link selection independent of polygon vertex order or subdivision.

Use small component fixtures and a viewer scene. Do not use the complete
expedition as the format's correctness test.
