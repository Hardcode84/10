# SPINWARD

SPINWARD is a 6DOF exploration game in a megastructure. Fly through a
seeded network of rooms and tunnels, use a launched tether to change course,
reach the ending room, and return to the start. Portal connections can rotate
and translate space; rooms do not need to fit into one global coordinate system.

Host code, GPU code, room geometry, and textures use [Crust](crust/).
The game, demo, and viewer use one bounded tile-list renderer.
The native renderer uses Vulkan compute and SPIR-V. The browser uses WebGPU
compute and WGSL from the same shader sources. Indexed textures, full-bright
texels, and dithered lighting give the game a 1990s appearance.

## Bootstrap

The current build host is **Linux x86-64**. Install these prerequisites:

- A C99 compiler, GCC, GNU Make, GNU binutils, Python 3, and libffi development files.
- CMake, curl, and the [SDL3 build dependencies](docs/build/bootstrap.md#native-platform-dependencies).
- The Vulkan loader and a Vulkan driver for your GPU.
- LLVM with the SPIR-V target, including `bin/llc` and `bin/opt`.
- SPIRV-Tools, including `spirv-val`.

From the repository root, initialize the Crust submodule and build its seed
with the host C compiler:

```sh
git submodule update --init --recursive
make -C crust all CC=cc
export PATH="$PWD/crust/build:$PATH"
```

Set the shader tool paths to your installed tools. For example, if LLVM is in
`$HOME/toolchains/llvm` and `spirv-val` is on `PATH`:

```sh
export LLVM_DIRECTORY="$HOME/toolchains/llvm"
export SPIRV_VAL="$(command -v spirv-val)"
crust main.crs --build-only
crust main.crs
```

Each root builds its host program and required shaders before execution.
Build policy and asset recipes use Crust. The seed bootstrap and the web target's
Emscripten toolchain require Python. See [bootstrap details](docs/build/bootstrap.md) and
[renderer requirements](docs/render/rendering.md#build-checks-and-measurement).

## Run

Run these commands from the repository root:

```sh
# Play a seeded expedition.
crust main.crs --seed 42 --complexity 8

# Use a borderless fullscreen window with a 1024 by 768 internal image.
crust main.crs --fullscreen --width 1024 --height 768

# Fly through the room demo with the game physics and tether.
crust demo.crs levels/radial.crs
crust demo.crs levels/cylinder.crs
crust demo.crs levels/prefabs.crs

# Inspect a generated room recipe.
crust viewer.crs assets/rooms/radial-start.crs

# Build and serve the browser game. Requires Bun; no Node.js or npm.
crust main.crs --web
bun tools/web/serve.mjs
```

See [objectives and generation options](docs/game/expedition.md),
[flight controls](docs/game/movement.md), and
[the asset workflow](docs/content/parametric-assets.md).
See [web build and controls](docs/build/web.md) for browser requirements,
recording exchange, and the focused browser check.

## Repository structure

| Path | Purpose |
| --- | --- |
| `main.crs` | Playable game build and entry point |
| `demo.crs` | Selected level flight demo build and entry point |
| `levels/` | Crust demo level recipes |
| `viewer.crs` | Prefab viewer build and entry point |
| `tests.crs` | Automated test build and runner |
| `src/render/` | Shared renderer, Vulkan and WebGPU providers, and compute shaders |
| `src/collision/` | Collision geometry, queries, and contact solving |
| `src/game/` | Flight, tether, room graph, objectives, input, and HUD |
| `src/demo/` | Room demo and automatic renderer fixtures |
| `src/viewer/` | Prefab viewer |
| `src/assets/` | Parametric geometry, textures, and room assembly |
| `src/app/` | Shared application helpers |
| `assets/rooms/` | Room recipes written as normal Crust source files |
| `tools/build/` | Shared build setup and component source lists |
| `tests/` | Component tests and independent renderer reference |
| `docs/` | Design contracts, build instructions, and component guides |
| `crust/` | Pinned language submodule |
| `build/` | Generated binaries, shaders, captures, and caches; not tracked |

Start with the [documentation index](docs/README.md) and
[rendering design](docs/render/rendering.md).

## Checks

```sh
crust tests.crs collision
crust tests.crs render 11
crust tests.crs hook-light
crust tests.crs
```

The first three commands run focused checks. The last runs the full suite.
See the [component guide](docs/README.md#checks) for other test targets.

For commit checks, install pre-commit 4 or later, then run:

```sh
pre-commit install
pre-commit run --all-files
```

Run `crust main.crs --scaling` for the reciprocal scaling-portal course.
See the [scaling contract](docs/game/scaling-portals.md).
