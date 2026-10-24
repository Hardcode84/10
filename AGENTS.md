# SPINWARD

A 6DOF exploration game in a megastructure.

## Design and language

- Read the [game design](../SPINWARD.md) and [rendering design](docs/render/rendering.md).
- Use the [room catalogue](docs/content/room-catalogue.md) for biomes and room content.
- Follow the [parametric asset design](docs/content/parametric-assets.md) for generated
  models, textures, and the prefab viewer. Track its [engine gaps](docs/content/engine-gaps.md).
- Use [Crust](https://github.com/hardcode84/9) for host and device code (`.crs`).
  Follow its language specification and examples.
- Keep Crust as a pinned Git submodule in `crust/`. Bootstrap its seed from source
  with the host C compiler. See [bootstrap instructions](docs/build/bootstrap.md).
- Develop Crust alongside the game. If a required feature is missing or broken,
  implement or fix it in Crust. Do not add workarounds in the game.
- Use Vulkan compute with SPIR-V on desktop and WebGPU compute with WGSL in the
  browser. Keep device sources and renderer scheduling shared.
- Use the Crust ownership stage for host code. Keep native providers explicit
  in the root build. Expose owned resources and scoped borrows to checked code.
- See the [shader compiler investigation](docs/build/crust-spirv.md) before device work.
- Keep design contracts current in the same commit as code changes.

## Implementation

- Keep entry-point commands in the [component map](docs/README.md).
- Keep room-specific notes in the room's Crust file comments, not separate Markdown files.
- Run `crust tests.crs` for automated checks. Keep test entry points and fixtures
  out of application builds. See the [component map](docs/README.md).
- Build playable slices. Follow the game design's prototype gates.
- Keep ownership, memory costs, synchronization, and failure paths explicit.
- Define each gameplay constant once, in its owning component. All consumers,
  including UI, help text, demos, and tests, must use that shared definition.
  Derive unit conversions and related values from it. Do not copy numeric
  tuning values into other code, strings, comments, or documentation. In docs,
  link to the defining source instead. Change the definition when tuning gameplay;
  do not maintain matching literals in several files.
- Keep `src/render/` independent of demo and test sources. Put scene generation,
  animation frame indices, palette generation, and user input in `src/demo/` or
  `src/game/`. Keep shared application helpers in `src/app/`.
- Fix broken contracts. Handle unsupported cases completely or report an error.
- Test shared generators and viewer behaviour. Do not add a test suite for each
  asset or hard-code asset names, dimensions, or topology counts in tests.
- Test actual game behaviour. Measure optimizations against a repeatable baseline.

## Style

- Do not repeat commit hashes, submodule pins, or update dates in documentation.
  Git records revisions. Keep exact source links when they support a technical claim.

- Before every commit, run `crust tests.crs` and the additional CI test commands
  for the components changed. For a Crust submodule update, run all CI test commands.
- Run `pre-commit run --all-files` before committing. Stage hook changes and rerun.
- Write short, direct comments and replies. Remove filler and repeated code descriptions.
- Document public behaviour, preconditions, and postconditions for functions and types.
