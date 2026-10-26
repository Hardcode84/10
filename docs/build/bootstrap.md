# Bootstrap

Crust is a Git submodule in `crust/`. The game repository pins its commit.
Build the Crust seed from source with the host C compiler. A preinstalled Crust
compiler is not required.

## Build the seed

The pinned Crust version supports Linux x86-64. It requires a C99 compiler,
GNU Make, Python 3, and the libffi development headers and library. Its C backend
also requires GCC and GNU binutils.

Run these commands from the game repository root:

```sh
git submodule update --init --recursive
make -C crust all CC=cc
```

Set `CC` to the host C compiler. The result is `crust/build/crust`.
This command builds only the seed. Crust compilation programs prepare their
selected stages. See the [Crust build documentation](../../crust/docs/bootstrap.md).

## Build the game

Add the seed directory to `PATH` and run the application root:

```sh
export PATH="$PWD/crust/build:$PATH"
crust demo.crs levels/radial.crs
```

The demo root builds host and device code, then starts the interactive flight demo.
Run `crust tests.crs` to build and run the tests. It generates palettes in Crust.
The web build also uses Python to run Emscripten. See
[renderer build](../render/rendering.md#build-checks-and-measurement) for LLVM, SPIRV-Tools, SDL3, and
Vulkan requirements, capture commands, and checks.

## Native platform dependencies

The application roots download SDL3 source, check its checksum, and build a static
library under `build/toolchain/`. No system SDL library is required. Install CMake,
curl, tar, sha256sum, and the platform development packages. On Ubuntu 24.04:

```sh
sudo apt-get install cmake curl xz-utils libx11-dev libxext-dev libxrandr-dev \
  libxcursor-dev libxfixes-dev libxi-dev libxss-dev libxtst-dev libxkbcommon-dev \
  libwayland-dev wayland-protocols libdecor-0-dev libegl-dev libdrm-dev libgbm-dev \
  libasound2-dev libpulse-dev libudev-dev
```

The native build enables X11 and Wayland. The web build uses the SDL3 Emscripten
port from the checked toolchain. Both targets use the same input adapter.
SDL event layouts and calls stay in `src/app/`. Gameplay, demo, and viewer code
use application events and window operations. Task synchronization stays in
`src/runtime/platform/`; game tasks do not use SDL synchronization objects.

Each platform owner releases only the SDL subsystems that it initialized. Window
close releases video; input close releases gamepad support. Global SDL shutdown
must occur after all worker threads have joined. It invalidates thread handles,
so it must not run from window close while a scheduler is alive.

## Shared application setup

All application and test roots use Crust's `application_setup` helper.
`tools/build/setup.crs` opens one stage session, selects the host backend,
and imports the ownership package with `application_load`. Rendering roots also
import the shader package. Each setup loads the consumer declarations before
the import. The import binds those declarations to that package's native library.
Loading a library alone does not expose its symbols. Declarations added after
the import are not bound by that import. The focused collision target imports
no shader package.

Component files retain explicit checked sources and native providers. The
ownership stage checks host code before it calls the selected emitter. The
shader stage still produces Vulkan SPIR-V independently of the host backend.
Application arguments pass through after leading build options are consumed.

The default host emitter is the C backend. Select another compatible emitter
with Crust's shared backend option, before application or test arguments:

```sh
crust tests.crs --backend stages/c/package.crs c_backend_build collision
crust labyrinth.crs --backend stages/c/package.crs c_backend_build --build-only
```

Package paths start at the `crust/` package base. Crust also accepts
`--stage-compiler PACKAGE ENTRY TOOLCHAIN` to select how stage packages are
compiled. See the [application build API](../../crust/stages/build/README.md#build-an-application)
for callback and toolchain contracts. Compiler errors stop the root before launch.

## Check the compiler

```sh
crust/build/crust crust/examples/hello/main.crs
crust/build/hello
```

The program must print `Hello, world!` and exit with status zero.

## Commit checks

After building the Crust seed, install the Git hook:

```sh
pre-commit install
pre-commit run --all-files
```

The checks require pre-commit 4 or later. They check whitespace, line endings,
YAML, JSON, TOML, merge conflicts, file names, symbolic links, executable scripts,
large files, and private keys. The local hooks format `.crs` files and reject functions with CCN above 15.
They use the pinned Crust formatter and ownership-aware CCN reader. They do not
build or run the game. Review and stage any files
that a hook changes, then run the checks again.

## Continuous integration

[GitHub Actions](../../.github/workflows/ci.yml) runs on pushes, pull requests,
and manual requests. Pushes to `gh-pages` do not start these checks.
Both Linux jobs check out the pinned submodule and build the seed with the host
C compiler. They do not restore compiled Crust stages or application binaries.

The native job checks the compiler seed, source format, CCN, collision with
sanitizers, generated assets, flight, tether reeling, and labyrinth topology.
It then runs the default test suite with Mesa software Vulkan and builds the
game, demo, and viewer. The default suite includes ownership checks, headless
renderer cases, simulation checks, and viewer checks. The LLVM release and
archive checksum are stored in `.github/toolchains/llvm-release.json`.

The web job runs `crust labyrinth.crs --web` and the Crust WebAssembly C backend
and ABI checks. It uses Bun and the toolchain selected by the application root.
It does not run the browser interaction tests. Those tests require a browser
with WebGPU and a native Vulkan run for replay comparison. The windowed
swapchain test also runs separately from CI.

After both jobs pass on the default branch, CI commits the web game to
`gh-pages`. GitHub Pages publishes that branch. See
[Pages setup](web.md#publish-with-github-pages).

## Develop Crust

Implement required language features and fixes in the submodule. Commit and test
the Crust change, then update the submodule commit in the game repository.
Do not add game code to work around missing language features.

Crust supports Windows hosts. The game build still requires Linux library names
and tool commands. A Windows build needs native library selection, toolchain
fetch rules, and Windows builds of the application platform providers.

## Play the game

Run `crust labyrinth.crs` to build and start the expedition. See
[the expedition guide](../game/expedition.md) for objectives, seeds, and recording.
Use `crust tests.crs game` for the simulation checks.
See [movement](../game/movement.md) for controls and replay
commands. The generated-room flight demo starts with `crust demo.crs levels/radial.crs`. It uses the same
flight, tether, input, and fixed-step loop as the game.
