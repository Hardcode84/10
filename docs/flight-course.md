# Industrial flight course

This course extends the Phase 0 [movement trial](movement.md). It tests flight,
braking, tether use, and route recognition in one physical space. It does not
change the charge model or the prototype acceptance gates.

## Route

Pass 11 directional gates, then land on the upper dock at less than 2 m/s.
The route changes heading, climbs through a shaft, and returns above the start.
Gate centres reach 115 m above the start platform. Each opening is 12 m wide.

| Section | Gates | Flight task | Structure |
| --- | --- | --- | --- |
| Launch gallery | 1–2 | Leave the pad; pass to the right of the spoke | Walls, roof, overhead pipe |
| Machinery court | 3–5 | Clear the wall; turn right between machines | Low wall, towers, shaft entrance |
| Service shaft | 6 | Climb 80 m; cross the horizontal gate | Three walls and a vertical pipe |
| Upper crossing | 7–9 | Leave the shaft; turn left; descend | Bridge, rails, raised machine |
| Return duct | 10–11 | Turn back toward the start; pass the baffle | Deck, wall, roof, baffle |
| Landing dock | After 11 | Brake and land | Raised pad and amber frame |

The current gate is cyan. Only it and the next gate are drawn. The next gate
is dim, so distant gates do not fill the view. A cyan arrow indicates the
next required point when it is outside the forward view. The HUD names the
current section. Neither cue turns the camera.

## Surface and light rules

The course uses 22 box solids and two closed, six-sided pipes. The player and
hook collide with the same shapes that are drawn. Pipes have end caps and
rounded sweep contacts at their edges. The cable can pass through structures,
as specified in the movement contract.

Panel grids mark walls. Ribs mark metal structures. Low-contrast deck panels
provide motion cues. Texture repeats use a 4 m surface scale. Warm lights mark
the launch and landing areas. Cool lights mark the court and return route.
Eight local lights and the drone lamp use the renderer's banded light model
and screen-space dithering.

Full-bright texels mark pipe stripes and small machine indicators. They remain
visible without light, but do not cast light. The floor pads, bridge rails, and return roof
use lit texels. Their brightness must not compete with the gate outlines.

Claude Opus reviewed the original trial and three course captures. The review
supported enclosed sections and distinct surface functions. It also showed
that bright floor pads and roof stripes drew attention away from the gates.
The final course dims those pads, removes the roof stripes, and separates the
shaft pipe from the gate sightline. Gate readability during flight still needs
a human test; still images and automated flights cannot establish it.

## Cost and source boundaries

Course geometry is fixed game data. Scene submission runs each rendered frame.
Physics queries run at 120 Hz and during path prediction. Box drawing submits
only faces toward the camera. A convex box uses at most six triangles; a pipe
uses at most ten. The complete upper bound is 256 triangles, including two
gates, both path previews, cockpit frame, hook, cable, and direction markers.
The course fits the renderer's existing capacity.

Geometry, route data, pipe contacts, pipe drawing, materials, and route cues
have separate source files. No course data or controls enter `src/render/`.
Palette generation stays in Crust. The root builds the entire application.

## Checks

`crust main.crs --test` flies both modes with ordinary input commands. It also
checks forward gate crossings, reverse and outside rejection, pipe side and
end-cap contact, clearance outside the pipe hexagon, and the triangle bound.
The stopped controller completes 11 gates and lands in 18,488 ticks. The spin
controller completes them in 6,470 ticks. These are different controllers, so
their times do not measure relative player difficulty.

Use `--tour` for a windowed flight or `--headless --tour` for a complete
simulation without wall-clock pacing. Add `--full-spin` to start with rotation.
Use `--ticks N --capture FILE` to inspect a particular tour state. Version 6
recordings include the initial spin mode and hash both prediction phases. Replay restores it and checks every
state hash.

For a route test, give three new players up to five attempts each. Record
completion, time spent without finding the next gate, and missed turns. At
least two should finish within five attempts and identify the return direction.
If they cannot, change the obstructed sightline or cue at the missed turn and
repeat the test. This route test does not replace the five-person Gate 0 comfort
and retry test in the game design.
