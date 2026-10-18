# Image capacity and resize

## Image storage

`RenderConfig` selects internal width and height and output width and height.
All dimensions must be positive. They must fit signed window coordinates and
32-bit buffer addressing. The complete words and floats ranges must each fit
`maxStorageBufferRange`. Vulkan allocation errors stop setup or resize.

The words binding contains an 8,192-word header and overlay region, one word per
internal pixel, one word per output pixel, and four debug words per internal
pixel. Geometry, assets, instances, and traversal storage follow these regions.
The header contains the output, debug, and geometry offsets. Use those offsets;
do not assume a fixed image capacity or geometry start.

Image passes dispatch at most 2,097,152 invocations. Each invocation processes
more pixels at that stride when required. This bound controls dispatch and
invocation-status storage. It does not limit image size. Raster tasks use the
same bounded batches as portal traversal. The root tile count must fit the task
budget. The demo increases its initial task budget for large images.

Composition uses nearest-neighbour sampling. It fits the internal image into
the output with its aspect ratio preserved. It fills unused output pixels with
opaque black. Integer viewport rounding can change an edge by one pixel. A
viewport dimension is at least one pixel. HUD coordinates remain output pixels.
Scaling uses exact integer division, including products that exceed 32 bits.

## Resize API

Call `renderer_set_extent` with a mutable `Renderer` borrow. No `FrameInput`
borrow can remain live during this call. Native providers use `renderer_resize`.
Pass both internal and output dimensions. The renderer preserves scene inputs,
materials, textures, retained meshes, instances, and camera data. It grows the
task capacity when the new root tile count requires more tasks. Portal work can
still exhaust the selected task or view capacity and reject a frame.

Resize is a cold path. The renderer waits for queue completion before resource
replacement. It allocates new image and geometry storage before it releases the
old storage. During replacement, both allocations are resident. Invalid sizes,
device-range rejection, and buffer-allocation failure leave active storage
unchanged. New descriptors and commands use the replacement storage. A failed
command or swapchain operation returns an error; the application closes the
renderer. It must not present an earlier image as a successful new frame.

For a surface, the renderer waits for queue completion, destroys the old
swapchain, and creates a replacement. It retains the acquisition fence and
presentation command buffer. Swapchain image handles use an allocated array.
A surface-size change during creation leaves replacement pending. An out-of-date
acquire or present also requests replacement. Suboptimal presentation completes
and requests replacement for the next draw. No image from a pending replacement
is presented.

The application calls `window_draw` before presentation. This helper reads the
current drawable size and changes output dimensions. Internal resolution stays
at the selected value. A minimized or zero-size drawable suspends draw and
presentation. On restore, the next draw prepares a valid swapchain. Setup and
shutdown also release resources after GPU completion.

The swapchain rules follow the
[Vulkan swapchain creation contract](https://docs.vulkan.org/refpages/latest/refpages/source/VkSwapchainCreateInfoKHR.html).
Destroying the old swapchain before creation makes a creation failure explicit;
it does not claim that a retired swapchain can be restored.

## Checks

```sh
crust tests.crs render 9
crust tests.crs render 10 # requires a Vulkan-capable display
crust tests.crs ownership
crust demo.crs levels/radial.crs --capture build/4k.ppm --width 3840 --height 2160
```

Case 9 keeps the same retained mesh and texture data across landscape, portrait,
4K, one-pixel-wide, and 70,001-pixel-wide internal images. It checks output sizes
independent of the internal size. Geometry and colour checks use the CPU
reference. A separate patterned image checks every output pixel, black bars,
wide-coordinate arithmetic, and writes beyond one dispatch. Invalid dimensions
and a controlled device storage-range rejection must preserve the active
renderer and permit another valid draw. The test does not force physical GPU
memory exhaustion.

Case 10 changes a real SDL window through four extents, including 2,049 by 1,153,
and resizes between draw and present. It also repeats swapchain replacement.
It verifies image output and preservation of
the internal resolution. The ownership suite checks rejection of resize with a
live input borrow.
