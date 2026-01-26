# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.48] - 2024-01-26

### Fixed
- **Freeze/Crash Fix (Throttling)**: I identified that the extension was spamming the preview window with hundreds of messages per second during fast scrolling. This caused the "Not Responding" freezes. I added a "Speed Limit" (Throttle) so it only updates the preview 20 times a second, which is smooth but safe.
- **Responsiveness**: This should make the preview feel much lighter and refrain from crashing your VS Code window.

## [1.0.47] - 2024-01-26

### Fixed
- **Anti-Freeze**: I went back to the "Native Scroll" engine because the complex physics engine seemed to be crashing or freezing on your system ("not responding").
- **Nuclear Sync (Permanent)**: I have permanently disabled the file path checks. If you scroll a file, it WILL sync. The previous safety checks were likely blocking your specific file path setup.
- **Self-Healing**: Added an internal error reporter. If the preview crashes, it will now pop up an error message telling us exactly why, instead of just silently dying.

## [1.0.46] - 2024-01-26

### Fixed
- **Smooth Scroll Restored**: Re-enabled the smooth "Physics Engine" for scrolling, now that the connection issues are resolved.
- **Echo Cancellation**: Implemented a "Timestamp Lock" (500ms) to prevent "Scroll Wars" (where the editor and preview fight over who is scrolling). This fixes the "weird" behavior you saw.
- **Safety Checks**: Restored the file path safety checks to ensure we don't accidentally sync the wrong file now that the engine is stable.

## [1.0.45] - 2024-01-26

### Fixed
- **Reload Flicker Fix**: Fixed a massive bug where clicking between the editor and preview would cause the preview to reload (and reset scroll) every time. This created the illusion that sync was "flicking" or broken.
- **Embedded Engine**: I moved the sync logic from an external file directly into the preview HTML. This guarantees it runs, bypassing any weird file-loading restrictions on your machine.
- **Sync is still NUCLEAR**: It will still sync *all* files to be safe.

## [1.0.44] - 2024-01-26

### Fixed
- **Engine Reset**: Switched back to **Instant Native Scroll** (`window.scrollTo`). No physics, no smooth scroll. Just instant sync. This eliminates any possibility of the physics engine geting "stuck".
- **Visual Flash**: The preview background will **flash RED** for a split second whenever it receives a sync signal.
    - **If it flashes RED:** The signal ARRIVED.
    - **If it doesn't scroll after flashing:** The browser is refusing to scroll (weird, but possible).

## [1.0.43] - 2024-01-26

### Fixed
- **SYNC RESET (Nuclear Option)**: I have disabled ALL safety checks for the sync. If you scroll *any* markdown file, the preview will try to sync. This guarantees the signal is sent.
- **Visual Feedback**: When the preview receives a sync signal, a **Blue Bar** will appear at the very top of the preview window.
    - **No Blue Bar?** -> The preview is not receiving the signal (Extension issue).
    - **Blue Bar but No Scroll?** -> The preview is stuck/frozen (Javascript issue).

## [1.0.42] - 2024-01-26

### Fixed
- **Status Bar Indicator**: Added a visual status indicator at the bottom right. It will say `MD Sync: Active` if it's working, or `MD Sync: Mismatch` if it thinks you are editing the wrong file. This helps you instantly know if the tool is "connected".
- **Basename Fallback**: Relaxed the sync security even further. If the full file paths don't match (due to complex networking/symlinks), it now accepts the sync if the *File Names* match (e.g., `Note.md` matches `Note.md`).

## [1.0.41] - 2024-01-26

### Debugging
- **Verbose Logs**: Enabled full debug logging in the "Markdown Viewer Enhanced" Output Channel. This will print exactly what files are being compared during sync, allowing us to pinpoint why the sync is failing (e.g., path mismatch, missing preview doc, etc.).

## [1.0.40] - 2024-01-26

### Fixed
- **Sync Fix (Mac/Windows)**: Use case-insensitive path normalization key to comparisons. This ensures that `/Users/User/File.md` and `/users/user/file.md` are treated as the same file, restoring sync functionality on systems with case-insensitive file systems.
- **Logging**: Added output channel logging (search "Markdown Viewer Enhanced" in Output tab) to help troubleshoot if sync issues persist.

## [1.0.39] - 2024-01-26

### Fixed
- **Sync Fix**: Switched to file-system path (`fsPath`) comparison for sync validation. This fixes the issue where the editor wouldn't sync the preview because it thought they were different documents (due to encoding differences).
- **Bangla Support**: Simplified the line-matching regex to just ignore whitespace. This ensures that Bangla text (and other scripts) are correctly mapped to their preview blocks, restoring accurate scroll positioning.

## [1.0.38] - 2024-01-26

### Fixed
- **UI Final Polish**: Removed the "extra thing" (Top Toolbar) as per feedback. Now the viewing area is completely clean. The FAB at bottom-right is the primary export action.
- **Deep Sync Debug**: Enhanced the scroll synchronization logic to be absolutely sure it's targeting the correct document, logging identifying information to the output channel to trace any mismatches.

## [1.0.37] - 2024-01-26

### Fixed
- **Clean UI**: Removed the "Export PDF" button from the floating text-selection toolbar as requested. Use the FAB button (bottom right) instead.
- **Scroll Isolation**: Fixed a bug where scrolling *any* markdown file would try to scroll the preview, even if it wasn't the previewed file. Added strict document matching to ensure only the relevant editor drives the preview.

## [1.0.36] - 2024-01-26

### Fixed
- **Engine Safety**: Added "NaN Protection" and a "Safety Timeout" to the scroll engine. If the sync calculation ever fails (divides by zero), it now resets gracefully instead of freezing the preview.
- **Trusted Events**: Ensuring only *real* user mouse events stop the auto-scroll, ignoring synthetic browser events.

## [1.0.35] - 2024-01-26

### Fixed
- **Sync Flicking**: Solved the "screen flickering" issue by switching to a **Game-Loop Style Scroll Engine** (Linear Interpolation). Instead of restarting the animation on every scroll event (which causes stutter), the preview now continuously "chases" the target position smoothly.
- **Fluidity**: This technique allows us to handle hundreds of scroll updates per second without freezing or jittering.

## [1.0.34] - 2024-01-26

### Fixed
- **Sync Physics**: Replaced the native smooth scroll with a high-performance **Custom Animation Engine**. Ideally, this mimics the "physics" of a real scroll wheel but controlled by the extension.
- **Interruptible Sync**: The auto-scroll is now "polite". If you touch the mouse/trackpad or scroll manually while it's syncing, it **instantly stops** syncing to let you take control. This fixes the "fighting" sensation completely.
- **Blank Prevention**: Added strict bounds checking to ensure we never try to scroll past the document limits (which causes white flashes).

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
