# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
