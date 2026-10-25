# Room streaming

Status: bounded prototypes. The game currently builds all room assets before play.
Design for the residency part of [W3](engine-gaps.md#w3-asset-residency-and-spatial-precision).
The [portal renderer](../render/rendering.md#portal-views-and-visibility) keeps its visibility rules.

## Persistent data and visibility

Keep room identities, recipe parameters, connections, and game state resident.
Generate convex hulls and portal polygons before detailed geometry. Retain these
small visibility shells when meshes, textures, and collision structures unload.
Rebuilding assets must not reset objects or doors. Share immutable assets by
recipe version, parameters, and material configuration. Keep instance state separate.

Cache potentially visible destination portals per directed entrance portal.
Start at the current room. Visible connections request missing shells, which
permit further visibility work. Assume automatic doors can open; ignore props.

Clip apertures through actual connection transforms. Preserve distinct path
states, including recursive visits to the same room. Merge destination identities
only in the result. Logical global room positions do not determine visibility.

Entries are unknown, partial, or complete. Track all shell and connection version
dependencies, including intermediate shells, with reverse links for invalidation.
Results may include extra portals but must not exclude visible ones. At a work
limit, include all graph-reachable destinations from unresolved branches. This
bounds work on recursive connections without treating unfinished work as invisible.

## Loading waves

Wave zero contains rooms potentially visible from anywhere in the current room.
Each subsequent wave expands visibility from the directed entrances reached by
the previous wave, permitting a new sightline. Use minimum wave distance per room.
Renderer traversal preserves its original sightline and exact masks.

Request assets within X waves. Retain them through Y waves, with Y greater than
X, plus a short interval after use. Waves do not bound bytes or arrival time.
Prioritize admission dependencies first, then predicted arrival urgency, wave
distance, and stable room ID. Compare urgency with high-percentile build and
upload latency. Apply memory and upload budgets to all requests.

Wave requests are speculative. Frame admission requires conservative current-view
portal traversal under renderer limits, plus simulation, light, shadow, and audio
dependencies. Resolve missing shells before declaring that traversal complete.
Renderer limits must not remove physics dependencies. Preload behind doors before
opening them. Incomplete wave results cannot prove a room safe to evict.
Prefetch retention is soft under memory pressure; admission and in-flight
references are hard requirements.

## Tasks and lifetime

Shell generation, visibility, asset construction, and upload are separate tasks.
GPU completion releases dependencies without occupying a worker. Publish ready
handles through immutable scene snapshots. Reject stale results by identity and
version. Release storage only after CPU readers and GPU submissions finish.

Prediction jobs pin their input snapshot. On missing collision, return an explicit
unresolved frontier and request assets. Never publish that forecast as complete.
Active bodies and attachments retain collision for their next step. Persist
inactive object state; time-driven controllers preserve their simulation-time
reference across unloading.

If admission resources are missing, pause frame admission and simulation time
with loading status. Never display missing geometry or simulate through absent
collision. Resume with a complete snapshot. A capacity failure leaves the
published snapshot intact and ends that request with an explicit error.

## GPU arenas

Use fixed-size bump arenas. Add an arena when the budget permits; split large
meshes into chunks. Handles contain an arena generation and offset. Separate
shared long-lived assets, streamed geometry, and transient frame data.

Keep allocation occupancy separate from the active-mesh bitmap. The bitmap marks
assets used by a scene snapshot; instance records select placements. Inactive
allocations may remain cached. Reset an empty arena only after all CPU and GPU
references retire. Never modify submitted bitmaps or descriptor tables in place.

Use partial uploads and bounded buffer bindings on Vulkan and WebGPU. Group work
by bound arenas. Resolve every arena contribution to a view before emitting child
portal masks. Preserve depth and source-ID tie rules. Game code sees resource
handles; platform bindings and completion objects remain private.

Reclaim unreferenced cache allocations, preferring whole arenas. Never evict pins
held by jobs, physics, or GPU work. Before reporting failure, measure live bytes,
trapped space, largest contiguous extent, and requested capacity. Distinguish
conservative over-inclusion from live-byte exhaustion. Never retry indefinitely.
Relocation requires reserved copy space, new handle publication, and retirement
of old storage. Measure fragmentation before adding that mechanism.

## Implementation gate

Prove load, traversal, unload, and revisit with the production renderer, collision,
active hook, and asynchronous prediction. Compare images and motion against full
residency. Exercise long shafts, doors, branches, transformed cycles, exhausted
budgets, and stale completions. Require no missing geometry or invalid references.

Measure worst-frame CPU work, loading latency, uploads, live and trapped bytes,
and admission pauses. Check that steady frames allocate no application storage.
Set numerical budgets from this baseline before extending the implementation.

The [visibility experiment](streaming-experiment.md) measures selection, loading
waves, retained-list replacement, and rendered output on production scenes. It
includes a fixed-arena reuse witness with partial uploads and exact restored
images. Room collision chunks also pass a retained-snapshot lifetime witness.
Collision snapshots can select required rooms. Incomplete prediction returns the
missing room and suppresses output. A worker can regenerate an unchanged room
while preserving collider IDs, then publish it for prediction and rendering.
Course assembly records each builder and its parameter values, appended parts,
and material edits. The same inputs regenerate the service network and shaft
region exactly. See the [recipe checks](streaming-experiment.md#recorded-room-recipes).
The full integrated ownership gate remains open: versioned publication,
active-frame admission, and residency budgets must work together before normal
play can unload rooms.
