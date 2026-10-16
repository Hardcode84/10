# Engine gap register for generated content

## Scope and evidence

This register supports the [parametric asset design](parametric-assets.md).
It lists open work only. Implemented behaviour and its checks are documented
in the [component contracts](../README.md#documents). Existing checks cover
the current scenes, not arbitrary generated assets.

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

## Physics and spatial state

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
attached reeling is latched and uses a 40 m/s target with collision
constraints. These are deliberate game rules. The cable now stores its hook
space and the rigid transform from that space to the player cable frame.
Crossings preserve unfolded length, velocity, and local mesh attachment.
[Moving mesh anchors](../collision/kinematic-meshes.md) retain local attachment
points in their owning collision space.

**Change:** preserve the direct cable rule when different room instances enter
the expedition. Add persistent room identity to cable save state and residency.
Do not add rope wrapping as an incidental collision fix.

**Check:** player and hook on opposite sides of a transformed portal, crossing
in both orders, range calculation, release, and winch energy. Tests must use
the selected spatial path contract, not a global-coordinate shortcut.

## World structure and tools

### W2. Gameplay portals — world feature

[Game submission](../../src/game/view/scene.crs) now uses the collision link
table for rendered portal transforms. Drone and hook motion resolve crossings
before later contacts, transform the remaining motion, and retain cable state.
The game assembles a seeded graph of distinct local room spaces. It uses
named connections with random mating rolls and reciprocal links.

**Change:** include
destination geometry in swept-sphere queries while a body overlaps both sides
of a seam. Current queries change collision space when the centre crosses;
a destination prop closer than the body radius to the portal needs both-space
queries before that crossing. Store room identity in saves. Resolve frame
velocities under P1.

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

The [recipe viewer](parametric-assets.md#implemented-recipe-workflow) compiles a selected Crust file, edits its
dimensions, replaces generated room bundles, and captures interior, exterior,
and spawn views. It does not yet provide asset caching, source reload within
the running process or the diagnostic overlays in the
asset design. Source edits require the root command again.

**Change:** complete the inspection and source-reload controls in the asset design. Keep asset
ownership, parameter metadata, compilation, GPU upload, and inspection modes
separate. Validate public inputs and report failed rebuilds explicitly.

**Check:** parameter edits, source errors, successful replacement, camera
preservation, repeated reload, headless captures, and clean shutdown. Use the
same bundle in the game, including its collision data.

### T2. Platform and reproducibility — asset proof baseline, then platform delivery

[Bootstrap support](../build/bootstrap.md) is Linux x86-64. The root uses Linux linker
flags and native host operations. Vulkan portability alone does not provide a
Windows build. [Recordings](../../src/game/host/recording.crs) use host binary words and
version 12; saves use level version 3. Neither format identifies a generated
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

The production proof still requires W1's assembly contract and T1. Other entries
name the feature or scale test that must trigger their implementation. Each
closure needs its listed evidence; a green build alone does not close a
capacity or physical-behaviour gap.

## Rendering storage

### R8. Projection storage follows the full room-view product

`geometry_layout` reserves projected and clipped data for every submitted
triangle and every reserved view. A portal view can use only its destination
space, but other room triangles still consume reserved projection storage.
The graph game reserves 129 views. At seed 42, complexity 2, and 640 by 480,
llvmpipe rejects the geometry buffer at its `maxStorageBufferRange` limit.
The same graph renders on W7900 and Arc Pro B60. Changing image resolution
alone does not remove this triangle-view product.

**Change:** count visible room-view work and assign compact projection ranges
with a prefix sum. Size clipped output from that work. Preserve portal masks,
triangle ordering, and explicit allocation failures. Do not hide the failure
by dropping rooms or reducing the selected portal depth.

**Check:** compare images and portal masks before and after the change. Render
the stated graph within llvmpipe's storage-buffer limit. Measure allocation
against visible room-view work as total graph size increases.
