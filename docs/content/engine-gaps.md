# Engine gap register for generated content

## Scope and evidence

This register supports the [parametric asset design](parametric-assets.md).
It lists open work and checks that new features require. Implemented behaviour
and its checks are documented in the [component contracts](../README.md#documents).
Each entry states the current contract, the required change, and an acceptance
check. A passing build alone cannot prove capacity or physical behaviour.

Rooms already use local coordinates and explicit identities. Gameplay supports
translated, rotated, cyclic, and [scaled portals](../game/scaling-portals.md).
Player and hook motion, overlap contacts, prediction, and rendering use these
spaces. [Moving mesh contacts and anchors](../collision/kinematic-meshes.md)
are implemented. These features are no longer open tasks.

## Physics and spatial state

### P1. Drum frames and forces

[Force evaluation](../../src/game/flight/environment.crs) includes centrifugal
force, Coriolis force, and speed-dependent drag. The hook uses the same force
function. Drum origin, spin axis, atmosphere profile, and the running spin rate
are fixed in that source. Spin selection is a boolean. There is no per-region
frame, partial-spin parameter, or time-dependent angular velocity.

**Change:** before a level uses distinct drum frames, represent origin, axis,
angular velocity, and atmosphere as region data. Define state transfer between
frames for player and hook motion. Include Euler acceleration when angular
velocity changes with time. Keep constant-spin regions simple.

**Check:** stopped, partial, and full spin; different axes and origins; frame
transfers; and equivalent inertial trajectories. Compare force and energy
behaviour with controlled reference cases.

### P2. Integration checks for new force and body requirements

[Simulation](../../src/game/flight/physics.crs) uses velocity-first Euler
integration at the fixed timestep defined in
[flight state](../../src/game/flight/drone.crs). Collision sweeps a straight
segment for each step. [Orientation](../../src/game/flight/orientation.crs)
changes the basis from commands. The drone is a controlled sphere. It has no
angular velocity, inertia, torque, or dynamic rigid-body solver.

Moving-mesh queries already account for relative motion over the collision
interval. Their tests cover translating and rotating surfaces, retained hook
attachments, and contact and cable energy.

**Change:** when a feature adds stronger forces or tighter trajectories, measure
integration error against a reference. Add substeps or change the integrator
only when that measurement requires it. Add angular dynamics only for a specified
gameplay requirement. No integration defect is established by this entry.

**Check:** timestep convergence, high-speed narrow openings, tether/contact
interaction, and strong Coriolis curvature. Retain the moving-contact checks.

## World structure and tools

### W3. Asset residency and spatial precision

Player and hook state use room-local `f32` coordinates and explicit room
identities. The cable retains its portal path, scale, frame, and mesh-local
attachment in [flight state](../../src/game/flight/drone.crs). The game builds
the complete graph and its assets before play. There is no asset residency
manager.

**Change:** define which assets must remain resident for visible portals,
collision, asynchronous prediction, and active hooks. Keep their identities
valid until all consumers release them. Measure local-coordinate and composed
portal-transform error at the required room sizes and traversal depths before
changing numeric precision. Persistent identities are part of T2.

**Check:** compare local motion, seams, and hook contacts across long portal
chains, cycles, and large individual rooms. Test loading and unloading while
an active cable, prediction task, or portal view refers to an asset. A release
must wait for CPU and GPU consumers.

### T1. Viewer inspection, asset caching, and source reload

The [recipe viewer](parametric-assets.md#implemented-recipe-workflow) compiles
a selected Crust file, edits dimensions, replaces generated bundles, and
captures interior, exterior, and spawn views. It has free flight, portal names,
and waypoint overlays. Source edits require the root command again. There is
no generated-asset cache or source reload within the running process.

**Change:** add explicit source rebuild and reload, with asset cache identity
as specified in the asset design. Complete wireframe, surface-role, UV,
full-bright mask, collision, and clearance inspection modes. Keep asset
ownership, parameter metadata, compilation, GPU upload, and inspection separate.
Validate public inputs and report failed rebuilds explicitly.

**Check:** parameter edits, source errors, successful replacement, camera
preservation, repeated reload, cache invalidation, headless captures, and clean
shutdown. Use the same generated bundle and collision data in the game.

### T2. Platform delivery, persistence, and content identity

The game builds for Linux and the browser.
[Crust supports native Windows](../../crust/docs/windows.md), but the game's
[build root](../../tools/build/common.crs) still uses Linux library names and
host operations. A native Windows game build requires platform-specific
providers behind the shared interfaces.

[Recordings](../../src/game/host/recording.crs) store host binary words. Their
header checks the format, scene mode, seed, and complexity. It has no generated
recipe identity, parameter set, style revision, or content fingerprint. The
game has no save/load implementation.

**Change:** port the game build and native providers to Windows. Define content
identity for assets and recordings. For save/load, preserve room and instance
identity, body scale, cable portal path, and local attachment state. Restore
references only after their assets are available. Define byte order and numeric
reproducibility for cross-platform replay. Frame transfer remains under P1;
asset lifetime remains under W3.

**Check:** rebuild assets from source, reject mismatched content explicitly,
and replay the supported build. Save and restore an attached hook across
transformed and scaled portals. Test Windows and NVIDIA on actual target
systems before declaring support. Keep simulation equality separate from
cross-driver image equality.

## Preserved contracts

The following are intentional contracts:

- Vulkan compute with SPIR-V on desktop; WebGPU compute with WGSL in the browser.
- Shared Crust host and device sources, ownership checks, and source bootstrap.
- Full-bright texels that do not emit light.
- Palette-derived colour and the screen-space dither style.
- A spherical controlled drone unless a new body model is explicitly designed.
- Direct cable passage through obstacles, range-limited launch, and latched reel.
- Room-local coordinates, explicit portal paths, and rational body scale.
- Closed room boundaries and explicit failure on render work overflow.
