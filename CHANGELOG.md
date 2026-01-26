# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
