# Markdown Viewer Enhanced

Live Markdown preview with KaTeX math, syntax highlighting, floating toolbar, and PDF export via Puppeteer.

![Preview](screenshots/preview.png)

## Features

✅ **Live Preview** — See your Markdown rendered in real-time as you type  
✅ **LaTeX Math** — Full KaTeX support for equations (`$inline$` and `$$block$$`)  
✅ **Syntax Highlighting** — Beautiful code blocks with highlight.js  
✅ **Floating Toolbar** — Quick formatting with bold, highlight, and delete tools  
✅ **PDF Export** — Export to PDF using Chrome Puppeteer  
✅ **Scroll Sync** — Preview scrolls with your editor  
✅ **Dark Mode** — Adapts to VS Code's theme  

## Installation

### From VSIX (Recommended)

⬇️ [Download Latest VSIX](https://github.com/MuntasirMalek/Test/releases/latest)

1. Download the `.vsix` file
2. In VS Code: Extensions → `...` → Install from VSIX
3. Select the downloaded file

### From Source

```bash
git clone https://github.com/MuntasirMalek/Test.git
cd markdown-viewer-enhanced
npm install
npm run compile
```

Then press `F5` to run in development mode.

## Usage

### Preview Markdown

1. Open a `.md` file
2. Press `Cmd+Shift+V` (Mac) or `Ctrl+Shift+V` (Windows/Linux)
3. Or right-click → "Markdown Viewer: Open Preview"

### Export to PDF

1. Open a `.md` file
2. Press `Cmd+Shift+E` (Mac) or `Ctrl+Shift+E` (Windows/Linux)
3. Choose a save location

> **Note:** PDF export requires Chrome, Chromium, or Microsoft Edge installed.

### Floating Toolbar

1. Select text in the preview panel
2. A toolbar appears with formatting options:
   - **B** — Toggle bold (`**text**`)
   - 🟡 — Yellow highlight (`==text==`)
   - 🔴 — Red highlight
   - 🗑️ — Delete selected text

## Keyboard Shortcuts

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Open Preview | `Cmd+Shift+V` | `Ctrl+Shift+V` |
| Export to PDF | `Cmd+Shift+E` | `Ctrl+Shift+E` |

## Supported Syntax

- Headers, bold, italic, strikethrough
- Lists (ordered & unordered)
- Code blocks with syntax highlighting
- LaTeX math: `$inline$` and `$$block$$`
- Tables, blockquotes, links, images
- Highlights with `==text==`

### Math Examples

Inline: `$E = mc^2$` renders as $E = mc^2$

Block:
```
$$
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `markdownViewer.chromePath` | (auto-detect) | Path to Chrome/Chromium for PDF export |
| `markdownViewer.pdfPageSize` | A4 | PDF page size (A4, Letter, Legal, A3, A5) |
| `markdownViewer.pdfMargin` | 20mm | PDF margins |

## Requirements

- VS Code 1.85.0 or higher
- Chrome, Chromium, or Microsoft Edge (for PDF export)

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Credits

- [KaTeX](https://katex.org/) for math rendering
- [highlight.js](https://highlightjs.org/) for syntax highlighting
- [marked.js](https://marked.js.org/) for markdown parsing
- [Puppeteer](https://pptr.dev/) for PDF generation
- Inspired by [markdown-viewer](https://github.com/MuntasirMalek/markdown-viewer) and [markdown-preview-enhanced](https://github.com/shd101wyy/markdown-preview-enhanced)

## Support

If you encounter any issues, please [open an issue](https://github.com/MuntasirMalek/Test/issues) with:
- Description of the problem
- Steps to reproduce
- Your VS Code version and OS

---

Made with ❤️ by [Utsho](https://github.com/MuntasirMalek)
