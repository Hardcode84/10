# Content hierarchy

Use this order to define content:

1. **Biome:** the work that this part of the structure performs. It defines
   machine families, support structures, materials, and movement opportunities.
2. **Subbiome:** a distinct part of that work. Add one only when both its main
   silhouette and its flight problem differ from the rest of the biome.
3. **Geometry:** the shape of the connected flight space. It defines the main
   turns, changes in section, branches, and sightlines.
4. **Room variant:** a named place with specific structures, clearances, anchor
   points, landmarks, and a purpose in an expedition.
5. **Instance:** a variant placed through its connection ports, with its local
   objective and light state.

Spin state and radius select physical forces, not a visual theme. A biome is
placed in one stratum, but its theme comes from its work, not its radius.

## Biomes

Each biome fills one stratum of the drum. The
[game design](../../../SPINWARD.md#world-structure) assigns strata to radii and
defines each stratum's hazards in the dive and after the relight. Each flight
problem below names the dive first and the climb second.

### Service network (stratum 1)

| Subbiome | Spaces | Flight problem | Current recipes |
| --- | --- | --- | --- |
| Hex tunnels | Narrow hexagonal tunnels with long straight stretches, junctions and side alcoves | Coast and corner the straights; on the climb, reach a junction or alcove before a pig, or slide through at speed | `hex-*` |
| Shafts | Shafts with rotors, pipes and girders, joined by occasional octagonal tunnels and hubs | Thread stopped rotors; on the climb, time moving fans and rotors against their wind | `shaft-*`, `oct-*` |

### Power conduits (stratum 2)

| Subbiome | Spaces | Flight problem | Current recipes |
| --- | --- | --- | --- |
| Conduit tubes | Open tubes about 250 m across, each with a central core and debris | Cross open space where Coriolis drift is visible; on the climb, resist the core's pull and use orbiting debris as moving anchors | None |
| Conduit tunnels | Smaller tunnels that connect the tubes, with exposed conduits | Choose tunnels that stay clear of exposed conduits; on the climb, avoid the live ones | None |

### Cooling works (stratum 3)

| Subbiome | Spaces | Flight problem | Current recipes |
| --- | --- | --- | --- |
| Cooling pools | Open pools under kilometre-high cooling towers; coolant floats as large bubbles in the dive | Route between static coolant bubbles; on the climb, cross sloshing pools and climb the towers against falling streams | None |

### Hull city (stratum 4)

| Subbiome | Spaces | Flight problem | Current recipes |
| --- | --- | --- | --- |
| City | Irregular towers that rise from both the inner and outer sides of the stratum, with hull breaches into the abyss | Find the beacon in the dark; on the climb, chain anchors up out of the heaviest gravity without falling or drifting into a breach | None |
