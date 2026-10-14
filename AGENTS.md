# SPINWARD

A 6DOF exploration game in a rotating megastructure.

## Design and language

- Read the [game design](../SPINWARD.md) and [rendering design](docs/rendering.md).
- Use the [room catalogue](docs/room-catalogue.md) for biomes and room content.
- Use [Crust](https://github.com/hardcode84/9) for host and device code (`.crs`).
  Follow its language specification and examples.
- Keep Crust as a pinned Git submodule in `crust/`. Bootstrap its seed from source
  with the host C compiler. See [bootstrap instructions](docs/bootstrap.md).
- Develop Crust alongside the game. If a required feature is missing or broken,
  implement or fix it in Crust. Do not add workarounds in the game.
- Use Vulkan compute with SPIR-V input for rendering.
- Use the Crust ownership stage for host code. Keep native providers explicit
  in the root build. Expose owned resources and scoped borrows to checked code.
- See the [shader compiler investigation](docs/crust-spirv.md) before device work.
- Keep design contracts current in the same commit as code changes.

## Implementation

- Run the rendering demo with `crust demo.crs`. Use the root `main.crs`
  entry point for the playable expedition. Use `--trial` for the movement course.
  See [expedition rules](docs/expedition.md).
- Build playable slices. Follow the game design's prototype gates.
- Keep ownership, memory costs, synchronization, and failure paths explicit.
- Keep `src/render/` independent of demo and test sources. Put scene generation,
  animation frame indices, palette generation, and user input in `src/demo/` or
  `src/game/`. Keep shared application helpers in `src/app/`.
- Fix broken contracts. Handle unsupported cases completely or report an error.
- Test actual game behaviour. Measure optimizations against a repeatable baseline.

## Style

- Run `pre-commit run --all-files` before committing. Stage hook changes and rerun.
- Write short, direct comments and replies. Remove filler and repeated code descriptions.
- Document public behaviour, preconditions, and postconditions for functions and types.
