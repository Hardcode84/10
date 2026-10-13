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
- Write technical documentation in ASD-STE100. Use relative paths; omit tracker IDs.
- Before replacing a design document, write the replacement and compare both for lost requirements.
- Never install Node.js or npm.

## Workflow

Use `br` for issues. The tracker is in `../.beads`; do not create a second tracker.

1. Run `git status` and `br ready`. Preserve other work.
2. Claim or create a focused issue. Set its status to `in_progress`.
3. Make the change and run the applicable checks. Report any checks not run and why.
4. Close completed issues and run `br sync --flush-only`.
5. Stage intended files and run `git diff --cached --check`.
6. Commit with `git commit -s`. Keep each commit focused. Check `git status` again.
