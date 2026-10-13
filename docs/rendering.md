# Rendering

## Status and decisions

This document defines the rendering direction. It does not report an implemented
renderer or measured performance. The reference project is
[ship3d at commit fff58ad70d101859e3498b2ed0d910cd9f5721a5](https://github.com/hardcode84/ship3d/tree/fff58ad70d101859e3498b2ed0d910cd9f5721a5).

The following decisions are fixed:

- Use Vulkan compute for all image generation.
- Accept SPIR-V shader modules. Compile another source language to SPIR-V outside
  the renderer. The source language and compiler will be specified separately.
- Target Windows and Linux on AMD, Intel, and NVIDIA GPUs.
- Support large outdoor spaces and tight interiors in full 3D.
- Preserve translated and rotated portals as a gameplay feature.
- Permit spaces that cannot fit into one global coordinate system.
- Preserve ship3d-style indexed textures, palette-based lighting, and dithering.
- Keep the final output colour count unrestricted by a frame palette.

The tiled rasterizer and frame sequence below are proposed designs. Prove them
with the bounded experiment in this document before expanding the implementation.

## Image style

Make the internal resolution configurable, including native output resolution.
Keep it independent of the window size. The rendering style must work at high
resolutions. When image scaling is required, use nearest-neighbour sampling to
preserve the palette and dithering.

Use small indexed textures, discrete light levels, and visible dithering. Keep
depth calculations accurate. Colour precision must not reduce visibility accuracy.

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

Resolve the selected colours into an RGB colour image. Do not require one palette
for the complete frame or quantize the final image to a fixed colour count.
Lighting, fog, effects, UI, and borders can contribute additional colours. Keep
their appearance consistent with the palette and dithering style. Output alpha
is opaque.

Palette sizes, light-state counts, and index widths are asset and shader-interface
choices. Do not impose a fixed eight-bit width on all indices. Select GPU storage
formats from the required range and measured bandwidth. Packed writes must have
one owner per word.

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

The first style comparison must include the checkerboard light pattern from
ship3d and a small ordered threshold pattern. Compare dark gradients, coloured
lights, moving surfaces, and portal edges. Select the default from those images.

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

A portal connects two openings and defines a rigid translation and rotation.
The reverse connection must apply the inverse transform. The first design does
not add portal scaling or reflection.

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

Resolve parent geometry and portal surfaces together. A nearer opaque object
must hide the portal pixels behind it. A completely hidden portal creates no
child work.

Create a child view only for pixels where the portal wins visibility. Start child
visibility on the destination side of the portal plane. Geometry between the
virtual camera and that plane must not appear through the opening.

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
