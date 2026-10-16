# Components

Run each root from the repository directory. Each root builds its own host
program with the Crust ownership stage. Device programs use the shader stage.

| Root | Program |
| --- | --- |
| `crust main.crs` | Play the expedition. Use `--trial` for the flight course. |
| `crust demo.crs` | Fly through the generated room with game controls and linked portals. |
| `crust viewer.crs ROOM.crs` | Build and inspect a Crust room recipe. |
| `crust tests.crs` | Run all automated checks. |

Use `--build-only` to build without execution. The application roots do not
compile or link test fixtures, the CPU reference, or the palette test shader.
The test root builds separate test programs. Tests use the same renderer and
application functions as the applications.

## Source directories

| Directory | Contents |
| --- | --- |
| `src/render/host/` | Renderer resources, uploads, and Vulkan commands |
| `src/render/device/` | Compute shaders |
| `src/render/interface.crs` | Shared host and device data definitions |
| `src/collision/` | Mesh storage, kinematic poses, spatial indices, sphere queries, and contact solving |
| `src/app/` | Shared window, clock, capture, shader, and asset helpers |
| `src/demo/room/` | Flight demo entry, room links, and material setup |
| `src/demo/host/` | Automatic playback fixture used by renderer checks |
| `src/demo/scene/` | Automatic scene fixture used by renderer checks |
| `src/game/flight/` | Movement state, forces, collisions, and tether |
| `src/game/course/` | Movement course and automatic pilot |
| `src/game/expedition/` | Expedition state, layout, rules, and presentation |
| `src/game/content/` | Room definitions, biomes, and generated room content |
| `src/game/view/` | Game geometry submission, HUD, and path markers |
| `src/game/host/` | Game entry, input, options, saves, replay, and session |
| `src/viewer/` | Prefab viewer |
| `src/assets/` | Parametric hull, surface, material, and room bundle operations |
| `assets/rooms/` | Room recipes in normal Crust source files |
| `tools/build/` | Shared application setup, component source lists, and native providers |
| `tests/render/` | Renderer fixtures, CPU reference, and image checks |
| `tests/demo/` | Demo playback checks |
| `tests/collision/` | Mesh sweep fixtures and analytic comparison |
| `tests/game/` | Simulation, save, course, and expedition checks |
| `tests/viewer/` | Viewer instance visibility checks |
| `tests/assets/` | Generated room topology, spawn, and collision checks |
| `tests/ownership/` | Ownership acceptance and rejection cases |

## Documents

- Build: [bootstrap](build/bootstrap.md), [shader compiler](build/crust-spirv.md).
- Render: [design](render/rendering.md), [build and checks](render/renderer-build.md),
  [textures](render/textures.md), [retained meshes](render/retained-meshes.md),
  [portal capacity](render/portal-capacity.md), [image resize](render/images.md).
- Collision: [static meshes](collision/static-meshes.md),
  [spatial index](collision/spatial-index.md), [sphere motion](collision/motion.md),
  [moving meshes and anchors](collision/kinematic-meshes.md).
- Game: [expedition](game/expedition.md), [movement](game/movement.md),
  [flight course](game/flight-course.md).
- Content: [parametric assets](content/parametric-assets.md),
  [room format](content/room-format.md),
  [prefabs](content/prefabs.md), [room catalogue](content/room-catalogue.md),
  [engine gaps](content/engine-gaps.md).

## Checks

```sh
crust tests.crs
crust tests.crs ownership
crust tests.crs portals --width 320 --height 180
crust tests.crs collision
crust tests.crs assets
crust tests.crs asset-viewer
crust tests.crs collision --sanitize
crust tests.crs game
crust tests.crs review --width 320 --height 180
crust tests.crs viewer --width 320 --height 180
crust tests.crs render 8
```

The complete run checks ownership, all nine headless renderer cases, game simulation,
expedition images, and viewer visibility. It uses 320 by 180 pixels for the
expedition and viewer checks. Individual checks accept their image options.

Renderer cases: 1 checks palette and presentation; 2 checks portal images;
3 checks playback; 4 checks lighting; 5 checks geometry capacity; 6 checks
textures; 7 checks retained portal views; 8 checks portal capacity; 9 checks image capacity and resize.
Run case 10 on a display to check window and swapchain resize.
Use case 0 with `--capture FILE --frames N` to compare a custom demo sequence
with the CPU reference.

The test runner preserves the environment. For example, set `VK_DRIVER_FILES`
to select a Vulkan driver. A failed child process makes the test root fail.

The focused collision target includes flight and hook fixtures without game levels.
