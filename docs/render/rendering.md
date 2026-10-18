# Rendering

See the [task graph architecture](../runtime/task-graph.md) for the target
CPU task model, asynchronous renderer API, and frame resource lifetimes.

See the [parametric asset design](../content/parametric-assets.md) for generated content
and the [engine gap register](../content/engine-gaps.md) for remaining physics,
world-state, and tool work.

## Status and decisions

This document defines the rendering direction. A bounded compute renderer and
automatic demo now implement the core frame path. See the
[implementation and checks](renderer-build.md) for commands, allocation bounds,
and tested scope. The large-scene and playable-game gates below remain acceptance
requirements. The reference project is
[ship3d](https://github.com/hardcode84/ship3d/tree/fff58ad70d101859e3498b2ed0d910cd9f5721a5).

The following decisions are fixed:

- Keep the rendering core in `src/render/` and application policy in `src/demo/`
  and `src/game/`. Put shared application helpers in `src/app/`.
  The core consumes scene data and compiled shaders. It has no demo geometry, animation
  frame indices, input handling, or palette generation.
- Use Vulkan compute on desktop and WebGPU compute in the browser for all image generation.
- Use Crust for host and device code. Compile device code to Vulkan Shader SPIR-V
  outside the renderer. See the [compiler investigation](../build/crust-spirv.md) for the
  LLVM shader stage, tested scope, and required Crust changes.
  The same device sources compile to WGSL for the [web game](../build/web.md).
- Target Windows and Linux on AMD, Intel, and NVIDIA GPUs.
- Support large outdoor spaces and tight interiors in full 3D.
- Preserve translated and rotated portals as a gameplay feature.
- Permit spaces that cannot fit into one global coordinate system.
- Preserve ship3d-style indexed textures, palette-based lighting, and dithering.
- Keep the final output colour count unrestricted by a frame palette.

The tiled rasterizer and frame sequence below define the target design. Keep
expansion subject to the bounded experiments and measurement gates in this document.

## Image style

Make the internal resolution configurable, including native output resolution.
Keep it independent of the window size. The rendering style must work at high
resolutions. When image scaling is required, use nearest-neighbour sampling to
preserve the palette and dithering.

Use small indexed textures, discrete light levels, and visible dithering. Keep
depth calculations accurate. Colour precision must not reduce visibility accuracy.

For point lights, use `sqrt(max(0, cos(theta))) / (1 + d/R)^2`.
The square root softens the angular response at grazing angles. The camera
lamp keeps `max(0, cos(theta)) / (1 + d/R)^2`.
Quantize each light to eight brightness levels before combining lights.
Contributions below the first level are zero. Keep broad bands of constant
brightness. Sample lighting on a 16 by 16 screen-space grid and dither between
its corner samples. Quantize at the sample nodes; do not add a per-pixel
brightness-transition ramp. Use enough lookup-table levels to preserve these
bands. Unlit nodes remain black.

Allow material settings for perspective-correct texture mapping, affine texture
mapping, and correction at short span boundaries. Vertex snapping is also a
material or style setting. These settings must not change portal connections.
Surface coverage and depth must agree with the snapped geometry when snapping is
enabled. Shared edges must use the same snapping rule.

### Palette contract

Use indexed source textures and discrete light states. Combine a texture colour
index with a light state to select a lit colour from a material lookup table.
Materials can share tables or use separate tables. Preserve these associations
through portal rendering and image composition.

Allow a full-bright flag for each source palette entry. For a flagged entry,
store the same RGB colour at every light state. These texels keep their colour
in darkness and under coloured light. Lighting dithering does not change them.
They obey depth and portal visibility and do not illuminate other surfaces.
Do not reserve a fixed range of palette indices in the renderer.

Support an optional camera-space light with configurable colour and falloff.
Physical game lights use object-to-room anchors. The player lamp, hook lamp,
and fixed lamps retain room-local positions across all camera views. An object
can have several anchors in one room through different portal paths. See the
[light contract](lighting.md). These lights do not change ambient lighting or
the full-bright palette entries.

Resolve the selected colours into an RGB colour image. Do not require one palette
for the complete frame or quantize the final image to a fixed colour count.
Lighting, fog, effects, UI, and borders can contribute additional colours. Keep
their appearance consistent with the palette and dithering style. Output alpha
is opaque.

Each source palette has 256 colour entries. Texture indices are from zero
through 255. Geometry, material, and storage indices are independent of this
colour range. Select GPU storage formats from measured bandwidth and access
cost. Packed writes must have one owner per word.

Lighting and fog can use higher precision for intermediate calculations. Preserve
discrete light levels in scene shading. Any enabled blending operation can work
on resolved colours without conversion to a final frame palette.

Do not interpolate palette indices as colour values. Index order does not define
colour distance. Build colour and light lookup tables from the palette colours.

### Dithering contract

Apply dithering on the internal pixel grid, before any image scaling. Use image
coordinates shared by all views for the pattern. Do not restart the pattern at
tile or portal boundaries. Keep the pattern stable across frames for unchanged
inputs. Dithering must work at every supported resolution.

Use a deterministic spatial pattern to choose between discrete light samples or
palette-derived colours. The choice can represent an intermediate colour or light
level. Do not smooth the pattern during enlargement.

Use ship3d's alternating corner-sample checker as the default. Keep Bayer
corner selection available for comparison. The light grid uses each visible
triangle's plane and the same screen-space origin in every portal view.
Coverage, depth, and texture sampling remain per-pixel.

### Relation to ship3d

The inspected ship3d revision uses six bits for base colour and six bits for light
state. Its combined table can contain 4096 entries, and it writes BGRA pixels.
Table entries can contain duplicate colours. It also samples lighting on a coarse
grid and alternates nearby samples. Use this shading model as the reference.
Its table sizes are reference values, not required limits for the new renderer.

Sources: [colour types](https://github.com/hardcode84/ship3d/blob/fff58ad70d101859e3498b2ed0d910cd9f5721a5/ship3d/ship3d/game/units.d#L22-L34),
[combined palette](https://github.com/hardcode84/ship3d/blob/fff58ad70d101859e3498b2ed0d910cd9f5721a5/ship3d/ship3d/game/renderer/palette.d#L95-L132),
and [light sampling and dithering](https://github.com/hardcode84/ship3d/blob/fff58ad70d101859e3498b2ed0d910cd9f5721a5/ship3d/ship3d/game/renderer/rasterizerhybrid2.d#L275-L366).

## Vulkan and SPIR-V boundary

The renderer consumes SPIR-V for the Vulkan shader environment. A generic SPIR-V
module for another execution environment is not sufficient. Use compute entry
points and Vulkan compute pipelines. The driver compiles the modules for its GPU.
The renderer does not require the shader source language at run time.

Define one shader interface for each pass. Specify its entry point, buffer and
image bindings, data layout, push constants, and workgroup dimensions. Derive
host and shader declarations from the same interface description. Do not infer
the interface from source-language types or native host structure layout.

Before shader integration, select the minimum Vulkan version and SPIR-V target
environment from the intended device list. Record all required capabilities and
limits. Validate build outputs with `spirv-val` for that environment. Validation
does not prove shader behaviour or interface correctness.

Validate external assets and shader packages at their load boundary. Check device
features and surface capabilities at initialization. Report missing requirements
with the device, module, and requirement names. Do not silently select a CPU
renderer or a graphics pipeline.

Internal passes consume verified data from their producers. Do not repeat asset
validation inside pixel loops. Internal transforms that cannot fail must not
return a recoverable status. Allocation, IO, device, and capacity failures remain
explicit error conditions.

The portable design must not require hardware ray tracing, mesh shaders, 64-bit
atomics, or a fixed subgroup width. Use indexed buffers and ordinary compute
workgroups for the first implementation. Introduce subgroup optimizations only
after their required operations and sizes are checked on the target devices.

Sources: [Vulkan shader specification](https://docs.vulkan.org/spec/latest/chapters/shaders.html),
[SPIR-V Tools](https://github.com/KhronosGroup/SPIRV-Tools),
and [Vulkan subgroups](https://docs.vulkan.org/guide/latest/subgroups.html).

## CPU and GPU responsibilities

The CPU loads assets, uploads scene changes, creates Vulkan resources, submits
commands, and handles the window. Asset preparation can build spatial hierarchies
and colour tables before rendering.

The GPU performs view traversal, visibility tests, mesh detail selection, vertex
transforms, clipping, rasterization, lighting, palette selection, dithering, UI,
and enlargement. Normal rendering must not read visibility or work counts back
to the CPU. Debug captures and measurements can read GPU results.

Classify per-frame rendering passes as hot paths. Treat asset conversion and
pipeline creation as cold paths. Keep allocations, source compilation, and
repeated interface checks out of the frame loop.

## Spaces, portals, and views

A space owns geometry in local coordinates. An interior room and an outdoor area
use the same space interface. An outdoor space contains a spatial hierarchy and
mesh detail levels. It does not require a room for every terrain patch.

A portal connects two openings with translation, rotation, and positive uniform
scale. The reverse connection applies the inverse transform. Reflections are
invalid. See [scaling portals](../game/scaling-portals.md) for the scale contract.

A view identifies a space as seen through a particular portal path. It contains
the accumulated camera transform, destination clip plane, pixel coverage, and
remaining portal crossing budget. A room ID alone does not identify a view.

The same space can appear in multiple views with different transforms. Do not use
a global visited-room flag. Do not combine coverage from different transforms.
Do not replace two separate visible openings with their bounding rectangle.

This preserves ship3d's
[connection transforms](https://github.com/hardcode84/ship3d/blob/fff58ad70d101859e3498b2ed0d910cd9f5721a5/ship3d/ship3d/game/topology/polygon.d#L128-L154)
and [portal clipping semantics](https://github.com/hardcode84/ship3d/blob/fff58ad70d101859e3498b2ed0d910cd9f5721a5/ship3d/ship3d/game/topology/polygon.d#L216-L245).

### Portal visibility contract

Portals are directed apertures. Render an aperture only from its source side.
Use its destination clip plane and similarity transform to determine this side.
A reverse aperture at the same opening must not select pixels immediately after
a view enters the destination.

Resolve parent geometry and portal surfaces together. A nearer opaque object
must hide the portal pixels behind it. A completely hidden portal creates no
child work.

Transient detail can use a separate camera-space near plane. Triangles with
`TRIANGLE_DETAIL_NEAR` use the larger of `DETAIL_NEAR` and the normal near
plane. Apply this clipping after each portal view transform. Zero keeps the
normal near plane. This lets nearby markers disappear while their distant
recursive copies remain visible.

Clip portal apertures against the eye plane, not the geometry near plane.
An aperture between the eye and the geometry near plane must still select child
pixels until the camera crosses its plane. Keep the geometry near plane for
ordinary surfaces. A portal plane through the eye has zero projected area;
it must not cause division by zero.

Create a child view only for pixels where the portal wins visibility. Start child
visibility on the destination side of the portal plane. Geometry between the
virtual camera and that plane must not appear through the opening.
Use the exact destination plane and include its boundary. Do not move the plane
into the destination space: that gap can remove a surface as it crosses a portal.

Each child has its own depth context. Its image replaces only the selected parent
portal pixels. Do not compare child depth values directly with parent depth
values. Two visible instances of one space must retain separate view state.

An object that crosses a portal needs geometry on both sides, with the correct
transforms and clipping. A whole-object room assignment is insufficient during
the crossing.

Cyclic portals require explicit termination. A scene must specify a finite
crossing budget and a terminal palette material. At the limit, render that
material at the portal surface. Reject missing termination data at import.
Do not leave pixels from an earlier frame. Resource overflow is an error, not a
portal termination rule.

## Proposed compute rasterizer

Use a tiled triangle rasterizer with depth testing. Depth testing supports
terrain, props, and overlapping meshes inside each space. Portal masks restrict
view coverage; they do not replace depth testing inside a view.

Start the experiment with 8 by 8 pixel tiles. One workgroup owns a tile for one
view. Each pixel has one invocation that resolves depth and the winning primitive.
Use a defined edge coverage rule and a stable primitive tie rule.

An exact 8 by 8 coverage mask needs two 32-bit words. This representation supports
disconnected coverage without filling the gaps. Do not assume that 64 invocations
form one hardware subgroup.

Prepare transformed geometry once per view where practical. Then assign triangles
to tiles. Do not repeat complete space traversal and vertex transforms for every
tile. Measure large triangles, long thin triangles, and dense small triangles
before selecting a more complex assignment algorithm.

Evaluate shared raster edges with one endpoint order. Use the edge direction
only to select the sign and the top-left ownership rule. Opposite evaluations
must not round independently: both triangles can otherwise reject an edge pixel
and expose geometry behind the surface. Keep texture and depth interpolation
separate from this coverage decision.

The current retained path is specified in [retained meshes](retained-meshes.md).
It uploads mesh changes and instance placements, then expands instances in
compute. Each active view tests instance bounds before triangle clipping.
The game generates static room shells once.

### Frame sequence

1. Upload scene changes and initialize root coverage and defined background values.
2. Cull space geometry and select mesh detail for each active view.
3. Transform vertices, clip triangles, and calculate interpolation data.
4. Assign opaque surfaces, cutout surfaces, and portal surfaces to tiles.
5. Resolve coverage and depth. Test cutout coverage before committing a winner.
6. Shade visible solid surfaces with material colour tables and dithering.
7. Create child views from the remaining visible portal pixels.
8. Repeat the view passes until all pixels have a surface or terminal result.
9. Render UI in compute with the same image ownership and style rules.
10. Encode the completed colour image for presentation. Scale only when
    resolutions differ.

The current capacity and overflow contract is specified in
[portal capacity](portal-capacity.md). It sizes portal records and path views
from caller budgets and records the selected crossing depth.

Use GPU work counts and indirect dispatch where work depends on visibility. Put
explicit memory dependencies between producers, indirect command reads, and
consumers. A workgroup barrier does not synchronize separate workgroups.

Keep opaque and cutout materials in the first experiment. Reject blended materials
at import for that experiment. Before accepting blended content, define and test
its ordering through portal views and its interaction with discrete lighting
and dithering.

### Memory and work ownership

Store space geometry, portal data, materials, and texture data in GPU resources.
Use indices for references between records. Separate immutable assets from frame
data. Use contiguous arrays for data read together by adjacent invocations.

Allocate view records, triangle lists, masks, and indirect commands from explicit
frame budgets. Count variable work before filling its lists. A count that exceeds
capacity must produce a reported frame error without an out-of-bounds access.
Do not present a partial frame. Do not omit views or triangles to make a frame fit.

Do not allocate a full-screen colour and depth image for every portal. Use coverage
and tile ownership to restrict active storage. Reuse storage only after all
readers and writes are complete. Measure peak storage under repeated portal views.

## Presentation and platform support

All application image generation uses compute. No vertex or fragment draw pass is
required by this design. Vulkan transfer commands and window presentation remain
allowed operations.

Query the surface and image-format capabilities. Write the final image directly
to a storage-capable swapchain image when supported. Otherwise, require a supported
transfer path from a compute output image. Include all format and layout checks.
If neither path exists, report the missing capability and reject that device and
surface combination.

Only colour-attachment usage is universally required for ordinary Vulkan swapchain
images. Direct storage writes and transfer destinations must be checked.
[Vulkan surface capabilities](https://docs.vulkan.org/refpages/latest/refpages/source/VkSurfaceCapabilitiesKHR.html)

Preserve the selected colours through application-controlled colour conversion.
Do not add a mandatory final palette reduction. Use nearest-neighbour sampling
when scaling, so the dither pattern remains visible. The operating system
compositor and display hardware are outside this image contract.

Windows and Linux support on AMD, Intel, and NVIDIA is a target, not a test result.
Before implementation, name the oldest supported device and driver for each target
combination. Record device limits, output formats, and the presentation path.

## Bounded experiment and acceptance

Build one scene that uses the actual scene representation and frame submission
path. Use a tight interior with a doorway onto outdoor terrain. Add two portals
that show the same destination with different transforms. Include a moving opaque
mesh, cutout foliage, a crossing object, and a recursive portal path.

Use 640 by 360 pixels as an initial benchmark case. Also measure native output
resolutions from the target device and display list. Benchmark resolutions do not
set renderer limits. The proposed frame production target is 16.67 milliseconds
at the 99th percentile. Include CPU frame preparation and all GPU work through
the final image transfer. Measure intentional display pacing waits separately.
Confirm the target for each device and resolution before measuring. This is an
experiment target, not a performance claim.

Capture a fixed camera and animation sequence. Record scene hashes, geometry
counts, portal crossings, visible view counts, resolution, device, driver, and
build settings. Separate startup and pipeline creation from steady frame timing.
Measure CPU submission, each GPU pass, presentation waits, and peak GPU memory.

The correctness checks must cover:

- Two transformed views of one destination remain visible at the same time.
- A foreground mesh hides the correct portal pixels.
- Geometry before the destination clip plane remains hidden.
- An object crosses a portal without duplication outside the permitted regions.
- Sky and terrain appear correctly through an interior opening.
- Cutout texels do not hide geometry or portals behind them.
- Portal termination writes the declared terminal material.
- Work overflow reports an error without memory corruption or a partial frame.
- Repeated static frames keep the same dither phase.
- Material colour and light lookups match the declared reference tables.
- Different material palettes remain correct when portal views and UI are combined.
- A reference image with more than 256 colours survives presentation without
  palette reduction.

Use reference coverage, depth, and palette images for correctness. ship3d alone is
not a correctness oracle. Its active path has no general depth test. Its generated
static lights also do not enter the active light list. Establish intended images
before comparing output with that program. Include the generated static lights
when rebuilding its active light list before using its lighting as a reference.

Compare the initial rasterizer with an otherwise identical version that disables
optional visibility optimizations. Keep required portal masks active in both.
This establishes whether extra culling saves more work than it costs. Report
correctness and performance separately for every target device.

Stop expansion if portal visibility, the palette contract, memory budgets, or the
agreed frame target fails. Identify the failing pass and its mechanism. Repeat the
same scene after a bounded correction. Do not add a larger rendering system until
this experiment meets its acceptance criteria.

## Movement trial interface additions

The [movement trial](../game/movement.md) uses the renderer from a separate game entry
point. Shared application helpers are in `src/app/`; game policy is in
`src/game/` and renderer test policy remains in `tests/render/`.

`PROJECTION` stores the positive tangent of half the vertical field of view.
Renderer setup sets it to 1. Projection, light-grid rays, and the CPU reference
use the same value. View transforms carry a positive uniform scale separate from rotation.

An optional text overlay is composed by GPU compute. The caller supplies an
80 by 6 cell grid and 128 glyphs with eight rows each. A zero cell is transparent.
Each cell covers eight output pixels per axis. The renderer has no built-in
font, labels, input state, or game status. `OVERLAY_ENABLED` defaults to zero.
The caller supplies the two overlay colours through `OVERLAY_COLOR`. These
colours must have opaque alpha.

### Text scale

`OVERLAY_SCALE` selects an integer pixel scale for the text overlay. Zero and
one select native pixels. The overlay bounds scale with the glyphs. The caller
sets the scale; the renderer does not use game state to choose it.

### Game room shells

The playable expedition uses [a seeded room graph](../game/expedition.md). Large
chambers supply open flight space. The level must have no path or uncovered
sightline to the outside void. Matched ports connect complete room shells;
unused ports remain closed. Drawing and collision use the same wall panels.
The game builds these panels. The rendering core remains independent of room
templates and mission rules.

### Material storage

Material descriptors, texture data, and shared palette tables use dynamic
storage. Each descriptor selects a texture region with its own dimensions and
row stride. Textures need not be square or powers of two. Each vertex supplies
its own normalized UV coordinates. Repeat wraps out-of-range coordinates,
including negative values. Clamp is available per axis. Texture regions can
refer to subregions of one atlas without copying texels.

Each palette contains 256 colours with 512 light states per colour. Multiple
materials can use the same table. The game uses 19 materials; the renderer has
no fixed material count. Device memory and storage range bound the allocation.
The [texture interface](textures.md) defines the host API and validation rules.

## Particle sprites

`input_sprite` submits a fullbright rectangle with a room ID, material, centre,
width, and height. Dimensions use room metres and must be positive and finite.
The compute transform faces each rectangle toward the camera of its current
portal view. Rotated and scaled portal views use the same source sprite.

Sprites use the material texture and its full UV range. Optional cutout uses the
material's transparent palette index. Opaque texels use normal depth tests and
portal clipping. Sprites do not cast shadows or add light. The renderer uses the
normal dynamic geometry capacity and reports allocation errors to the caller.

The application owns particle motion, lifetime, emission, and room overlap
placements. Sprite submission has no game-specific emitter or particle limit.
