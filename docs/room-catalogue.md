# Biomes and authored rooms

Use the [parametric asset design](parametric-assets.md) to build this content.
It defines the shared modeling, texture, collision, and viewer workflow. The
[engine gap register](engine-gaps.md) lists the required engine changes.

## Content hierarchy

Use this order to define content:

1. **Biome:** the work that this part of the structure performs. It defines
   machine families, support structures, materials, and movement opportunities.
2. **Subbiome:** a distinct part of that work. Add one only when both its main
   silhouette and its flight problem differ from the rest of the biome.
3. **Geometry:** the shape of the connected flight space. It defines the main
   turns, changes in section, branches, and sightlines.
4. **Room variant:** a named place with specific structures, clearances, anchor
   points, landmarks, and a purpose in an expedition.
5. **Instance:** a variant placed through its connection ports, with its local
   objective and light state.

A colour change is not a biome. Moving two doors is not an elbow. A room name
is not a content definition. The structures inside a room must explain its
purpose and change what the player can see or how the player can fly.

Spin state and radial position are separate from this hierarchy. They select
physical forces; they do not select a decorative theme. The current expedition
uses a stopped drum. A shaft still has a structural axis and a distinctive
section in that state, but it does not teach a gravity climb.

## Biomes

| Biome | Subbiomes | Common visual features | Common flight features |
| --- | --- | --- | --- |
| Spine services | Drone maintenance; transit distribution | Small repeated bays, clamp arms, framed doors, wall cabinets, paired cable runs, warm lamp sockets | Short controlled approaches; central lanes with side stops; nearby anchors; clear return landmarks |
| Power distribution | Switching galleries; induction chambers | Insulator stacks, bus bars, coil housings, heavy cable trays, isolated indicator strips | Fly around a central machine; cross between anchor rows; choose a short central gap or a wider side route |
| Fluid and thermal plant | Pump works; heat exchange | Parallel pipes, valve bodies, manifold blocks, radiator banks, service bridges | Follow a pipe run; transfer between runs; use machinery to turn; brake before a manifold junction |
| Fabrication and handling | Assembly cells; material transfer | Press frames, fixture beds, conveyor supports, crane beams, load racks | Pass through a machine frame; swing around a support; choose above or below a suspended structure |
| Load-bearing structure | Spoke galleries; bearing chambers | Long ribs, diagonal stays, ring segments, counterweight guides, deep inspection bays | Long coasts with sparse anchors; changes in flight axis; routes around large supports |

The listed subbiomes are authoring categories, not separate implementations of
physics. A stopped bearing does not rotate merely because it belongs to the
bearing subbiome. Moving structure requires its own implemented motion and
collision contract before a room can use it.

Use biome boundaries to show functional connections: service access into a
pump room, a power feed into a machine bay, or a support shaft beneath a
bearing. Join them with a visible bulkhead or transfer chamber. Do not change
materials halfway along an otherwise continuous surface without a reason.

## Shared visual grammar

| Layer | Required content | Purpose |
| --- | --- | --- |
| Main structure | One dominant machine, frame, shaft, or support system | Recognize the room from its entrance and on the return trip |
| Flight space | A clear route around or through that structure | Make the shape playable; show the next decision before contact |
| Support systems | Ribs, mounts, rails, conduits, cabinets, or access decks | Show how the main structure is held and serviced; supply useful anchors |
| Surface detail | Panel joints, fasteners, vents, wear bands, and labels | Give scale without adding small collision obstacles |
| Lighting | Local lamps and sparse full-bright indicators | Show interfaces in darkness and reveal the larger structure after restoration |

Put large forms in geometry. Put details below useful flight scale in textures.
Do not cover every surface with glowing dots. Full-bright texels identify a
socket, a control face, or a route edge; they do not light the room themselves.
Attach machines to their supports. Do not scatter isolated boxes to fill space.

Use repeated structural intervals to show speed. Break that rhythm at a
junction, service bay, or damaged section. Each room must also have one
asymmetric feature that identifies the direction of travel. Avoid identical
entrance and exit views.

## Geometry vocabulary

A geometry describes the navigable volume, not only the number of ports.
It may use several joined shell cells and attached structures. All cells obey
[the sealed prefab contract](prefabs.md).

| Geometry | Required spatial feature | Connection rule |
| --- | --- | --- |
| Dead-end bay | A terminal work area and room to turn back | One route port; the terminal must have a visible purpose |
| Straight | A continuous lane with a legible longitudinal rhythm | Opposed route ports; side recesses do not become hidden exits |
| Elbow | A real corner that hides the far exit on entry | Two perpendicular route ports; the inner corner supplies an anchor |
| Offset passage | Two bends or a machine that blocks the direct centreline | Two route ports with an offset clear path; show the first turn before entry |
| T junction | Three distinct branches separated by structure | Three route ports; each branch has a visible function or landmark |
| Cross junction | Two crossing lanes with a central orientation reference | Four route ports; distinct branch identities are mandatory |
| Shaft transfer | A long section with an entry or exit on a different structural axis | Include a visible transfer point and anchors along the long section |
| Split-level chamber | Decks divide the volume and connect through defined openings | Upper and lower routes must be visible before the player commits |
| Loop gallery | A central structure with two paths that join again | Paths differ in clearance, anchor position, or length |
| Large chamber | A large enclosed volume organized by a dominant structure | Provide landmarks and intermediate anchors, not an empty crossing |

The current shell type permits three ports per cell. A cross junction therefore
uses more than one cell; it must not silently discard a fourth connection.
The first content batch does not add a cross-junction implementation.

## Room catalogue

These are authored room specifications. Only variants marked **built** in the
implementation section are playable content. The list is not a claim that
all combinations of biome and geometry exist.

| Geometry | Variant and biome | Defined structures and flight choice | What restoration reveals |
| --- | --- | --- | --- |
| Dead-end | **Launch cradle** — drone maintenance | Paired low clamp beds, two overhead service bridges, paired wall cabinets; a clear central departure lane and lateral parking pockets | The repeated service bays and the single departure door |
| Dead-end | **Valve inspection pocket** — pump works | A wall-mounted valve drum, feed pipes, and a recessed service platform; brake before the valve and turn back under its feed line | The pipe that returns to the main manifold |
| Straight | **Cable service gallery** — transit distribution | Repeated portal ribs, two wall cable trays, one recessed maintenance bay; coast centrally or use the tray for a controlled approach | The bay and the next bulkhead, not a second hidden exit |
| Straight | **Radiator aisle** — heat exchange | Parallel radiator banks with a high service rail; a broad central lane and a narrower rail-side line | The end collector and its connection to the return pipe |
| Elbow | **Manifold bend** — pump works | A large inner-corner manifold with three visible feed pipes; slow around the outer lane or hook the inner support | The exit pipe and the service clearance behind the manifold |
| Elbow | **Bus-bar turn** — switching galleries | A stacked inner-corner insulator bank and an overhead cable bridge; pass below the bridge or turn around its end | The destination switch cabinet and its indicator row |
| Offset | **Stopped lift passage** — material transfer | A parked lift car blocks the direct lane; guide rails and a side service opening define the dogleg | The far opening behind the car and its return-side anchor |
| Offset | **Filter bypass** — pump works | Two staggered filter housings and a continuous wall conduit; use a slow wide S turn or two short hook transfers | The spacing between housings and a direct view back to the entrance |
| T | **Distribution switch** — switching galleries | A central switch body separates the stem from two bus runs; branches have different cable counts and endpoint structures | Which branch reaches the beacon and which returns to service access |
| T | **Service exchange** — transit distribution | A crane support at the branch point, a maintenance bay on one arm, and a transit rail on the other | The rail continuation and the terminal maintenance equipment |
| Cross | **Pipe interchange** — pump works | Two pipe runs at different heights and a central support pier; select a branch before entering the pier's clearance zone | The vertical separation of the two crossing services |
| Cross | **Transfer crane crossing** — material transfer | Orthogonal crane rails above a loading fixture; a central marker and distinct racks at each branch | The rail destinations and a clear path through the fixture |
| Shaft | **Counterweight riser** — load-bearing structure | A continuous marked guide pipe and two staggered wall-mounted anchor ledges; a clear central coast line and optional ledge-to-ledge hooks | The next ledge, the upper hatch, and the structural climb axis |
| Shaft | **Pump intake well** — pump works | A central intake trunk, annular service decks, and side access ports; spiral around the trunk or use the outer inspection lane | The trunk's end and the deck openings above it |
| Split-level | **Switch deck** — switching galleries | A partial control deck above a cable floor; broad edge access and one framed central opening | The short drop and the longer path around the deck |
| Split-level | **Assembly balcony** — assembly cells | A press frame passes through the deck; a service balcony follows one wall | The balcony route and the space beneath the press crosshead |
| Loop | **Twin pump gallery** — pump works | Two pump bodies share a central bridge; one branch is broad and the other follows a close pipe run | Both branches joining at the outlet manifold |
| Loop | **Coil service ring** — induction chambers | A central coil housing with separate inner and outer anchor rows | The short inner route and its smaller release window |
| Large chamber | **Spoke transfer hall** — load-bearing structure | Two full-height supports, an overhead stay, and a side service ledge; several long but bounded hook transfers | The load path and the upper return opening |
| Large chamber | **Foundry press hall** — assembly cells | A dominant press frame, a fixture bed, overhead handling rails, and side access lanes | The passage through the press and the safer side route |

## Room authoring card

Each implemented variant must record:

- Its biome, subbiome, geometry, name, dimensions, and port roles.
- The main structure and its attachment to the shell.
- The normal route, minimum clearance, and useful hook surfaces.
- The support details and the surface-detail pattern.
- The dark view, the restored view, and the landmark seen on return.
- The objective or reason to enter a terminal branch.
- Its geometry cost and the test or capture that proves the room works.

A room is ready when it can be recognized without its HUD name, the route is
readable, and its structures affect flight or explain its function. A sealed
box with a texture and an objective marker is only a shell.

## First content batch

Keep the current connected expedition and its stopped-drum physics. Author
two of its rooms first. The pump hall, crown chamber, and upper return chamber
remain shell-level content until their own room cards are implemented. Do
not describe those three as finished biome rooms.

### Launch cradle

- Biome: spine services / drone maintenance. Geometry: dead-end bay.
- Shell: 24 by 24 by 72 m. One 16 by 16 m door.
- Main structure: two low clamp beds at the launch end, attached to floor and
  side walls. They leave a 12 m central lane.
- Supports: two full-width overhead service bridges at distinct distances;
  two tall service cabinets at the side walls between them.
- Flight: depart through the centre; hook an overhead bridge to leave at an
  angle; brake into either side pocket on return. The central flight line at
  4 m height remains clear. No objective moves behind a new obstacle.
- Detail: cabinet vents, clamp edges, access-panel joints, and sparse service
  indicators. Amber identifies the berth; it is not applied to every texel.
- Dark/restored view: nearby fixtures remain legible under the berth lamp;
  restored gallery lighting shows the bridge rhythm and door surround.
- Purpose: launch, recharge, and return delivery.

### Counterweight riser

- Biome: load-bearing structure / spoke galleries. Geometry: shaft transfer.
- Shell: 32 by 128 by 60 m. A side door connects to a top hatch.
- Main structure: the existing continuous guide pipe and two staggered anchor
  ledges, one on each side wall. The ledges must visibly meet their supports.
- Flight: retain a 12 m central clear band between the ledge extents. Use a
  direct coast through that band or hook the staggered ledges. The automatic
  hook climb must still cross the upper hatch using actual collision rules.
- Detail: guide markings, rib edges, and a different panel rhythm from the
  maintenance bay. The full-bright pipe identifies the long axis in darkness.
- Dark/restored view: the pipe gives a nearby guide; light exposes the ledges
  and top hatch as a connected structural system.
- Purpose: transfer from the relay hall to the crown.

## Implementation and acceptance

The launch cradle and counterweight riser are built. Their source files are
in `src/game/rooms/`. `room-content.crs` places each local solid through its
room instance. `biome-appearance.crs` defines their texture and light rules.
The other eighteen catalogue entries are room specifications. The hall,
crown, and upper return in the expedition still use their shell-level content.

The cradle has six attached structures. The riser has two staggered ledges
and a guide pipe. Both use the same solids for collision and drawing. Cabinet
indicators and ledge marks stay visible in darkness but do not emit light.
The riser uses low-contrast wall panels to keep the ledges distinct.

The complete scene has a conservative bound of 252 submitted triangles.
Tests check each interval between shell and prop planes on each axis. The
sum of the three maxima bounds all camera positions. Faces on the eye plane
have no projected area and are not submitted.

The simulation checks pass both complete routes, three new hook contacts,
and the clear central lanes. AMD and Intel pass all 60 enclosure views and
the last-material upload check. The review also writes six entry, return,
and dark views for these two rooms. AMD record and replay images match for
both routes. Intel replay matches the hook-route state hashes.

Keep room content local to the prefab. Place it through the room instance,
not through a second list of world coordinates. Keep the biome appearance,
authored geometry, connection layout, mission state, and rendering core in
separate files. Use the same solid for visible structure and collision.

Before adding content beyond the renderer's current triangle capacity, prove
its actual submission bound. Do not hide an over-budget case or remove nearby
structure based on an arbitrary distance. Preserve the closed shell and both
prediction paths. The first batch must fit the current renderer or stop at a
concrete capacity failure before more content is added.

Check both complete expedition routes, all connection views, room containment,
new hook contacts, and clean central lanes. Capture the rooms from entry,
working area, and return directions. Check both dark and restored states.
Compare the captures with the room cards. A human recognition and flight test
is still required; an automatic tour does not establish that a room is fun.

## Design review

Claude Opus identified the distinction between connection topology and room
interior design. This catalogue keeps both. Its proposal for repeated ribs,
conduits, service decks, a main machine, and sparse indicators informs the
content rules. Its recommendation to omit the broader catalogue was not used:
the requested hierarchy is useful, provided implementation status is explicit.
Shafts remain a geometry category in stopped drums; no gravity lesson is
claimed for them in that state.

The capture review also identified excessive wall contrast in the riser and
weak ledge visibility in darkness. The built version uses quieter wall panels
and small full-bright ledge marks. Cradle beds use mechanical rail textures.
