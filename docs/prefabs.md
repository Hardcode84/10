# Connected room prefabs

The expedition is a closed assembly of rooms. A large chamber supplies open
flight space. There is no playable space outside the assembly. Walls stop the
drone and hook and cover the background. Darkness does not replace geometry.

## Room and connection contract

A `RoomPrefab` defines local dimensions, a wall material, and up to three
rectangular ports. Face numbers use X, Y, and Z in that order. Each axis has
its negative face first and its positive face second. A port lies on that
face and has positive area within the face bounds.

`RoomInstance` supplies a world origin. `attach_prefab` places a child port
at the parent port. Both ports must have equal extents and opposite normals.
The current modules use axis-aligned walls and ports, including floor and
ceiling hatches. Position comes from the selected ports, not a separate gap
between room origins. A `RoomLink` names each pair. The last link in a loop
must match the position established by the earlier links.

A port is cut only when it has a connection. An unused port remains a solid
wall. Matching openings have the same plane and bounds on both sides. Room
interiors do not overlap. Adjacent wall panels share exact edges.

Each face starts as a closed rectangle. Connected openings remove portions
of that rectangle. The resulting panels are the source for both drawing and
swept-sphere collision. The drone and hook use the same panels. Port edges
use the existing sphere and edge contact rules. There is no position clamp
that conceals a missing wall.

Wall UV coordinates use world position, so adjacent strips do not restart the
texture. Rendering selects the inward side of each room face. Attachment
faces of columns and beams are not drawn over the room shell. Collision keeps
the complete solid. Props remain connected to a floor, wall, or ceiling.

## Silent Foundry assembly

| Prefab | Dimensions in metres | Connections |
| --- | --- | --- |
| Berth and service gallery | 24 by 24 by 72 | End door to pump hall |
| Pump hall | 140 by 72 by 120 | Gallery, shaft, upper return hatch |
| Climb shaft | 32 by 128 by 60 | Hall door, crown hatch |
| Crown chamber | 132 by 32 by 60 | Shaft hatch, return hatch |
| Upper return chamber | 140 by 56 by 120 | Crown, pump hall |

The pump hall contains a floor-to-ceiling column. The upper return chamber
has a gantry connected to its wall and ceiling. A full-bright pipe runs up the
shaft. These structures give the player anchors and orientation references.
The crown has a floor-mounted station base.

The gallery door is 16 by 16 metres. The shaft door and hatch are 24 by 36
metres. Return hatches are 40 by 36 metres. The shaft route reverses through
its original entrance. The shorter return drops through the upper chamber
into the hall. Both routes use the gallery door to reach the berth.

## Bounds and verification

The shell contains 116 triangles before inward-face selection. Eleven attached
solids include the launch cradle and riser content in the
[room catalogue](room-catalogue.md). The complete submission bound is 252
triangles, including the pipe, station marks, parked drone, cockpit, cable,
and both prediction sets. Tests sum the maximum face counts for each axis
over every interval between shell and prop planes. Faces on the eye plane
have zero projected area and are omitted. The renderer grows geometry storage to fit the submission.
The eight-light limit is unchanged.

Panel construction uses fixed stack storage and no heap allocation. Each
face has capacity for 64 panels: each of at most three port cuts can replace
one panel with at most four panels. Collision queries and rendering consume
the same room definitions. Save IO and connection checks do not run in the
collision loop.

`crust main.crs --test` checks port bounds, matching world positions, opposite
normals, closed unused ports, non-overlapping interiors, and passage in both
directions. It casts 750 rays through room faces, edges, and corners. It also
checks 130 high-speed impacts and five stationary cases. Both complete expedition tours check
room containment after every simulation tick.

`crust main.crs --review` checks every output pixel in 30 room views and 30
views before, on, and after connection planes. No view may retain an uncovered
background pixel. It also writes dark, lit, recovery, empty-charge, hall,
shaft, crown, and doorway captures, plus six authored-room views. These checks run through the production
Vulkan renderer on AMD and Intel GPUs.

Run a new expedition with `crust main.crs --fresh`. Save version 3 belongs to
this assembly. A save from the previous layout reports an error. Recordings
use version 10; they must be made and replayed with the same build.
