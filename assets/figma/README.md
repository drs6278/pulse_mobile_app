# Pulse design assets

Design source: https://www.figma.com/design/BxLNPC3YS1l2gHExZB02yu/475_pulse?node-id=0-1

Photos and map images were downloaded from Figma MCP design context. The repeated concert photos on Categories, Search, Saved, Calendar, and Map intentionally match the design. The map grid image is a separate, half-opacity overlay in the original design.

The filter, account, home, back, map, and pin SVGs are Figma MCP exports of their individual vector layers. The corresponding PNG exports are retained for reference; their opaque backgrounds make them unsuitable for tinting. Whole-screen screenshots are not used as implementation assets.

Figma's Starter-plan MCP limit prevented exporting the remaining icon nodes. Their local SVGs come from the design's source libraries: Google Material Design Icons (add circle outline, bookmarks, search, cancel, event; Apache 2.0) and Lucide (close; ISC). The right chevron rotates the original left-chevron export. Icons are tinted at render time to match the displayed state.

Montserrat Regular, SemiBold, and Black are bundled under `assets/fonts`, with their SIL Open Font License. Fonts came from the upstream JulietaUla/Montserrat repository.
