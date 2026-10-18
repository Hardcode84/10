# Compute renderer and flight demo

This page describes the native Vulkan provider and shared renderer contract.
The [web game](../build/web.md) uses the same layout, schedule, and Crust shader
sources with a WebGPU provider. `RenderState` holds shared state;
`RenderBackend` holds provider resources. Applications select providers at build
time. The demo and viewer use Vulkan.

## Build and run

Build the Crust seed as described in [bootstrap](../build/bootstrap.md). Add
`crust/build` to `PATH`.

`crust demo.crs levels/radial.crs` starts interactive flight in the generated room. It uses the
game input, physics, tether, and host loop. See the [flight controls](../game/movement.md#generated-room-flight-demo).
The root builds the ownership-checked host and compute shaders. It does not
build test fixtures or the CPU reference. Crust generates geometry, textures,
and palettes.

The build requires GCC, GNU binutils, SDL2, the Vulkan loader, LLVM with the
SPIR-V target, and SPIRV-Tools. Set `LLVM_DIRECTORY` and `SPIRV_VAL`, or put
links at `build/toolchain/llvm` and `build/toolchain/spirv-val`. Missing tools
stop the build with a diagnostic.

```sh
crust demo.crs levels/radial.crs --build-only
crust demo.crs levels/radial.crs --width 1280 --height 960
crust demo.crs levels/radial.crs --capture build/room.ppm --width 960 --height 540
```

Capture mode runs one simulation tick by default. Use `--ticks N` to change
the count. Use a recording to repeat player input. `build/spinward --help`
lists controls and options. Esc closes the window; Tab pauses or resumes.

## Automatic renderer fixture

The former automatic demo remains a renderer test fixture. It includes a
loading bay, machinery gallery, and outdoor yard. Translated and rotated
portals have reverse links. Metal pipes use full-bright cyan strips. The
camera follows a 1,200-frame route. Frame 0 shows the bay, frame 240 shows
the gallery, frame 360 shows the yard, and frame 600 looks back at the buildings.
Each bend aims four longitudinal units ahead to keep the view continuous.
Test 2 retains the original smaller portal and cutout scene.

Run the fixture and CPU reference through the test root:

```sh
crust tests.crs render 0 --capture build/outdoor.ppm --frame 360 --width 1920 --height 1080
```

The frame number determines the camera and moving object positions. Capture
writes the last frame as binary RGB PPM. `--frames N` sets the frame count.
These fixture options do not apply to the interactive flight demo:

| Option | Behaviour |
| --- | --- |
| `--dither 0` or `1` | 16 by 16 light-grid checker or Bayer-weighted corner selection; checker is the default |
| `--mapping 0`, `1`, or `2` | Perspective, affine, or short-span UV correction |
| `--snap 0` or `1` | Disable or enable projected vertex snapping |
| `--width`, `--height` | Internal image dimensions |
| `--window-width`, `--window-height` | Window or capture output dimensions |
| `--frame N` | Initial frame number |
| `--debug-pixels 1` | Read pixel diagnostics from the renderer |
| `--baseline 1` | Scan all projected slots instead of the compact list |
| `--view-budget N` | Select total path-view capacity, including the root |
| `--fault 1` | Inject a shader failure for an error-path test |


CPU reference checks require perspective mapping with vertex snapping disabled.

## Core and demo

The source has three parts:

| Path | Responsibility |
| --- | --- |
| `src/render/` | Shared input layout, Vulkan resources, compute passes, readback, and presentation |
| `src/game/` | Shared flight, input, game loop, and scene submission |
| `src/demo/room/` | Flight demo entry, room links, and material setup |
| `src/demo/host/`, `src/demo/scene/` | Automatic renderer fixture and capture helpers |
| `tests/` | Palette patterns, CPU reference, input tests, and frame-specific scene checks |

The root build checks the core sources without demo or test sources before it
builds the application. The core has no SDL dependency and takes no animation
frame index. It does not generate scene geometry or palette data. Its capacity
constants define the supported buffer layout, not a scene.

The checked API uses a `Renderer` resource. `renderer_new` creates an empty
owner. Its drop operation releases Vulkan resources, including after partial
setup failure. A renderer cannot be copied.

The native setup provider calls `instance_open` with the required
instance extensions. For a window, the caller creates a Vulkan surface and gives
ownership of that surface to the renderer. The demo uses SDL for this step.
`renderer_open` takes a `RenderConfig` and eleven `ShaderCode` byte ranges, in
init, transform, raster, advance, compose, compact, scan, fill, instance
expansion, instance visibility, and tile-binning order. Checked rendering also
requires the status shader as the last range. The
shader bytes remain owned by the caller and can be released after this call.
The core does not choose shader file paths.

After successful setup, checked scene code calls `renderer_inputs` to borrow a
`FrameInput` from the renderer. Word and float accessors check buffer bounds.
The borrow prevents renderer destruction or conflicting access until its last
use. The scene code uses `src/render/interface.crs` to select input fields. These inputs include the camera,
root space, crossing limit, triangles, portals, textures, light tables, and
material styles. Word `BACKGROUND` holds the RGBA background colour. Floats
`RENDER_STYLE` through `RENDER_STYLE + 3` hold the positive geometry near distance,
minimum light level, initial light level, and non-negative distance attenuation.
Light levels must stay in the table range, zero through 63. Use the resize API to change image dimensions. Shader-check mode stays fixed
for the lifetime of the renderer.

`renderer_draw` completes upload, compute, selected readback, and capacity checks.
Shader-failure checks run only in debug mode. On
success, the caller can use the output pixels or call `present` for its surface.
`queries_read` returns `RenderState.query_count` GPU timestamps into caller-provided
storage. The count follows the configured crossing limit; the caller chooses
how to report them.
The renderer drop operation calls `device_close`. The demo session owns its
window and renderer in that field order. Crust drops these fields in reverse
order, so Vulkan resources are released before the SDL window. The checked
demo loop owns the session and releases it on success or an error return.
The demo owns event processing and application timing.

See [retained meshes and the viewer](retained-meshes.md) for mesh ownership,
instance submission, per-view culling, and shared game assets.

See [portal capacity](portal-capacity.md) for runtime view and task budgets,
terminal depth, and the `crust tests.crs render 8` capacity checks.

## Demo lighting

The lit tour uses seven point lights in space-local coordinates and a camera
light. The seven point lights affect only their own space. The camera light
uses the camera position transformed through each visible portal path. Thus,
it illuminates nearby surfaces on both sides of a doorway. The GPU computes
each visible point and triangle normal in that space. Surfaces are two-sided:
the normal faces the viewer, and light from behind that face contributes zero.
Point lights use `sqrt(max(0, cos(theta))) / (1 + d/R)^2`. The camera lamp
uses the same distance falloff with the Lambert angle term. Here `d` is
distance and `R` is the falloff radius. There is no minimum angular contribution.
Point lights use GPU spatial trees for shadow visibility. See
[light visibility](lighting.md). Material emission makes lamp surfaces visible
without nearby lights.

For each light, the largest RGB component sets its peak intensity. Multiply
the light weight by that intensity and by seven. Round down to an integer
from zero through seven before adding the light to the result. Preserve the
light colour by scaling all channels by the same amount. Values below one
contribute exactly zero; weak lights cannot add up to a faint background.

Lighting uses a 16 by 16 grid in internal screen coordinates. Each node is
at the centre of the pixel whose coordinates are multiples of 16. For each
visible triangle, intersect its plane with the selected node ray. The sample
can be outside the triangle; it never reads another surface's lighting.
A parallel ray or an intersection behind the camera contributes only ambient
light and material emission. Texture sampling, depth, and coverage remain
per-pixel.

The default checker selects left or right nodes from pixel parity and top or
bottom nodes from row parity, as in ship3d. Each cell repeats a 2 by 2 pattern
made from its four corner samples. Mode 1 uses a 4 by 4 Bayer threshold to
select corners with bilinear weights. Both modes quantize light at the nodes
before selecting a sample. There is no per-pixel brightness-transition ramp.
Grid coordinates are shared across portal views and do not restart at edges.
Black samples remain black; only cells next to a lit node can mix light and
black. Full-bright entries keep the same colour at every node.

The two interior spaces have zero ambient light. Fixed interior lamps use a
squared falloff radius of 6.25; the moving lamp uses 3.125. Outdoor ambient RGB
intensity is (0.55, 0.55, 0.60). The camera light has a squared falloff radius
of 36 and RGB intensity (1, 1, 1). It follows the camera in all spaces and has
no beam cone. These radii compensate for the faster decay of the new curve.

The demo assets use 8 by 8 indexed textures. The renderer accepts arbitrary
positive dimensions and a 256-entry palette. The GPU
selects one of 512 RGB light states: eight levels for each channel. After the
lights are added, each channel rounds to its nearest level. The material table
combines these states with its base colours. The output has no frame palette
limit.

`palette_entry` takes a full-bright flag for each source palette entry. It
stores the full colour in all 512 light states when the flag is set. The pipe
materials mark their fourth colour as full-bright cyan. The other entries use normal
lighting. The strips do not create point lights or light nearby surfaces.
No palette index range is reserved by the rendering core.
Each shared palette contains 256 by 512 packed colours (512 KiB). The root
creates this table in Crust. Distance shading uses states zero through 63 of
each entry. Coloured lighting uses all 512 states.

`LIGHT_MODEL` selects distance shading (0) or coloured point lighting (1). The
regression scene uses distance shading. `LIGHT_COUNT` gives the active count,
from zero through eight. Each eight-float `LIGHT_DATA` record contains position
XYZ, positive radius squared, non-negative RGB intensity, and an integer space
index stored as a float. Space indices are from zero through 31.

`CAMERA_LIGHT` contains four floats: non-negative radius squared and
non-negative RGB intensity. A zero radius disables this light. It uses the
same attenuation and incidence rule as point lights. Each portal view has
its own transformed camera position; no extra point-light records are needed.

`SPACE_LIGHT` has one four-float record per space; its first three values give
non-negative ambient RGB intensity. A material can select unlit shading.
Material descriptors, texture regions, and shared palettes occupy dynamic asset
storage. The demo owns their generation. See the [texture interface](textures.md).

## Frame contract

The CPU generates scene inputs, records commands, and presents or saves output.
GPU compute performs transforms, clipping, coverage, depth, portal traversal,
texture lookup, lighting, dithering, and image scaling. There are no graphics
pipelines. SDL2 creates the window and Vulkan surface only.

1. Upload frame inputs and changed persistent ranges. Clear invocation status
   only in checked-shader mode.
2. Initialize root view tasks and the background image.
3. For each configured view depth, transform and clip geometry. Compact valid
   projected triangles with one workgroup per view. Each lane counts and
   writes a contiguous range. Prefix counts preserve triangle order. Build a
   candidate bitset for each tile, then scan only its set bits per pixel.
   Reject candidates outside the tile. Resolve depth and cutouts before selecting portal pixels.
   Sample opaque materials only after the depth winner is known. A continuing
   portal passes its pixels to its child view without shading them first.
   Shade portal surfaces at the crossing limit. Store only nonempty portal
   masks, with one lane per distinct portal in the tile.
4. Count child tasks and view keys in workgroups. Scan the group summaries and
   check capacities before filling child tasks. Write indirect dispatch counts
   on the GPU. A hidden portal creates no child task.
5. Pack output colours and scale by nearest-neighbour sampling. Copy output to a
   swapchain image or the capture buffer.

A task owns one view and one 8 by 8 tile. Two 32-bit words give its exact pixel
mask. Child masks select only pixels where that portal won depth. Separate
portal paths retain separate camera transforms, even when they reach the same
space. Each child view has a destination clip plane. At the crossing limit,
portal pixels receive a terminal material at the portal surface.

Checked shader entries preserve invocation failures across ordered dispatches.
Debug mode reads their reduced status after the frame. Production shaders have
no invocation status. Task or view exhaustion rejects the frame before
presentation or capture in both modes. The host does not read visibility or task counts to
control rendering. Compute, indirect-command, transfer, and host accesses have
explicit memory dependencies. The current demo uses one queue and one frame
in flight.

The host and shaders compile the same [buffer constants](../../src/render/interface.crs).
The interface uses four-byte words and floats, not host record layout. There
are two production storage bindings: words and floats, each with a count header.
Checked shaders add an 8 MiB invocation-status binding on the device. Staging
does not contain invocation status. The [transfer contract](transfers.md) defines
persistent ranges, frame transfers, debug reports, and retirement fences. Image ranges use the configured
dimensions; geometry metadata, projected vertices, clipping scratch, and compact indices
follow the checked layout in `src/render/host/geometry.crs`.

Projection capacity is separate from scene capacity. The host groups submitted
triangles by space, in submission order within each space. Space identifiers can
be any `u32` value. Each view selects the group for its space. Projection,
clipping, compact indices, and tile bits reserve the largest submitted space
per view, not the complete level per view. Source geometry and shadow data keep
global triangle indices. This preserves material lookup and depth tie order.
An empty space has no projected triangles.

Storage grows geometrically on submission, up to the physical device range
limit. If geometric growth would exceed that limit, allocate the requested
size. Each words or floats binding starts with its payload element count.
Offsets and descriptor ranges include that header. The host preserves scene
inputs across growth, updates descriptors, and records commands again. The
submission fence guarantees that no rendering work uses the old buffer during
replacement. Reserve calls can fail due to device limits, allocation, or Vulkan
command errors. Replacement waits for pending rendering work to retire.
Draw can also replace storage when a space needs more projection capacity.
No input borrow or mapped address can remain in use across these calls.

Staging memory must be host-visible, coherent, and cached. Device creation reports an error if the profile cannot
be met. The Vulkan owner releases buffers, memory, pipelines, queries, commands,
surface, and instance on normal exit and setup failure. The demo releases its
SDL window after the Vulkan owner is closed.

## Bounds and trust

The demo accepts positive internal and output dimensions that fit the device
storage range and available memory. See [image capacity and resize](images.md).
The scene
has no fixed source-triangle or tile-candidate limit. Device storage range and
available memory bound geometry size. It allows 32 views, four portal definitions,
and at least 32,768 tile tasks per depth. Larger images increase this demo
budget to fit the root tiles. Clipping reserves eight
fan triangles per source triangle. Three portal crossings follow the root view.
Capacity errors reject the frame; geometry and child work are not silently
truncated. The frame count must be from 1 through 4,096.

Source indices select discrete material light-table colours. Dither phase uses
internal screen coordinates across all views. Final output is RGBA or BGRA;
it has no 256-colour restriction. The palette test produces 3,235 RGB colours.

Command-line values, tool results, Vulkan capabilities, file reads, and
allocation results are checked at their external boundaries. Scene arrays and
shader files are private products of this root build. There is no external
asset parser. Add such a parser with input validation before accepting untrusted
scene data.

Scene generation and the frame passes are hot paths. Shader compilation,
interface checks, and pipeline creation are cold paths. CPU reference rendering is a test
helper. It is not a runtime fallback.

The root selects native providers explicitly in `tools/build/demo.crs` and `tools/build/render.crs`. These
providers contain Vulkan and SDL calls, file access, and mapped memory access.
The test root selects its test adapters in `tools/build/tests.crs`. Their raw pointer operations are trusted, not verified by the
ownership checker. Opaque types hide their fields from checked callers.
`src/demo/host/entry.crs` handles the native command-line ABI. The demo loop, scene
generation, configuration, and playback state machine are checked code.

## Checks and measurement

```sh
crust tests.crs ownership
crust tests.crs render 1
crust tests.crs render 2
crust tests.crs render 3
crust tests.crs render 4
crust tests.crs render 4 --dither 0
crust tests.crs render 9
crust tests.crs render 10 # requires a display
crust tests.crs render 11 # light capacity and geometry visibility
crust tests.crs render 12 # transfers, diagnostics and retirement
crust tests.crs render 0 --capture build/native.ppm --width 1920 --height 1080 --frames 601
crust tests.crs render 0 --capture build/baseline.ppm --width 1920 --height 1080 --frames 601 --baseline 1
cmp build/native.ppm build/baseline.ppm
```

The ownership tests check the production renderer API without GPU execution.
One valid borrow-and-move case must pass. Six invalid cases must produce their
expected ownership diagnostics: resource copy, use after drop, drop with a live
input borrow, escaping borrow, shared write, and private field access.

The lit-tour test checks 50 states against the independent ray-triangle and
point-light reference. It covers both directions at both openings and the
moving lamp. Its entrance check requires visible pixels from both rooms,
no yard pixels, and exactly two views. This checks the wall that hides the exit
and rejects reverse-aperture recursion. One state disables all point lights
and the camera light. It requires both cyan strips and black metal on visible
pipe surfaces. A separate state enables only the camera light and requires lit
ordinary surfaces in both rooms across the portal. A flat-surface fixture
requires lit grid samples and a black outer region. In checker mode, it also
checks the repeated 2 by 2 pattern inside each 16 by 16 cell and requires
different neighbouring samples. Coarse sampling can skip narrow light bands.
Run it with both dither patterns.
The test includes frames 229 through 231 and 316 through 318. Two more states
check that the camera faces into each turn.

The playback test sends SDL events through the window input path. It checks
pause, resume, both step directions, held-key repeats, frame zero, quit while
paused, and Escape during playback and while paused. It does not need a display
or a GPU.

The palette test checks 465,366 source pixels exactly across two patterns,
multiple workgroups, and dimensions that do not divide by eight. It checks
nearest-neighbour scaling and RGBA/BGRA channel order for every output pixel.

The scene test checks 25 camera and object states at 320 by 180 against an
independent ray-triangle reference. It includes translated and rotated views of the same
space, destination clipping, cutouts, portal recursion, and complete portal
occlusion. Frames 281 through 286 and 500 through 506 check both directions of
camera crossing. Portal intersections in front of the eye remain visible inside
the geometry near distance. This prevents the blank image previously seen at
frame 284. Frame 512 checks an internal edge between clipped fan triangles that
previously exposed another cube face. Clipping computes shared intersections
from the inside endpoint first, regardless of edge direction. The light-grid
fixture checks every pixel across a clipped two-triangle surface, including
the shared seam. Shared raster edges use one arithmetic order
for both directions.

Frame 523 also checks that the crossing cube's front face is visible at an
interior pixel. At this frame, the face is about 0.0008 units past the portal.
The destination clip plane must use the portal boundary without an offset.
An offset of 0.001 units removed this face and exposed the inside of the cube.
The test also checks that each destination plane contains the transformed
aperture vertices. The recursive portal maps outdoor Z = 18 to room Z = -8.
Its destination plane includes the room interior. An exit at room Z = 9 cut
through the moving cube and made its back face appear between frames 367 and
368. Both frames are part of the scene test.
The reference evaluates the clip plane from triangle vertex distances and ray
intersection weights. This includes surfaces exactly on the plane without
rounding a reconstructed hit point to the wrong side.

The reference excludes the outer pixel border and independently calculated exact
triangle edges. Its one-pixel geometry-edge band uses changes in the reference
triangle ID between adjacent pixels. Non-exact pixels in this band are counted
and reported. Internal fan edges retain the source triangle ID and are not
excluded by this band. The reference permits
adjacent palette entries only at calculated texture boundaries. For point
lighting, it also permits light states within an intensity interval of one
millionth on each side of a calculated dither threshold. It reports each such
case. A native-resolution check found a one-step Float32 difference at one
threshold; it did not indicate a geometry or light-position error. Other pixels
must match within three channel units, with a one-pixel coverage tolerance.
These rules do not establish bit-identical floating-point rasterization across
drivers. Check the complete lit tour with:

```sh
crust tests.crs render 0 --capture build/return.ppm --width 640 --height 360 --frames 1200
```

The build validates every module for Vulkan 1.2. Vulkan ABI checks cover 53
records and 1,177 layout and constant values. Palette and scene tests passed on
AMD Radeon PRO W7900 Dual Slot and Intel Arc Pro B60 with Mesa 25.2.8 on Linux.
The scene test also passed Vulkan synchronization validation on AMD.

Frame reports exclude the first frame. CPU p50 and p99 include scene preparation,
submission, GPU completion, and error readback. Capture runs also include image
readback. They exclude startup, file writes, reference tests, and presentation
waits. GPU timestamps show the last frame's pass intervals. Run baseline and
normal modes in alternating order on an otherwise idle GPU; compare captures
before interpreting timings. The baseline keeps the same pass graph and only
changes the candidate input scan.

The first Intel native-resolution run exceeded the frame target. GPU timestamps
identified the raster pass. Its loop sampled each nearer opaque candidate before
the final depth winner was known. One lane also built all four child masks in
sequence. Deferred opaque sampling and separate mask lanes reduced these costs.
The final fixed-camera output remained byte-identical. Cutout samples still
precede depth selection, so transparent texels cannot hide a portal.

Before the lit tour was added, repeated 601-frame capture runs of the original
scene at 1920 by 1080 produced these
steady-frame results. The first frame was excluded. Both devices used Mesa
25.2.8. These results apply to this bounded scene and build, not larger worlds.

| Device | p50, ms | p99, ms | Baseline p99, ms |
| --- | --- | --- | --- |
| Radeon PRO W7900 Dual Slot | 4.15–4.21 | 4.90–5.65 | 5.87 |
| Arc Pro B60 | 8.77 | 12.36–12.40 | 14.74 |

Normal and baseline captures were byte-identical on each device. The final
opaque-sampling and mask changes also preserved the earlier capture bytes.
At 640 by 360, the same 601-frame sequence measured p50/p99 of 3.73/5.86 ms on
AMD and 4.75/5.16 ms on Intel.

Before the interior extension, the lit tour passed 37 reference states with
each dither pattern on AMD and Intel. Native 1920 by 1080 reference captures
also passed on both devices.
Both devices completed the full 1,200-frame route. At 640 by 360, these
capture runs measured p50/p99 of 4.40/6.59 ms on AMD and 5.02/5.98 ms on Intel.
Six captures, including portal crossing states, matched the full triangle-scan
baseline byte for byte. These measurements include image readback and exclude
display pacing.

The extended interior passed 38 reference states with each dither pattern on
AMD and Intel. These include the hidden exit and full-bright pipe checks.
The 25-state portal regression also passed on AMD. The full 1,200-frame route
at 640 by 360 completed on AMD with p50/p99 of 4.92/5.83 ms, including readback.

## Platform and expansion gates

The 16 by 16 light-grid tour passed all 48 reference states on AMD and Intel
with both corner-selection patterns. The 25-state portal regression and the
exact palette gate passed. A 1920 by 1080 reference capture at frame 230 passed
on AMD. The 1,200-frame route at 640 by 360 measured p50/p99 of 4.94/5.77 ms
on AMD, including readback.

Before grid sampling, the banded-light tour passed all 48 reference states with both dither patterns
on AMD and Intel. The full 1,200-frame route at 640 by 360 completed on AMD
with p50/p99 of 4.30/5.69 ms, including readback. The flat-surface test checks
the visible light bands and black cutoff. The full-bright and camera-light
tests also passed.

The current host uses the Linux x86-64 ABI. Windows needs the Crust host platform
profile described in [bootstrap](../build/bootstrap.md), plus host bindings and build
linkage for that ABI. No Windows or NVIDIA execution result is available.
The device profile requires Vulkan 1.2, `shaderInt8`, the documented Float32
controls, three storage bindings, and 2 KiB of workgroup storage. Shader code
uses no subgroup-size assumption or floating-point atomic operation.

Single-frame Wayland presentation passed on AMD and Intel. The Intel run also
passed synchronization validation. Continuous presentation could
not be checked while the desktop session was locked: Mesa waited in
`vkQueuePresentKHR` for a Wayland frame callback. Repeat the window run in an
unlocked session before accepting continuous presentation. The window has a
fixed extent; unsupported formats, extents, or swapchain operations report an
error.

The bounded scene proves the host-to-device-to-image path. It does not establish
the large-scene or playable-game gates in [rendering](rendering.md). Larger worlds
increase the candidate scan cost. Measure a spatial hierarchy against the
complete scan before adopting it. Extend the reference scenes with that change. Use the game's prototype
gates before adding final assets or gameplay systems.

The lit-tour reference test also checks vertical fields of view of 70 and
110 degrees. Shared application helpers now reside in `src/app/`. The game
uses those helpers and the rendering core without importing demo code.

The palette gate also checks text overlay scales of one and two in both RGBA
and BGRA output. It checks scaled glyph pixels, transparent cells, and bounds.

The geometry capacity gate is `crust tests.crs render 5`. It checks growth,
reuse after scene shrink, empty scenes, clipping, cutouts, equal-depth ties,
and 4,097 overlapping source triangles against the CPU reference. It also
checks rejection at the device storage boundary without changing live buffers.

Run `crust tests.crs render 6` for texture dimensions, atlas regions, palette
sharing, addressing, and vertex UV checks. The test also grows asset storage
after geometry submission and checks storage reuse with smaller textures.

The [lighting contract](lighting.md) defines point-light visibility, growable
light storage, and the surface response checks.

## Graph frame benchmark

Run the production graph scene without a window:

```sh
crust tests.crs benchmark 3840 2160 --seed 1 --complexity 3
crust tests.crs benchmark 1920 1080 --seed 42 --complexity 8 --width 1920 --height 1080
```

The first two numbers select output size. The game options select internal
resolution and graph generation. The first command uses the default 960 by
540 internal resolution. It measures 4K composition, but not window
presentation or the display compositor.

The benchmark samples 12 rooms at fixed portal-facing camera positions.
Each position has four warm-up frames and eight measured frames. It reports
mean and maximum CPU frame time, GPU pass intervals, and an image hash.
CPU frame time includes scene submission and the GPU wait. Image readback
and hashing run separately after each measured group. The benchmark does
not run an automatic playthrough.

On Intel Arc Pro B60, seed 1 and complexity 3 with 4K output, the original
renderer took 28.0 to 46.5 ms per position on average. Parallel compaction,
packed child masks, parallel view-key reduction, and deferred portal shading
plus tile filtering reduced this range to 5.8 to 7.2 ms. The largest measured
frame was 9.3 ms.
The scene, crossing limit, and resolution were unchanged. All 12 image hashes
matched the original renderer on both Intel and AMD.

At native 1920 by 1080, seed 42 and complexity 8, the largest measured
Intel frame before tile filtering was 19.5 ms. Room 60 spent 13.4 ms in raster
passes. Tile filtering reduced the largest measured frame to 14.6 ms.
All 12 AMD image hashes still matched the original renderer. Tile filtering
keeps source geometry, draw order, masks, and the crossing limit unchanged.

Each task stores one bit per possible projected triangle. The allocation
uses `4 * task_capacity * ceil(projection_capacity * MAX_FAN / 32)` bytes.
It grows with the frame buffers and uses the same checked device-storage
limit. The bin pass writes only the words required by the active compact list.
This storage is also present in the host staging allocation; it is not copied
between host and device. The benchmark reports both allocations and the
tile-bit range. The default graph used 31.9 MiB for tile bits in each allocation.
The native-1080p, complexity-8 graph used 126.6 MiB in each allocation.
