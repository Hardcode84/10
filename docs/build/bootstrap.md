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
crust demo.crs
```

The demo root builds host and device code, then starts the automatic demo.
Run `crust tests.crs` to build and run the tests. It generates palettes in Crust. Python is not part of the application
build. See [renderer build](../render/renderer-build.md) for LLVM, SPIRV-Tools, SDL2, and
Vulkan requirements, capture commands, and checks.

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
crust main.crs --backend stages/c/package.crs c_backend_build --build-only
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

## Develop Crust

Implement required language features and fixes in the submodule. Commit and test
the Crust change, then update the submodule commit in the game repository.
Do not add game code to work around missing language features.

Windows host support requires a Crust platform profile, Windows implementations
of its host operations and native ABI bridge, and support in its build stages.
Implement these changes in Crust before using Windows as a build host.

## Play the game

Run `crust main.crs` to build and start the expedition. See
[the expedition guide](../game/expedition.md) for objectives, seeds, and recording.
Use `crust main.crs --trial` for the movement course and `crust tests.crs game`
for all simulation checks. See [movement](../game/movement.md) for controls and replay
commands. The generated-room flight demo starts with `crust demo.crs`. It uses the same
flight, tether, input, and fixed-step loop as the game.
