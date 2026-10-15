# Components

Run each root from the repository directory. Each root builds its own host
program with the Crust ownership stage. Device programs use the shader stage.

| Root | Program |
| --- | --- |
| `crust main.crs` | Play the expedition. Use `--trial` for the flight course. |
| `crust demo.crs` | Run the automatic rendering demo. |
| `crust viewer.crs` | Inspect generated meshes. |
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
| `src/collision/` | Static mesh storage, spatial indices, adjacency, and continuous sphere queries |
| `src/app/` | Shared window, clock, capture, shader, and asset helpers |
| `src/demo/host/` | Demo options, playback, session, and main loop |
| `src/demo/scene/` | Demo geometry, camera route, and textures |
| `src/game/flight/` | Movement state, forces, collisions, and tether |
| `src/game/course/` | Movement course and automatic pilot |
| `src/game/expedition/` | Expedition state, layout, rules, and presentation |
| `src/game/content/` | Room definitions, biomes, and generated room content |
| `src/game/view/` | Game geometry submission, HUD, and path markers |
| `src/game/host/` | Game entry, input, options, saves, replay, and session |
| `src/viewer/` | Prefab viewer |
| `tools/build/` | Component source lists, native providers, and build functions |
| `tests/render/` | Renderer fixtures, CPU reference, and image checks |
| `tests/demo/` | Demo playback checks |
| `tests/collision/` | Mesh sweep fixtures and analytic comparison |
| `tests/game/` | Simulation, save, course, and expedition checks |
| `tests/viewer/` | Viewer instance visibility checks |
| `tests/ownership/` | Ownership acceptance and rejection cases |

## Documents

- Build: [bootstrap](build/bootstrap.md), [shader compiler](build/crust-spirv.md).
- Render: [design](render/rendering.md), [build and checks](render/renderer-build.md),
  [textures](render/textures.md), [retained meshes](render/retained-meshes.md),
  [portal capacity](render/portal-capacity.md), [image resize](render/images.md).
- Collision: [static meshes](collision/static-meshes.md),
  [spatial index](collision/spatial-index.md).
- Game: [expedition](game/expedition.md), [movement](game/movement.md),
  [flight course](game/flight-course.md).
- Content: [parametric assets](content/parametric-assets.md),
  [prefabs](content/prefabs.md), [room catalogue](content/room-catalogue.md),
  [engine gaps](content/engine-gaps.md).

## Checks

```sh
crust tests.crs
crust tests.crs ownership
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
