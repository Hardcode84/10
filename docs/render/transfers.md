# Transfers, diagnostics, and retirement

## Execution modes

Production uses Crust's `SHADER_RAW` execution mode. These shaders bind only
words and floats. They have no invocation-status buffer, status clear, status
reduction, or shader-failure readback. Scene producers must supply valid indices,
finite data, initialized inputs, and valid arithmetic.

Set `RenderConfig.shader_checks` to use checked shaders. The shader modules must
match this setting. The applications select the matching modules:

```sh
crust main.crs --debug-shaders 1
crust demo.crs --debug-shaders 1
```

The default is zero. Demo pixel debugging and fault injection also select checked
shaders. Pixel capture alone does not select checked shaders.

Debug mode keeps the compiler's 8 MiB invocation-status buffer on the device.
After the last rendering pass, 256 workgroups inspect all status entries. Each
group reports its first failed invocation, that status value, failure count, and
combined status bits. The host reads 4 KiB of reports. It returns the same first
failed invocation diagnostic as before. Failures from earlier dispatches remain
set. The report pass uses raw execution and fixed, renderer-owned ranges; it
does not write compiler status into the buffer that it reads.

Task and view capacity exhaustion are runtime resource errors, not shader
assertions. Normal draws read the four-byte capacity result. This result rejects
an incomplete frame before presentation. It does not contain shader diagnostics.
Debug pixel mode also reads the frame header, geometry, visibility, and pixel
records needed by the CPU reference. Captures read image data. Normal window
draws do not read image data.

## Owned ranges and transfers

The renderer owns one device buffer and one staging allocation. Vulkan uses
coherent, cached staging memory. WebGPU uses WebAssembly memory for staging and
explicit upload and readback operations. Both use the same ranges and schedule.
Persistent materials, palette tables, textures, mesh records, and the overlay
font occupy separate ranges from frame inputs and GPU work data. Words and
floats keep the shared offset layout. Staging has no invocation-status range.

A changed asset word expands the pending asset interval. The next successful
draw uploads that interval once. An identical write does not mark it as changed.
Mesh submission marks the retained mesh ranges. Changed instance records mark
the instance ranges. Unchanged assets, meshes, instances, and font data are not
uploaded again. A new device allocation marks its persistent ranges for upload.

Frame transfers contain the header, camera, ambient and camera-light values,
active point lights, dynamic geometry, space triangle groups, portal records, and enabled overlay
cells. The host does not transfer unused header space or the old fixed float
prefix. Image, projection, clipping, and traversal work ranges remain device
outputs. Debug mode can copy selected output ranges back into staging.

The packed staging address space still reserves words and floats at the same
offsets as the device buffer. This permits input borrows and CPU reference reads
to keep one layout. The measured memory figures below include those reserved
ranges; they are not counts of live asset bytes.

## Completion and replacement

The [task graph architecture](../runtime/task-graph.md) defines the replacement
contract for asynchronous frames. The rules below describe the current code.

The public draw call remains synchronous. It returns after its submission fence
signals and the selected readback is available. The `--tasks` experiment uses
`frame_submit` instead. A `SubmittedFrame` retains the exclusive renderer loan
through completion and validation. Its destructor drains accepted work.
CPU simulation and prediction can run while that loan remains active.
The experiment keeps one GPU frame in flight.
Draw can replace storage to increase room projection capacity. Callers must
release input borrows before draw and acquire mapped addresses again after draw.

Each submitted render command buffer owns the device and staging ranges until
its retirement fence signals. Input borrows, storage replacement, and destruction
wait for retirement before they access or release those ranges. The pending flag
is set only after a successful queue submission and cleared only after the fence
signals. Submission failure leaves no pending work.

The split schedule uses `FrameSetup` to retain this loan across shadow setup
and portal rendering. `input_defer` reserves a bounded range before retained
instances are submitted. Reserved slots have the inactive and no-shadow flags.
Their addresses remain fixed when late triangles arrive. Inactive slots are
excluded from projection. Projection storage admits the reservation before the
first submission, so the late write cannot require buffer replacement.
Setup rejects a reservation outside the current dynamic range or a range whose
slots are no longer inactive. Frame input bounds are private to the renderer.

After prediction, `frame_setup_edit` waits for setup retirement and lends a
`DeferredInput`. Its triangle writer is bounded by the reservation. The caller
must write only this range, once, with non-portal, non-shadow-casting triangles.
Scope exit restores the complete scene count. `frame_setup_submit` then uploads
the completed inputs and submits portal rendering. This operation also occurs
once. Dropping either pending operation waits before storage is released.

Both submissions use the same command buffer and staging allocation. Reuse
occurs after setup retirement. The second command buffer recording preserves
the first submission's timestamp queries. The renderer has one frame in flight.

A successful frame can produce a `ValidatedImage`. Presentation holds this
image through a separate `Presentation` loan. Its destructor waits for source
release. Native waits run on a dedicated completion service. Browser operations
use promises and yield to the event loop. Presentation copy completion releases
the offscreen source; it does not report display scanout. Renderer storage cannot
be borrowed, replaced, or destroyed while either checked lease remains live.

Storage replacement allocates the new buffers first. It preserves the old inputs,
updates descriptors, and uploads persistent ranges to the new allocation.
A rejected allocation preserves the old allocation. The memory peak includes
both old and new buffers during replacement. Presentation has its own completion
rules; shutdown also waits for the presentation queue before releasing its
resources.

## Measurements and checks

Run `crust tests.crs render 12`. The benchmark submits the production demo's
retained interior at 320 by 180. It measures 40 unchanged frames after the first
draw. The scene, triangle count, dimensions, and output remain fixed.

The controlled baseline used the former checked production shaders, full status
readback, and unconditional table transfers. On AMD Radeon PRO W7900 Dual Slot:

| Measurement | Baseline | Updated production path |
| --- | ---: | ---: |
| First upload | 609,448 bytes | 577,624 bytes |
| Unchanged-frame upload | 589,992 bytes | 1,496 bytes |
| Normal readback | 8,388,940 bytes | 4 bytes |
| Mean CPU fence/queue wait | 3.23 ms | 1.48 ms |
| Mean GPU timestamp span | 3.07 ms | 1.45 ms |
| Mean draw call | 4.33 ms | 1.50 ms |
| Current buffer allocations | 45,953,024 bytes | 29,175,808 bytes |
| Peak buffer allocations during growth | 91,793,408 bytes | 58,238,976 bytes |

These short runs are cost witnesses, not frame-rate guarantees. Buffer memory
uses Vulkan allocation requirement sizes. It excludes pipelines, swapchain
images, driver allocations, and application-owned memory. GPU time includes
uploads, compute, and selected readback. CPU wait excludes command recording
and host validation.

The same production check on Intel Arc Pro B60 passed, with 1,496 upload bytes,
four readback bytes, 2.31 ms mean CPU wait, and 2.21 ms mean GPU time.
Both devices also passed the checked-shader failure test.

The checks compare the rendered scene with the CPU reference. They replace the
palette three times, verify the new image, and check that a repeated draw has
no asset upload. A rejected asset size must preserve the active image. A
submitted frame remains pending when the renderer owner is dropped, which
checks retirement during shutdown.

The debug fixture causes failures at invocations 0, 17, 63, and the final
invocation across two dispatches. The report must preserve the first failure,
the total count, and all status bits. Other renderer tests retain device-range
rejection, resize, portal-budget exhaustion, and recovery checks.
