# Engine gap register for generated content

## Scope and evidence

This register supports the [parametric asset design](parametric-assets.md).
It records source inspection at game revision `8c14f15`. It does not claim
that each capacity risk has been reproduced as a runtime defect. Existing
checks cover the current scenes, not arbitrary generated assets.

Each entry names the present contract, its effect, the required change, and
an acceptance check. These are implementation tasks. This document does not
change engine code.

Use three delivery gates:

- **Asset proof:** required for the first generated assembly and viewer.
- **Room scale:** required before many detailed instances or room variants.
- **World feature:** required before a level uses moving structures, transformed
  gameplay portals, or multiple drum frames.

A gate states when a feature is needed. It is not permission to hide an error
or silently discard content until that gate.

## Rendering

### R1. Geometry and tile capacity — implemented

The renderer has no fixed source-triangle or tile-candidate count. The host
computes storage sizes from the submitted geometry and configured view budget.
It grows storage before writing new triangles. Each storage range must fit the
device's `maxStorageBufferRange`; allocation failures report an error.

The raster pass reads all compacted candidates. It keeps depth and triangle
identity per pixel. It does not discard faces when many triangles cover a tile.
The eight fan slots per source triangle follow the clipping-plane bound; they
are not a scene capacity.

`crust tests.crs render 5` checks 0, 1, 255, 256, 257, 1,025, 4,097, and
17 source triangles in sequence. The dense cases include clipping, cutouts,
and equal-depth ties. The test compares output with the CPU reference and
checks that a rejected allocation leaves the active storage unchanged.

The scan cost still grows with the number of visible candidates per view.
Before adding spatial indexing, measure a detailed room assembly against this
complete scan and require equal coverage, depth, and cutout results.

### R2. Texture and material storage — implemented

Materials select a texture region, a shared 256-entry palette, and independent
address modes for U and V. Each region has a word offset, width, height, and row
stride. Width and height can differ and need not be powers of two. Asset storage
grows with the submitted data and is bounded by device storage range and memory.
There is no fixed material count or texture dimension limit.

Each triangle vertex has independent finite UV coordinates. Repeat uses the
fractional part of each coordinate, including negative coordinates. Clamp selects
the nearest region edge. The same sample rule applies to colour and cutout tests.
The asset generator controls texel density and border UVs when geometry changes.

Each palette has 256 colours and 512 light states. Textures can share the same
table. A full-bright entry has one colour in every state; it emits no light.
See the [texture interface](../render/textures.md) for layout and submission rules.

**Check:** `crust tests.crs render 6` compares NPOT textures, atlas regions,
repeat and clamp modes, independent vertex UVs, shared palettes, index 255,
cutouts, full-bright entries, and both dither patterns with the CPU reference.
It also checks invalid descriptors and device-range rejection.

### R3. Asset submission and visibility — implemented

The game generates room shells, solids, and pipes once. The renderer retains
mesh vertices, UVs, and face data. Each frame submits instance transforms,
space IDs, material overrides, and conservative bounds. The standalone
[viewer](../render/retained-meshes.md) uses the same generated asset library as the game.

The GPU expands instances into world-space triangles. It tests each instance
bound against each active view, including transformed portal views. One-sided
faces use the camera in that view. Connected rooms share a space; a room is
not rejected because the camera is in another room. This is frustum culling,
not an occlusion query or room-graph traversal.

The room review compares enabled and disabled culling at doors and turns.
Test 7 also compares both paths and the CPU reference at 25 portal states.
The viewer checks repeated instances and measures submission and upload cost.
See [retained mesh checks](../render/retained-meshes.md#checks-and-measurements).

R7 still covers frame synchronization and fixed transfers. Instance
expansion and projected storage scale with the sum of submitted mesh triangle
counts. Culling avoids clipping rejected instances; it does not remove their
expansion or reserved projection storage.

### R4. Portal and work limits — implemented

Portal records, path views, task lists, coverage masks, lookup tables, and key
bitsets use the capacities selected in `RenderConfig`. The renderer checks
layout arithmetic and the device storage range before allocation. Traversal
records one pass per configured depth. Task dispatches use multiple batches
when needed; batch size does not limit total work.

A view represents a portal path. Distinct paths into one space remain distinct.
The crossing limit shades a terminal portal surface. Task and view exhaustion
instead reject the frame with separate errors. The next valid frame can reuse
the renderer. See the [portal capacity contract](../render/portal-capacity.md).

`crust tests.crs render 8` checks 80 portals, 81 views, an 80-crossing cycle,
65,536 masked tasks, deliberate exhaustion and recovery, invalid IDs, and
storage-range rejection. Successful images match the CPU reference on AMD
and Intel. Test 7 retains the translated and rotated portal regression.
The game still needs gameplay traversal rules before it can use transformed
connections for the player, hook, or collision queries.

### R5. Image capacity and resize — implemented

Image, output, debug, and geometry ranges use the configured dimensions. The
renderer checks arithmetic and device storage limits before allocation. There
is no 1920 by 1080 cap. Image passes use bounded dispatches and process the
remaining pixels with a stride. The invocation-status size is not an image limit.

Resize preserves camera, material, mesh, and instance data. The renderer waits
for queue completion before it replaces buffers or a swapchain. A rejected size
or buffer allocation preserves the active storage. Window resize changes output
size while internal resolution stays independent. Output scaling preserves aspect
ratio with black bars. See the [image and resize contract](../render/images.md).

**Check:** crust tests.crs render 9 compares 4K, odd dimensions, portrait,
one-pixel-wide, and very wide images with the CPU reference. It checks patterned
scaling, retained assets across resize, rejection, and recovery. Test 10 checks
window resize and swapchain replacement on a display. The ownership checks reject
resize while an input borrow is live.

### R6. Lighting and surface response — implemented

Point lights use geometry visibility within their declared space. Closed walls
block light from either side. Cutout texels pass light. Retained instances
remain shadow blockers when camera culling rejects them. The intensity bands
and screen-space dither grid remain unchanged. Full-bright texels do not emit
light. Flat triangle normals remain the selected surface style.

Light storage grows with the active count and reports device-range or allocation
failures. The raster pass skips shadow queries for contributions below the first
band. The current demo measurement supports a complete geometry scan. See the
[lighting contract](../render/lighting.md) for visibility rules, endpoint precision,
storage, measured cost, and the gate for spatial indexing.

**Check:** `crust tests.crs render 11` compares bulkhead shadows, cutouts,
space isolation, retained blockers, distant lamps, full-bright texels, and
17 lights with the CPU reference. It checks rejected growth and recovery.
Test 4 and the viewer checks retain the faceted-pipe and lighting regressions.

### R7. Memory, upload, and synchronization — implemented

Production shaders use raw execution. They do not allocate, clear, reduce,
or read invocation status. Checked shaders are an explicit debug option.
Their complete status reduction preserves the first failed invocation and
failure count. Production reads only the four-byte task/view capacity result;
captures and debug pixel checks select their additional readback.

Persistent asset, mesh, instance, and font ranges are separate from frame
inputs. Changed ranges are uploaded once. A submission fence governs staging
access, storage replacement, and destruction. The draw API remains synchronous.

The [transfer contract](../render/transfers.md) records the baseline, owned ranges,
failure rules, and measurements. Test 12 uses the retained production demo,
repeated unchanged frames, palette replacement, rejected allocation, pending
shutdown, and debug failures at the first and last invocation. The full test
suite retains image, traversal, and resize checks.

## Collision and physical state

### C1. Shape representation — implemented

The [static mesh collision core](../collision/static-meshes.md) sweeps spheres
against two-sided triangle faces, edges, and vertices. Each static instance
has a rigid pose and a space ID. The game builds collision from the same room,
solid, and pipe generators as the retained render meshes. Movement, reeling,
hook flight, and both predictions borrow the built scene.

Contacts report time, normal, instance, surface, local point, and surface
overlap depth. Coplanar shared edges have adjacency records. They do not form
collision ridges. Portal openings are holes in the wall surface. Queries select
one space and do not assume a global embedding of connected rooms. Body transfer
through transformed portals remains the separate W2 contract.

**Check:** `crust tests.crs game` checks high-speed face, edge, and vertex
contacts from both sides, tangent contact, shared seams, surface overlap,
rotated braces, concave openings, and a generated curved pipe. It checks all
expedition connections in both directions and high-speed room containment.
The movement, hook, winch, prediction, and expedition completion checks use
baked mesh collision.

### C2. Query cost and repeated construction — implemented

The game builds collision once. An immutable scene contains a space directory,
an instance hierarchy for each space, and a triangle hierarchy for each
instance. Queries allocate no memory and do not rebuild panels. Construction
sorts shared edges for adjacency instead of comparing all triangle pairs.

The [spatial index contract](../collision/spatial-index.md) specifies ownership,
scene replacement, stable contact identity, memory cost, and measured scaling.
Static poses remain immutable. C4 adds prescribed kinematic trajectories and
interval queries without changing geometry or rebuilding this index.

**Check:** indexed queries match exhaustive mesh queries, including all contact
fields, equal-time hits, rotated instances, space isolation, and initial surface
overlap. Scaling checks add distant rooms and pipe detail while holding nearby
geometry constant. They measure active simulation ticks and prediction paths
separately. Ownership and replacement checks cover consumed builders, empty
scenes, and failed builds.

### C3. Contact solving and overlap — implemented

[Sphere motion](../collision/motion.md) replaces the four-contact slide loop.
It solves the nearby contact half-spaces together, separates stationary overlap,
and uses a radius- and coordinate-dependent margin. Each step consumes travel
or returns an explicit failure with the contact and remaining travel. The game
stops on failure. It does not silently truncate the step.

Explicit solid instances provide volume classification. Open or inconsistently
wound solids fail construction. Spawn and load reject embedded or overlapping
bodies. A replacement scene requires body validation before use. Moving
colliders require the relative-motion contract in C4, not snapshot recovery.

The baseline elbow discarded 13.518690 m after four contacts. The new solver
completes it through eight contacts. Checks cover acute corners, three-plane
separation, conflicting constraints, coplanar seams, resting contact, solid
containment, transformed instances, and 2400 repeated elbow slide steps.
See the motion contract for failure statuses, numerical tolerances, storage,
and dense-contact cost.

### C4. Contact identity and moving anchors — implemented

The [kinematic mesh contract](../collision/kinematic-meshes.md) defines prescribed
translation and rotation, relative continuous queries, and contact response.
Hooks retain instance and surface identities and the local surface point.
Rendering, physics, attachment updates, and prediction use the same poses.
A rotating beam in each game world provides a visible consumer.

The machine drive absorbs reaction impulses. Release keeps acquired player
velocity. Cable accounting separates winch work, machine work, and inelastic
loss. Mesh contact accounting records net player kinetic-energy change.

Focused component checks launch and attach the hook, ride translating and
rotating anchors, release, and collide at speed. They check transformed local
points, space isolation, energy, and explicit failure for opposed constraints.
The checks do not load a game level.

### P1. Drum frames and forces — world feature

[Force evaluation](../../src/game/flight/environment.crs) already includes centrifugal force,
Coriolis force, and speed-dependent drag. The hook uses the same force function.
[Drum parameters](../../src/game/flight/environment.crs) are fixed: a Z spin axis, an origin
750 m along local Y, a 4,000 m density scale, and spin either zero or
0.0495 rad/s. The expedition uses the stopped state. There is no per-region
frame, partial-spin parameter, or time-dependent angular velocity.

**Change:** represent drum origin, axis, angular velocity, and atmosphere as
region data. Implement frame transfer for linear and angular state. Include
the Euler acceleration term if angular velocity changes with time. Keep
constant-spin regions simple; do not add terms they do not require.

**Check:** stopped, partial, and full spin; a different axis and origin;
transfers between frames; and equivalent inertial trajectories. Compare
force and energy behaviour with controlled reference cases.

### P2. Integration and body model — asset proof checks; world feature expansion

[Simulation](../../src/game/flight/physics.crs) uses velocity-first Euler integration
with `STEP = 1/120` s. Collision sweeps a straight segment for that step.
[Orientation](../../src/game/flight/orientation.crs) directly changes the basis from
commands. There is no angular velocity, inertia, torque, or dynamic rigid-body
solver. The current drone is a controlled sphere, not a rigid ship hull.

**Change:** retain the controlled sphere for the asset proof. Measure error
with tighter curves, stronger forces, and moving geometry. Add substeps or a
different integrator when a reference case requires it. Add angular dynamics
only for a specified game feature; do not change flight controls merely to
support static asset meshes.

**Check:** timestep convergence, high-speed narrow openings, tether/contact
interaction, and strong Coriolis curvature. Moving-machine work must include
relative motion during each collision interval.

### P3. Tether rules and spatial ownership — world feature

[Tether code](../../src/game/flight/tether.crs) constrains a direct segment to one anchor.
It has no wrapping or obstacle contact. The flying hook has a 120 m range;
attached reeling is latched and uses a 40 m/s target with charge and collision
constraints. These are deliberate game rules. The cable has no representation
for a path through transformed spaces. C4 supplies moving mesh owners and local
attachment points within one collision space.

**Change:** preserve the direct cable rule. Specify and implement cable state
across portal crossings before that feature is playable.
Do not add rope wrapping as an incidental collision fix.

**Check:** player and hook on opposite sides of a transformed portal, crossing
in both orders, range calculation, release, and winch energy. Tests must use
the selected spatial path contract, not a global-coordinate shortcut.

## World structure and tools

### W1. Prefab topology and placement — asset proof, then room scale

[Prefab data](../../src/game/content/prefab.crs) has three rectangular ports per box,
64 temporary panels per face, and translation-only instances. Port matching
uses exact world-coordinate equality. The [expedition layout](../../src/game/expedition/expedition-layout.crs)
contains five fixed room instances and five links. Containment tests use box
volumes. There is no generated compound-room or rotated-socket contract.

**Change:** use named sockets and rigid instance frames. Generate compound
room boundaries and closures from the recipe. Share canonical connection
geometry instead of separately rounding each side. Validate topology at build
time. Replace fixed port storage when the first approved room needs more ports.

**Check:** rotated connections, four-way junctions, unused closures, loop
closure, and non-box containment. Render and sweep both sides of every seam.

### W2. Gameplay portals — world feature

The renderer has transformed portal support, but
[game submission](../../src/game/view/scene.crs) sets portal count to zero. Movement
uses one global scene coordinate system and does not transfer through portal
planes. Ordinary matched room doors do not supply the promised transformed
portal gameplay.

**Change:** use space-local instance and body state. Resolve a portal crossing
at its time of impact, transform pose and velocity, and consume remaining
motion in the destination. Apply the same topology to hook, cable, prediction,
collision, rendering, and save state. Resolve frame velocities under P1.

**Check:** translated, rotated, and cyclic spaces that cannot share one global
embedding. Test crossings near edges, multiple crossings within a step, and
camera/player/hook agreement without a one-frame discontinuity.

### W3. World precision and residency — room scale and world feature

Positions are `f32` vectors in a single course-scale frame. The game has no
asset residency manager or large-world coordinate representation. The full
megastructure in the game design cannot be validated by tests on five rooms.

**Change:** use local space coordinates and explicit space/instance identity.
Define which connected regions and assets must remain resident for visible
portals, collision, prediction, and active hooks. Choose world-coordinate
precision from measured error at the required scale.

**Check:** place equivalent geometry at distant design locations and compare
local motion, seams, and hook contacts. Test region loading while an active
cable or portal view still refers to its assets.

### T1. Viewer and build lifecycle — asset proof

There is no standalone parameter viewer, asset registry, generated-asset cache,
or source-reload contract. The demo and game provide reusable window and
capture helpers, but their scenes and controls are application-specific.

**Change:** implement the independent viewer in the asset design. Keep asset
ownership, parameter metadata, compilation, GPU upload, and inspection modes
separate. Validate public inputs and report failed rebuilds explicitly.

**Check:** parameter edits, source errors, successful replacement, camera
preservation, repeated reload, headless captures, and clean shutdown. Use the
same bundle in the game, including its collision data.

### T2. Platform and reproducibility — asset proof baseline, then platform delivery

[Bootstrap support](../build/bootstrap.md) is Linux x86-64. The root uses Linux linker
flags and native host operations. Vulkan portability alone does not provide a
Windows build. [Recordings](../../src/game/host/recording.crs) use host binary words and
version 10; saves use level version 3. Neither format identifies a generated
recipe, parameter set, style revision, or content hash.

**Change:** keep the current source bootstrap. Implement required Windows
host/platform operations in Crust and explicit native providers. Extend asset,
save, and replay identity before editable content can alter a recorded world.
Define byte order and numeric reproducibility for cross-platform replay.

**Check:** rebuild assets from source, reject mismatched content explicitly,
and replay the same supported build. Test Windows and NVIDIA on actual target
systems before declaring support. Keep simulation equality separate from
cross-driver image equality.

## Preserved contracts

The following are not defects to remove during this work:

- Vulkan compute rendering and SPIR-V supplied by Crust.
- Crust ownership checks and source bootstrap through a root file.
- Full-bright texels that do not emit light.
- Palette-derived colour and the screen-space dither style.
- A spherical controlled drone unless a new body model is explicitly designed.
- Direct cable passage through obstacles, range-limited launch, and latched reel.
- Closed room boundaries and explicit failure on render work overflow.

The first implementation must close R1, R2, the asset-data part of R3, C1,
C2's repeated construction, C3's required contact cases, W1's assembly contract,
and T1 for the production proof. Other entries name the feature or scale test
that must trigger their implementation. Each closure needs its listed evidence;
a green build alone does not close a capacity or physical-behaviour gap.
