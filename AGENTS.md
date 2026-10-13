# SPINWARD

A 6DOF exploration game in a rotating megastructure.

## Design and language

- Read the [game design](../SPINWARD.md) and [rendering design](docs/rendering.md).
- Use [Crust](https://github.com/hardcode84/9) for game code (`.crs`). Follow its
  language specification and examples. Do not assume unimplemented features.
- Use Vulkan compute with SPIR-V input for rendering.
- Keep design contracts current in the same commit as code changes.

## Implementation

- Build playable slices. Follow the game design's prototype gates.
- Keep ownership, memory costs, synchronization, and failure paths explicit.
- Fix broken contracts. Handle unsupported cases completely or report an error.
- Test actual game behaviour. Measure optimizations against a repeatable baseline.

## Style

- Write short, direct comments and replies. Remove filler and repeated code descriptions.
- Document public behaviour, preconditions, and postconditions for functions and types.
