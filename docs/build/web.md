# Web game

The browser runs the main game. Game rules, generated assets, collision, flight,
tether, portal traversal, HUD, and shader sources are shared with the native game.
The demo and asset viewer keep their native entry points.

## Build and run

Build on Linux x86-64. First follow the seed bootstrap in the
[top-level README](../../README.md). Install Bun, Python 3, curl, tar with xz
support, and sha256sum. Do not install Node.js or npm.

```sh
crust main.crs --web
bun tools/web/serve.mjs
```

Open `http://127.0.0.1:8000`. The browser must support WebGPU and timestamp
queries. Use HTTPS when serving on another machine. The page reports a missing
adapter, feature, memory allocation, or shader error. It does not change to a CPU
renderer.

The root builds the Crust stages, checks host ownership for the wasm32 target,
emits C and WGSL, and invokes Emscripten. On the first web build it downloads a
matched Emscripten toolchain, verifies its checksum, and stores it under
`build/toolchain/wasm/`. Emscripten uses Python and Bun. Game build policy and asset
recipes remain Crust code. The web shader build does not require SPIRV-Tools or
an LLVM SPIR-V toolchain.

Serve the generated files in `build/web/` together: `index.html`, `launcher.js`,
`game.js`, `game.wasm`, and `game.data`. The data file contains the generated
shaders. The game generates room geometry and textures in WebAssembly at startup.

## Controls and files

Use the same [flight controls](../game/movement.md) as the desktop game. Select
seed, complexity, resolution, and optional modes before starting. Fullscreen
uses the browser display size; the internal image size remains independent.
Use **Capture mouse** to restore pointer lock after the browser releases it.
The browser can reserve Escape for pointer lock or fullscreen. **End run** sends
the game's exit command. **New expedition** starts a fresh application instance.

Select a controls file to replace bindings. Select a recording file and its
seed and complexity to replay it. Native and web recordings use the same format
and check the state hash at every tick. Select **Record flight** to download a
recording after the run. **Render capture** runs without a window and supplies a
PPM download. A finite tick limit is useful for captures without a replay file.

## Backend contract

`RenderState`, resource layout, capacity planning, transfer ranges, and pass
scheduling are shared. `src/render/host/` supplies the native Vulkan operations.
`src/render/web/` supplies WebGPU operations. `src/app/web/` contains the browser
launcher and window provider. The shader stage emits SPIR-V or WGSL from the
same checked Crust device code. Neither backend reads every scene triangle for
each pixel.

Projected geometry capacity uses the largest populated space per portal view.
It does not multiply the complete scene by every view. Both backends reject
requests above the device limit before buffer creation.

WebGPU device resources have an explicit owner. Asyncify preserves the host
stack across adapter creation, pipeline compilation, and GPU readback. JavaScript
must finish every pending read before it returns control to Crust cleanup.
Typed memory views are fetched again after each asynchronous wait because the
WebAssembly heap can grow. Abort handling releases GPU owners.

Each compute dispatch ends its WebGPU pass. The next pass or copy observes its
writes. Indirect arguments are copied to a separate indirect buffer before use;
a writable storage binding cannot also be the indirect source in that pass.
Frame images stay on the GPU for presentation. Row padding uses GPU copies when
the output width does not meet WebGPU's copy alignment. Normal draws read only
capacity results. Shader status and pixel downloads remain explicit diagnostics.

The wasm32 host uses 32-bit pointers and size types. Allocation sizes must fit
the target layout and the device limits. GPU integer interfaces retain their
shared 32-bit layout. WGSL follows the WebGPU floating-point rules, which permit
rounding differences from SPIR-V. Cross-backend images need not be byte-identical.
The compiler rejects a request for guaranteed denormal preservation with WGSL.
See [WGSL floating-point evaluation](https://www.w3.org/TR/WGSL/#floating-point-evaluation).

## Focused browser check

Build the native game and web game. Start the server above, then start a WebGPU
browser with a separate profile and remote debugging port 9227. Keep one page
open. Use the browser's normal GPU configuration. For a local headless Chromium
check, Vulkan and unsafe WebGPU flags can be required by that browser build.

```sh
crust main.crs --build-only
crust main.crs --web
bun tests/web/check.mjs
```

Set `BROWSER_CDP` and `GAME_URL` to select different local endpoints. The check
uses the shipped launcher, SDL input, and game binary. It compares checked and
raw shaders, exercises flight and tether controls, and replays a browser flight
on both backends. State hashes must match exactly. Image checks permit one colour
step, or a one-pixel sampling edge with a matching neighbour in both images.
At most one pixel per thousand can differ. These checks do not permit broad
geometry, palette, or lighting changes. Captures remain in `build/`.

To isolate browser presentation failures, run:

```sh
bun tests/web/check.mjs --presentation
```

This witness presents 180 red frames with no game code or WebAssembly. It can
separate a browser/driver failure from renderer resource ownership. In the tested
Linux headless Vulkan compositor configuration, this witness increased the GPU
process's `anon_inode:syncobj_file` descriptors by about one per frame, including
after device destruction. The same increase occurred in the game. At the process
file limit, Vulkan semaphore export failed and the browser lost its GPU device.
The application cannot close descriptors owned by the browser GPU process. A
correct platform fix must release each exported synchronization descriptor in
the browser/driver presentation path. Use this witness to check that fix; a
higher file limit only delays the failure. Do not use this compositor setup for
an extended playtest until its descriptor count remains bounded.

## Publish with GitHub Pages

In the repository settings, open **Pages**. Under **Build and deployment**, set
**Source** to **Deploy from a branch**, select `gh-pages`, and select `/ (root)`.
Keep `gh-pages` allowed in the `github-pages` environment. The source branch does
not need access to that environment.

Create a fine-grained personal access token for this repository with
**Contents: Read and write** permission. Use an account that can publish the
repository's Pages site. Save the token as the repository Actions secret
`GH_PAGES_TOKEN`. Renew the secret when the token expires. The built-in
`GITHUB_TOKEN` cannot trigger a Pages build when it pushes a commit. See
[GitHub's Pages setup instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

Push to the default branch to build and publish the game. To publish without a
new push, open **Actions → CI → Run workflow** and select the default branch.
Pull requests and other branches run CI without publishing.

The [CI workflow](../../.github/workflows/ci.yml) bootstraps Crust, builds the web
game, and runs the WebAssembly ABI checks. After both native and web jobs pass,
it commits the site files to `gh-pages`. GitHub Pages then publishes that branch.
The publish job fails if `GH_PAGES_TOKEN` is missing. It does not deploy directly
from the source branch.

The site contains `.nojekyll`, `index.html`, `launcher.js`, `game.js`, `game.wasm`,
and `game.data`. Build intermediates are not included. The publish action keeps
branch history and replaces the previous site files. If the files have not
changed, it does not create a commit. Check the separate Pages build and
deployment run for the published URL and deployment status.
