# Indexed textures and vertex UVs

The renderer accepts positive texture dimensions. Width and height can differ.
Neither dimension must be a power of two. Each texel selects one of 256 palette
entries. The final image has no 256-colour limit.

## Host submission

Call `input_assets` with a material count and a payload size in four-byte words.
The allocation starts with `material_count * MATERIAL_WORDS` descriptor words.
The payload follows these words. The caller assigns texture and palette offsets
within this allocation. All asset offsets are relative to its start.

Use `input_texel` to store indices from zero through 255. Use `input_asset_set`
to fill palette entries. Call `input_material` to select these ranges. It checks
nonzero dimensions, row stride, storage bounds, palette extent, and sample modes.
A rejected descriptor does not change the material. Invalid texture indices or
word offsets are programming errors and trap. There is no external asset parser.

A material contains these fields:

| Field | Contract |
| --- | --- |
| `texture` | Offset of the top-left texel in the region |
| `width`, `height` | Positive region dimensions in texels |
| `stride` | Source row length in words; at least `width` |
| `palette` | Offset of a complete 256 by 512 colour table |
| `style` | Mapping: 0 perspective, 1 affine, 2 span approximation; bit 2 enables vertex snapping |
| `unlit` | 1 selects maximum light; 0 uses scene lighting |
| `address_u`, `address_v` | `ADDRESS_REPEAT` or `ADDRESS_CLAMP` |
| `transparent_index` | Index discarded when the triangle enables cutout |

Different materials can share texture regions and palette tables. To select a
region in an atlas, add its row and column offset to `texture`, retain the atlas
row stride, and set the region width and height. Addressing stays inside that
region. There is no texture filtering or interpolation of colour indices.

A palette contains `256 * 512` packed RGBA words, or 512 KiB. Entry `c` and light
state `s` are at `palette + c * 512 + s`. A full-bright entry stores the same
colour in all states. It does not add a light to the scene. No palette indices
are reserved for full-bright colours. Distance shading uses states 0 through
63; coloured lighting uses all 512 states. The asset generator fills the states
used by its selected light model.

Texture indices currently use one four-byte word per texel. The index value
remains eight bits. This layout permits independent writes and uses the existing
word storage binding. Measure texture bandwidth before selecting a packed format.

## UV coordinates

Each source vertex stores XYZ and UV. `triangle_uv` in `src/app/geometry.crs`
accepts independent UV values for all three vertices. Values must be finite.
One U unit spans the region width; one V unit spans its height. Clipping retains
these coordinates. The selected mapping mode interpolates them during sampling. Interpolation uses
attribute differences from one vertex to preserve constant coordinates at seams.

Repeat uses `q = uv - floor(uv)`. The selected texel is `floor(q * dimension)`.
For example, U values -0.25, 0.75, and 1.75 select the same column. Exact integer
coordinates select column zero. The two axes wrap independently. This rule also
applies to non-power-of-two dimensions. Repeat is the default in the game and
demo asset builders.

Clamp maps coordinates at or below zero to the first texel. It maps coordinates
at or above one to the last texel. Intermediate values select
`floor(uv * dimension)`. A final range check handles Float32 rounding at the edge.

The asset generator controls UVs for trims, borders, and texel density. Changing
physical dimensions does not change the renderer's UV contract. To keep a repeat
period of four metres, for example, divide surface distances by four. To keep a
border width fixed, give it separate vertices and UVs for its atlas region.

UVs use Float32. Large values lose fractional precision; at magnitude 8,388,608
or greater, every finite representable coordinate is an integer. Keep local UVs
when sub-texel precision is needed. Geometry and interpolation must remain within
the representable range.

## Storage and checks

The host grows asset storage before submission. Geometry growth preserves asset
data and relative offsets. Asset growth preserves geometry. Both operations
update descriptors and command buffers after GPU completion. Materials do not
hold raw pointers into an allocation.

`input_assets` replaces the logical asset layout. The caller must fill every
referenced range before rendering. Allocation and device-range failures report
an error. The old allocation remains valid if planning or allocation fails.
A Vulkan command-recording failure rejects further submission.

Run `crust tests.crs render 6` for eleven reference states. It compares 13 by 7, 3 by 11, 257 by 129, and
1 by 17 textures against the CPU reference. It checks atlas borders, shared
palettes across 32 materials, repeat and clamp per axis, negative and large UVs,
index 255, cutouts, full-bright colours, and both dither patterns. Exact constant
UV checks include positive and negative repeat seams in all three mapping modes. It also checks
invalid descriptors and allocation rejection. The portal and lit-tour tests
check the same texture path through transformed portal views.
