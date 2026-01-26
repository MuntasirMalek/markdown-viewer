# Contributing to Markdown Viewer Enhanced

Thank you for your interest in contributing! Here's how you can help:

## Reporting Issues

If you find a bug or have a feature request:

1. Check if the issue already exists in [Issues](https://github.com/MuntasirMalek/Test/issues)
2. If not, create a new issue with:
   - Clear description of the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - Your VS Code version and OS

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/MuntasirMalek/Test.git
   cd markdown-viewer-enhanced
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile TypeScript:
   ```bash
   npm run compile
   ```

4. Press `F5` in VS Code to launch the Extension Development Host

## Making Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Test thoroughly
5. Commit with clear messages: `git commit -m "Add: feature description"`
6. Push to your fork: `git push origin feature/your-feature`
7. Open a Pull Request

## Code Style

- Use TypeScript for extension code
- Follow existing code patterns
- Add comments for complex logic
- Keep functions focused and small

## Testing

Before submitting:
- Test preview with various markdown content
- Test math equations (inline and block)
- Test code blocks with different languages
- Test PDF export (requires Chrome/Chromium)
- Test in both light and dark themes

## Questions?

Feel free to [open an issue](https://github.com/MuntasirMalek/Test/issues) for any questions!
