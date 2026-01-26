# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
