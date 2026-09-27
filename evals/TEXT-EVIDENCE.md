# Offline Text Evaluation Evidence

The seven fixed examples use `validation.json` `textCoverage` version 1. Its `static-solved-labels` scope covers every authored label with a solved rectangle, including each repeated day/amount label. A target declares its semantic `role`, fixture IDs, and optional author-time presentation policy. The `source` fixture always measures the actual label text. Missing targets, omitted labels, duplicate IDs, mismatched roles, and missing body stress cases fail the gate.

| Screen | Measured roles |
| --- | --- |
| Typography gallery | Title, body, state captions |
| Daily rewards | Title, seven day labels, seven reward quantities |
| Server menu | Title |
| Minimap | Coordinates |
| Quest book | Title, body, objective heading, objective instructions |
| Casino | Title, balance, bet, payline |
| Responsive shell | Title, body, PC/touch instructions |

`hasBody: false` changes which roles are tested; it does not skip text rendering. The four screens without body text use actual source strings and role-specific Korean/English or signed/zero numeric cases. These describe static examples, not unlimited dynamic values. For example, the minimap's coordinate label remains authored sample text; this gate does not claim that its title sender is bound to that label or that all world coordinates fit. Nested button-state labels have no independent solved rectangles and are outside this text gate's declared scope; button geometry/state checks remain separate.

## Body text and presentation

All body targets retain the original `long_ko_130`, `long_en`, and `unbroken_token` inputs, unchanged. Each fixture is injected into a clone, rendered for PC and touch at the original configured font scale, and measured through both line geometry and an unclipped text-mask raster. The report records `inputText`, displayed `text`, presentation policy, pixel bounds, and artifacts. Long tokens are never horizontally squeezed or fitted by reducing the font.

The book authoring source applies `BOOK_TEXT_PRESENTATION` through the shared `presentText()` formatter. It inserts an actual newline after each 16 code points within long whitespace-free tokens. It preserves all original characters and existing whitespace, and repeated formatting is idempotent. Both `buildScreen({...example, bodyText})` and `irDocument({...example, bodyText})` emit the same formatted label string. The evaluator applies that exact policy to its unchanged input fixture. This is an author-time string transformation, not an invented JSON UI wrapping property or a dynamic BP binding. The fixed ASCII token occupies five lines and 48 preview pixels of the book's 100px touch label height, at its original 0.85 scale. The gate still fails inputs whose formatted width or height exceeds the label.

The preview layout now preserves actual LF/CRLF and blank lines. The source RP already uses real newlines for the book objectives and responsive PC/touch instructions; the local final-RP font engine also treats LF as a line boundary. The newline regression test checks exact line contents/counts independently of image tolerance. Four PC/touch before/after crops were reviewed for the two affected labels, then only those two examples' six state images and contact sheets were refreshed. Golden thresholds and the geometry debugger images are unchanged.

## Source and regeneration

Edit `examples/v2/_scripts/generate.mjs`, which owns the roles, fixtures, and book presentation policy. Run `node examples/v2/_scripts/generate.mjs --text-contracts-only` to regenerate just the seven validation files and shared text fixtures. The ordinary generator still emits the complete examples. Importing the generator's authoring functions does not write files.

The previous generic-body contract exposed five failures: four missing body targets and one book token overflow. The revised semantic contract and shared authoring formatter resolve those causes. The fixed suite now measures 33 labels across 186 fixture/profile combinations. Negative regressions still reject missing/incorrect roles, skipped body stress inputs, long unformatted tokens, and insufficient width/height.

## Evidence limits

Results remain `offline-approximate`: the standalone preview uses a system sans-serif font and its existing 8px minimum. Raster success is not Minecraft glyph evidence or Bedrock runtime verification. Live evaluation remains blocked without runtime evidence. The static role fixtures and formatting policy do not guarantee arbitrary translations, combining-character sequences, runtime bindings, or unlimited values; additional real inputs must be measured and verified in Bedrock.
