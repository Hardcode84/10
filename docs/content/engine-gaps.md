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

### R6. Lighting and surface response — asset proof, then room scale

The [layout](../../src/render/interface.crs) permits eight point lights.
[Lighting](../../src/render/device/common.crs) computes face normals from triangle
positions and evaluates lights without an occlusion query. It does not accept
authored vertex normals or normal maps. A wall does not block a light within
the same space. Full-bright texels and the screen-space light grid already work.

**Change:** preserve flat shading as a valid style. Add other normal inputs
only when an accepted asset requires them. Define room/light influence and
visibility before using local lamps to distinguish adjacent spaces. Scale light
selection with measured scene costs, without changing full-bright texels into
emitters.

**Check:** a lamp behind a closed bulkhead must not light the other side under
the selected visibility rule. Compare faceted curved parts in neutral and game
light. Verify that distant lights and indicators do not change local shading.

### R7. Memory, upload, and synchronization — room scale

[Resource allocation](../../src/render/host/resources.crs) allocates one packed
device buffer and an equally sized staging buffer. Each has dimension-dependent
image storage, 8 MiB of status, and geometry-dependent storage, before other Vulkan
resources. Geometry offsets follow the allocated capacity. [Frame dispatch](../../src/render/host/dispatch.crs)
uploads fixed scene/table ranges each frame and reads back the 8 MiB invocation
status region. [Frame validation](../../src/render/host/renderer.crs) scans that
region and waits for GPU completion before returning.

**Change:** measure the baseline before altering synchronization. Separate
persistent asset data from frame data. Upload changed assets once. Define
owned allocation ranges and retirement fences. Replace full status readback
with a complete compact failure report if measurements justify it. Preserve
exact diagnostics and the rule that failed output is not presented.

**Check:** repeated unchanged frames, repeated asset replacement, failed
allocation, and shutdown with submitted work. Report CPU wait, upload bytes,
GPU time, and peak memory separately. Do not claim faster rendering from a
lower triangle count alone.

## Collision and physical state

### C1. Shape representation — asset proof

[Collision queries](../../src/game/flight/collision.crs) sweep spheres against axis-aligned
boxes. [Pipe collision](../../src/game/flight/pipe-collision.crs) supports straight,
axis-aligned six-sided prisms. [Shell collision](../../src/game/expedition/expedition-shell.crs)
uses rectangular panels. The drone radius is 0.35 m; the hook radius is 0.06 m.
There is no arbitrary generated mesh collider or rotated prefab collider.

**Change:** implement the static mesh collision contract in the asset design:
continuous sphere sweeps, face/edge/vertex contacts, adjacency, and transformed
instances. Generate collision from the same construction data as the mesh.
Do not approximate every curve with overlapping boxes.

**Check:** swept and revolved parts, diagonal braces, concave openings, tangent
contacts, seams, and high-speed approaches from both directions. Verify the
hook contact against the visible surface. Preserve drone clearance.

### C2. Query cost and repeated construction — asset proof, then room scale

`course_hit` in [collision code](../../src/game/flight/collision.crs) scans all solids
and pipes. `expedition_shell_hit` scans every room and rebuilds cut wall panels
for each query. Hook flight, movement, and prediction all use these queries.
No spatial acceleration structure selects nearby candidate geometry.

**Change:** bake static collision and shell panels. Build a spatial index over
instances and their surfaces. Keep dynamic instance updates separate from
static construction. Queries must consume built data without allocation.

**Check:** compare indexed results with exhaustive queries. Increase room and
instance count while holding the nearby geometry constant. Measure active
tick and prediction query costs separately.

### C3. Contact solving and overlap — asset proof

`move_drone` handles at most four successive slide contacts, then discards
remaining travel. Each contact adds a fixed 0.0001 m normal offset. The sweep
routines do not supply a general initial-penetration resolution contract.
Stationary cases in the current tests do not prove arbitrary overlap recovery.
Sequential sliding is not a persistent multi-contact solver.

**Change:** define initial-overlap handling for spawn, reload, and moving
geometry. Preserve valid remaining motion or report a solver failure with a
specific contact case. Define scale-aware tolerances and a contact-set rule
for corners. Do not silently accept an invalid embedded state.

**Check:** more than four contacts in a step, acute corners, coplanar seams,
resting contact, an invalid spawn inside geometry, and repeated sliding along
a generated elbow. Record the witness before selecting a replacement solver.

### C4. Contact identity and moving anchors — world feature

[Hit records](../../src/game/flight/collision.crs) contain only time and normal.
[Hook attachment](../../src/game/flight/hook.crs) stores a position in `Cable.anchor`.
[Drone state](../../src/game/flight/state.crs) has no collider or body identity for that
attachment. Collision geometry has no velocity or motion interval.

**Change:** return stable instance/surface identity and a local contact point.
For moving machines, add kinematic poses, surface velocity, relative swept
queries, and attachment updates. Couple winch work and momentum to the selected
moving-anchor model. A rotating visual mesh alone is not a moving machine.

**Check:** hook a moving beam, ride its motion, release it, and collide with it
at speed. Verify contact location and energy accounting in the chosen frame.

### P1. Drum frames and forces — world feature

[Force evaluation](../../src/game/flight/physics.crs) already includes centrifugal force,
Coriolis force, and speed-dependent drag. The hook uses the same force function.
[Drum parameters](../../src/game/course/course.crs) are fixed: a Z spin axis, an origin
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
for a path through transformed spaces or for a moving owner.

**Change:** preserve the direct cable rule. Specify and implement cable state
across portal crossings and moving anchors before either feature is playable.
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
