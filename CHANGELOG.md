# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.33] - 2024-01-26

### Fixed
- **Sync feel**: Re-introduced "Smooth Scrolling" with a much stronger "Echo Lock" (750ms). This allows the view to glide to the correct position without bouncing back.
- **Center Alignment**: Sync now aligns the target line to the **Center** of the screen instead of the top. This provides better context and feels less abrupt.
- **Robust Matching**: Reverted to strict Unicode+Alphanumeric text matching for Bangla support.

## [1.0.32] - 2024-01-26

### Fixed
- **Sync Perfection**: Removed "Smooth Scrolling" behavior during sync events to eliminate lag/rubber-banding. Added "Linear Interpolation" to calculate the exact scroll position between line markers, ensuring the view moves perfectly in sync with the editor even across large paragraphs.
- **Robust Line Matching**: Improved the text matching algorithm to ignore whitespace and special characters more reliably, handling complex scripts (like Bangla) better.

## [1.0.31] - 2024-01-26

### Fixed
- **Sync Smoothness**: Rewrote the sync logic to use a "debounced & flagged" system. This prevents the "stuttering" effect where the editor and preview fight for control. Also improved the line matching algorithm to center the view.
- **PDF Export (CLI Strategy)**: Abandoned the troublesome node module dependency. The extension now talks directly to your installed Chrome/Chromium using the Command Line Interface (CLI). This is lighter, faster, and fails significantly less often.

## [1.0.30] - 2024-01-26

### Fixed
- **Sync (Final Fix)**: Implemented "Capture-Phase" event listeners for scrolling. This guarantees the preview detects scrolling even if it's trapped inside a specific container, enforcing consistent editor updates.
- **PDF Resolution**: Switched to absolute path resolution using the extension context. This bypasses all relative path ambiguity by asking VS Code exactly where the extension is installed.

## [1.0.29] - 2024-01-26

### Fixed
- **Scroll Sync (Bidirectional)**: Fixed the synchronization from Preview back to Editor. Scrolling the preview now updates the editor cursor position.
- **PDF Debugging**: Added "Nuclear Debug Mode" to PDF export. If the dependency fails to load, the extension will now list the entire file structure of the installation in the debug console, helping identify why `puppeteer-core` is missing.
- **Dependency Loading**: Added `createRequire` strategy for robust module loading throughout.

## [1.0.28] - 2024-01-26

### Fixed
- **Missing Dependencies**: Enforced `puppetter-core` dependencies to be bundled inside the extension package, preventing "module not found" errors.
- **UI UX**: Added a persistent "Export PDF" Floating Action Button (FAB) at the bottom-right for easy access. Also added an Export button to the selection toolbar.

## [1.0.27] - 2024-01-26

### Fixed
- **PDF Export**: Implemented multi-strategy dependency loading (Dynamic Import -> Require -> Explicit Path -> CommonJS entry) to resolve "Failed to load" errors in all environments.
- **Scroll Sync**: Reinforced scroll synchronization with an aggressive percentage-based fallback that scrolls the entire preview window if valid line markers are not found.

## [1.0.26] - 2024-01-26

### Fixed
- **Extension Crash**: Reverted the static import change that caused the extension to fail on startup. We returned to lazy-loading `puppeteer-core` but added detailed diagnostic error messages if it fails to load.
- **Dependency Path**: Improved the logic for finding `puppeteer-core` inside the installed extension folder.

## [1.0.25] - 2024-01-26

### Fixed
- **PDF Export**: Switched to static import for `puppeteer-core` to guarantee dependency inclusion in the extension package.
- **Scroll Sync**: Added a percentage-based fallback for scroll synchronization. If line matching fails (e.g. valid markdown lines not producing blocks), the preview now scrolls proportionally to keep you in context.

## [1.0.24] - 2024-01-26

### Fixed
- **Force Neon Highlight**: Applied `!important` to neon yellow styles to ensure no other theme setting overrides it.
- **Robust PDF Dependency**: Added manual path resolution for `puppeteer-core` to fix export issues in some environments.
- **Inline Scroll Sync**: Embedded scroll synchronization logic directly into the preview to guaranteeing availability.

## [1.0.23] - 2024-01-26

### Fixed
- **Neon Highlight**: Updated `==highlight==` to use **Neon Yellow (`#ffff00`)**, ensuring maximum visibility as requested.
- **PDF Dependencies**: Re-verified and re-installed `puppeteer-core` dependencies to resolve the "require" error on export.
- **Scroll Sync Stability**: Reinforced the scroll synchronization logic to ensure it runs correctly after every content update.

## [1.0.22] - 2024-01-26

### Fixed
- **PDF Export**: Fixed a bug where clicking "Export PDF" failed because focus moved to the preview window. The button now correctly targets the actively previewed document.
- **Vibrant Highlight**: Adjusted the `==highlight==` color to a vibrant **Yellow (`#ffeb3b`)**. The previous "pastel" yellow was reported as too faded.

## [1.0.21] - 2024-01-26

### Fixed
- **Scroll Sync**: Fixed the issue where scrolling the editor did not sync the preview. The preview now correctly tracks the editor's position.
- **Light Yellow Highlight**: Adjusted the `==highlight==` color to a lighter, pastel yellow (`#fff5b1`) as requested, making it easier on the eyes while staying distinct.

## [1.0.20] - 2024-01-26

### Fixed
- **Highlight Syntax**: Fixed a regression where `==highlight==` syntax was not rendering as a yellow highlight. It has been re-enabled in the previewer.

## [1.0.19] - 2024-01-26

### Fixed
- **Emoji Restoration**: Reverted the exclamation mark replacement. Warnings will now display the original `⚠️` emoji character, resolving user feedback about the icon "acting weird".
- **Solid Gray Blocks**: Maintained the `#f1f1f1` solid gray style for consistency with MPE textures.

## [1.0.18] - 2024-01-26

### Fixed
- **Texture Unification**: Updated both Blockquotes and Warnings to use a **Solid Gray Block** style (`#f1f1f1` background, transparent border). This matches the visual texture observed in MPE screenshots where rules are displayed as solid boxes.
- **Icon Cleanliness**: Warnings now show a clean `!` icon within the gray box.

## [1.0.17] - 2024-01-26

### Fixed
- **Color Restoration**: Restored the classic pale yellow background (`#fff5b1`) and gold border (`#e3b341`) for warnings, as requested ("not black and white").
- **Clean Icon**: Retained the single `!` icon logic from v1.0.16 to ensure no double exclamation.

## [1.0.16] - 2024-01-26

### Fixed
- **Double Icon Fix**: Resolved the "extra !" issue where the replacement icon was being added alongside the text's own exclamation. Now it cleanly replaces `⚠️` with a single `!`.
- **Gray Texture Match**: Updated Blockquote and Alert background colors to `#e9e9e9` to match the exact darker gray "texture" of the reference extension.

## [1.0.15] - 2024-01-26

### Fixed
- **Monochrome Alert**: Removed yellow icon/border coloring from warnings, defaulting to grayscale. This eliminates the "yellow thing" user concern.
- **Forced Plain Tables**: Added `!important` to table styles to forcefully remove zebra striping ("grey white thing").

## [1.0.14] - 2024-01-26

### Fixed
- **Visual Refinement**: Removed yellow background from Auto-Alert boxes to make them transparent (while keeping the border and icon). This addresses feedback about unwanted yellow highlighting.

## [1.0.13] - 2024-01-26

### Fixed
- **Style Match**: Removed default table background colors and "zebra striping" to match the cleaner, plain-text styling of the reference extension.
- **Cleanup**: Diabled custom `==highlight==` syntax to prevent any accidental yellow text highlighting that was not present in the original markdown.

## [1.0.12] - 2024-01-26

### Fixed
- **Visual Match**: "Auto-Alert" now visually replaces the `⚠️` emoji with a bold `!` icon inside the warning box, matching the reference rendering exactly. The underlying markdown remains unchanged.

## [1.0.11] - 2024-01-26

### Fixed
- Improved "Auto-Alert" for `⚠️` to use `inline-block` styling. This creates a proper box (with border and padding) that respects table cell layout relative to its container, achieving the exact visual style of the reference extension.

## [1.0.10] - 2024-01-26

### Fixed
- Re-implemented "Auto-Alert" for `⚠️` as a safe inline highlight. This avoids layout breakage in tables while still providing the visual "warning box" feel.

## [1.0.9] - 2024-01-26

### Fixed
- Reverted "Auto-Alert" experimental feature due to layout issues.
- Restored stable rendering of `⚠️` emojis as standard text.
- Retained GitHub Alerts support (`> [!WARNING]`).

## [1.0.8] - 2024-01-26

### Fixed
- Added "Auto-Alert" styling: Lines containing the `⚠️` emoji are now automatically styled as warning boxes, mimicking MPE's behavior. This ensures text like `⚠️ Warning: ...` renders with the correct background and border.

## [1.0.7] - 2024-01-26

### Fixed
- Fixed missing "Alert/Admonition" styles (like `> [!NOTE]` or `> [!WARNING]`). Now correctly renders with colored boxes and titles matching GitHub style.
- Added "Output" channel logging for PDF export to help debug browser launch issues.

## [1.0.6] - 2024-01-26

### Fixed
- Fixed PDF export using offline/vendored resources to match preview styling exactly.
- Fixed PDF export styling issues by enforcing `github-markdown-css` in the generated PDF.

## [1.0.5] - 2024-01-26

### Added
- Added "Export PDF" button directly to the preview toolbar for easier access.
- Updated preview styling to use `github-markdown-css` for a more authentic GitHub-like look, matching the original extension's appearance.

## [1.0.4] - 2024-01-26

### Fixed
- Fixed formatting toolbar actions (Bold, Highlight, Delete) not working when the preview panel has focus.
- Added error messages when the selected text cannot be found in the source document.

## [1.0.3] - 2024-01-26

### Fixed
- HOTFIX: Switched to fully vendored `media/vendor` libraries for KaTeX, Marked, and Highlight.js. This solves the "Blank Preview" issue caused by incompatible CommonJS modules when loading from `node_modules` in the Webview.

## [1.0.2] - 2024-01-26

### Fixed
- Fixed blank preview issue by bundling `katex`, `marked`, and `highlight.js` libraries locally instead of loading from CDN. This improves offline support and performance.

## [1.0.1] - 2024-01-26

### Fixed
- Added compatibility aliases for `markdown-preview-enhanced` commands to fix "command not found" errors for users migrating from the other extension.

## [1.0.0] - 2024-01-26

### Added
- Live Markdown preview with real-time updates
- KaTeX math support for LaTeX equations (`$inline$` and `$$block$$`)
- Syntax highlighting for code blocks using highlight.js
- Floating formatting toolbar (bold, highlight, delete)
- PDF export via Chrome Puppeteer
- Scroll sync between editor and preview
- Light and dark theme support
- Custom highlight syntax (`==text==`)
- Configurable PDF settings (page size, margins)
- Auto-detection of Chrome/Chromium/Edge for PDF export
