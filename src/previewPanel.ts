import * as vscode from 'vscode';
import * as path from 'path';

import { exportToPdf } from './pdfExport';

export class PreviewPanel {
    public static currentPanel: PreviewPanel | undefined;

    // TIMESTAMP LOCK
    public static lastRemoteScrollTime = 0;

    private static readonly viewType = 'markdownViewerPreview';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    public _currentDocument: vscode.TextDocument | undefined;
    private _disposables: vscode.Disposable[] = [];
    private _lastScrollTime = 0;
    public static lastFormatTime = 0;

    public static get currentDocument(): vscode.TextDocument | undefined {
        return PreviewPanel.currentPanel ? PreviewPanel.currentPanel._currentDocument : undefined;
    }

    public static createOrShow(extensionUri: vscode.Uri, document: vscode.TextDocument) {
        const column = vscode.ViewColumn.Beside;
        if (PreviewPanel.currentPanel) {
            PreviewPanel.currentPanel._panel.reveal(column);
            if (PreviewPanel.currentPanel._currentDocument?.fileName !== document.fileName) {
                PreviewPanel.currentPanel._currentDocument = document;
                PreviewPanel.currentPanel._update();
            }
            return;
        }
        // Include document's directory in localResourceRoots for relative image paths
        const docDir = document ? vscode.Uri.file(path.dirname(document.uri.fsPath)) : null;
        const resourceRoots = [vscode.Uri.joinPath(extensionUri, 'media')];
        if (docDir) { resourceRoots.push(docDir); }

        const panel = vscode.window.createWebviewPanel(
            PreviewPanel.viewType,
            'Markdown Preview',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: resourceRoots
            }
        );
        PreviewPanel.currentPanel = new PreviewPanel(panel, extensionUri, document);
    }

    public static updateContent(document: vscode.TextDocument) {
        if (PreviewPanel.currentPanel) {
            // Always update for the current document (that's the whole point of live preview!)
            if (PreviewPanel.currentPanel._currentDocument?.uri.toString() === document.uri.toString()) {
                // Use incremental update to preserve scroll position
                PreviewPanel.currentPanel._updateContentOnly();
                return;
            }
            // Only switch documents if different - needs full HTML replacement
            PreviewPanel.currentPanel._currentDocument = document;
            PreviewPanel.currentPanel._update();
        }
    }

    public static syncScroll(line: number, totalLines?: number, endLine?: number) {
        if (PreviewPanel.currentPanel) {
            PreviewPanel.currentPanel._panel.webview.postMessage({ type: 'scrollTo', line: line, totalLines: totalLines, endLine: endLine })
                .then(success => { });
        }
    }

    public static dispose() {
        if (PreviewPanel.currentPanel) {
            PreviewPanel.currentPanel._panel.dispose();
        }
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, document: vscode.TextDocument) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._currentDocument = document;
        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'alert':
                        vscode.window.showInformationMessage(message.text);
                        return;
                    case 'error':
                        vscode.window.showErrorMessage(`Preview Error: ${message.text}`);
                        return;
                    case 'applyFormat':
                        this._applyFormat(message.format, message.selectedText, message.sourceLine, message.blockContext || '', message.blockOccurrenceIndex || 0, message.globalOccurrenceIndex ?? -1);
                        return;
                    case 'exportPdf':
                        if (this._currentDocument) {
                            exportToPdf(this._extensionUri, this._currentDocument);
                        } else {
                            vscode.window.showWarningMessage('No document to export. Please open a Markdown file.');
                        }
                        return;
                    case 'revealLine':
                        // Skip during formatting to prevent scroll jumps
                        if (Date.now() - PreviewPanel.lastFormatTime < 1000) return;
                        if (Date.now() - this._lastScrollTime > 50) {
                            this._revealLineInEditor(message.line);
                            this._lastScrollTime = Date.now();
                        }
                        return;
                    case 'undo':
                        this._focusEditorAndExecute('undo');
                        return;
                    case 'redo':
                        this._focusEditorAndExecute('redo');
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private _revealLineInEditor(line: number) {
        if (!this._currentDocument) return;
        const editor = vscode.window.visibleTextEditors.find(
            e => e.document.uri.toString() === this._currentDocument?.uri.toString()
        );
        if (editor) {
            // SET LOCK TIMESTAMP
            PreviewPanel.lastRemoteScrollTime = Date.now();
            const range = new vscode.Range(line, 0, line, 0);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        }
    }

    private async _focusEditorAndExecute(command: string) {
        if (!this._currentDocument) return;
        const editor = vscode.window.visibleTextEditors.find(
            e => e.document.uri.toString() === this._currentDocument?.uri.toString()
        );
        if (editor) {
            // Focus the editor first
            await vscode.window.showTextDocument(editor.document, editor.viewColumn, false);
            // Then execute the command
            await vscode.commands.executeCommand(command);
            // Return focus to preview
            this._panel.reveal(undefined, true);
        }
    }

    public dispose() {
        PreviewPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _applyFormat(format: string, selectedText: string, sourceLine: number = -1, blockContext: string = '', blockOccurrenceIndex: number = 0, globalOccurrenceIndex: number = -1) {
        if (!this._currentDocument) {
            vscode.window.showWarningMessage('No active document found.');
            return;
        }
        const editor = vscode.window.visibleTextEditors.find(
            e => e.document.uri.toString() === this._currentDocument?.uri.toString()
        );
        if (!editor || !selectedText) {
            if (format === 'exportPdf') {
                exportToPdf(this._extensionUri, this._currentDocument);
                return;
            }
            vscode.window.showWarningMessage('Editor not found or no text selected.');
            return;
        }
        const document = editor.document;

        // Strategy: Find ALL lines that match blockContext, then pick the Nth one
        let startPos: vscode.Position = new vscode.Position(0, 0);
        let endPos: vscode.Position = new vscode.Position(0, 0);
        let foundLine = -1;

        console.log(`[applyFormat] Looking for "${selectedText.substring(0, 30)}..." textOccurrenceIndex=${blockOccurrenceIndex} blockContext: "${blockContext.substring(0, 50)}..."`);

        // Normalize text for comparison (remove markdown formatting AND list markers)
        const normalizeText = (text: string): string => {
            return text
                .replace(/==/g, '')  // Remove highlight markers
                .replace(/\*\*/g, '') // Remove bold markers
                .replace(/<mark[^>]*>/g, '').replace(/<\/mark>/g, '') // Remove mark tags
                .trim();
        };

        // NEW APPROACH: Find ALL occurrences of selectedText in the document
        // Each occurrence is tracked with its line number and character position
        interface TextOccurrence {
            line: number;
            charStart: number;
            isWrapped?: string; // '==' or '**' if wrapped
        }
        const allOccurrences: TextOccurrence[] = [];

        // Patterns to search for (wrapped and unwrapped versions)
        const highlightWrapped = `==${selectedText}==`;
        const boldWrapped = `**${selectedText}**`;

        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            let searchPos = 0;

            // First, find wrapped occurrences (for toggle detection)
            while (true) {
                const highlightIdx = lineText.indexOf(highlightWrapped, searchPos);
                if (highlightIdx !== -1) {
                    allOccurrences.push({
                        line: i,
                        charStart: highlightIdx + 2, // Position AFTER opening ==
                        isWrapped: '=='
                    });
                    searchPos = highlightIdx + highlightWrapped.length;
                    continue;
                }
                const boldIdx = lineText.indexOf(boldWrapped, searchPos);
                if (boldIdx !== -1) {
                    allOccurrences.push({
                        line: i,
                        charStart: boldIdx + 2, // Position AFTER opening **
                        isWrapped: '**'
                    });
                    searchPos = boldIdx + boldWrapped.length;
                    continue;
                }
                break;
            }

            // Then find unwrapped occurrences
            searchPos = 0;
            while (true) {
                const plainIdx = lineText.indexOf(selectedText, searchPos);
                if (plainIdx === -1) break;

                // Check if this occurrence is actually part of a wrapped version
                // (we already captured those above)
                const beforeChars = lineText.substring(Math.max(0, plainIdx - 2), plainIdx);
                const afterChars = lineText.substring(plainIdx + selectedText.length, plainIdx + selectedText.length + 2);

                const isPartOfHighlight = beforeChars === '==' && afterChars === '==';
                const isPartOfBold = beforeChars === '**' && afterChars === '**';

                if (!isPartOfHighlight && !isPartOfBold) {
                    allOccurrences.push({
                        line: i,
                        charStart: plainIdx
                    });
                }
                searchPos = plainIdx + selectedText.length;
            }
        }

        console.log(`[applyFormat] Found ${allOccurrences.length} total occurrences of "${selectedText.substring(0, 20)}..."`);

        // Sort by document order (line, then character position) to match preview text order.
        // Without this, wrapped occurrences could appear before plain ones on the same line.
        allOccurrences.sort((a, b) => a.line !== b.line ? a.line - b.line : a.charStart - b.charStart);

        allOccurrences.forEach((occ, idx) => {
            console.log(`[applyFormat]   Occurrence ${idx}: line ${occ.line}, char ${occ.charStart}, wrapped=${occ.isWrapped || 'none'}`);
        });

        // Pick the correct occurrence using multiple strategies
        if (allOccurrences.length > 0) {
            let matchedOccurrence: TextOccurrence | null = null;

            // PRIORITY 0 (HIGHEST): Use globalOccurrenceIndex if available
            // This is calculated from the selection's position in the preview DOM
            // and directly maps to the Nth occurrence in document order
            if (globalOccurrenceIndex >= 0 && globalOccurrenceIndex < allOccurrences.length) {
                matchedOccurrence = allOccurrences[globalOccurrenceIndex];
                console.log(`[applyFormat] Matched by globalOccurrenceIndex ${globalOccurrenceIndex} on line ${matchedOccurrence.line}`);
            }

            // PRIORITY 1: Use blockContext to find the matching line
            // Each list item has unique labels (ক, খ, গ), so we match by full block text
            if (blockContext && blockContext.length > 5) {
                const normalizedBlockContext = blockContext.replace(/\s+/g, '').toLowerCase();
                // Collect ALL blockContext matches first
                const blockContextMatches: TextOccurrence[] = [];
                for (const occ of allOccurrences) {
                    const lineText = document.lineAt(occ.line).text;
                    const normalizedLine = lineText.replace(/\s+/g, '').toLowerCase();
                    // Check if line contains key parts of block context (excluding common text)
                    if (normalizedBlockContext.includes(normalizedLine) || normalizedLine.includes(normalizedBlockContext.substring(0, 20))) {
                        blockContextMatches.push(occ);
                    }
                }
                // Only use blockContext if it uniquely identifies ONE occurrence
                if (blockContextMatches.length === 1) {
                    matchedOccurrence = blockContextMatches[0];
                    console.log(`[applyFormat] Matched uniquely by blockContext on line ${matchedOccurrence.line}`);
                } else if (blockContextMatches.length > 1) {
                    console.log(`[applyFormat] blockContext matched ${blockContextMatches.length} occurrences, disambiguating...`);
                    // Multiple matches — try to use sourceLine to disambiguate within them
                    if (sourceLine >= 0) {
                        const sourceMatch = blockContextMatches.find(occ => occ.line === sourceLine);
                        if (sourceMatch) {
                            matchedOccurrence = sourceMatch;
                            console.log(`[applyFormat] Disambiguated by sourceLine ${sourceLine} among ${blockContextMatches.length} blockContext matches`);
                        }
                    }
                    // If sourceLine didn't help, use blockOccurrenceIndex within blockContextMatches
                    if (!matchedOccurrence) {
                        const targetIdx = Math.min(blockOccurrenceIndex, blockContextMatches.length - 1);
                        matchedOccurrence = blockContextMatches[targetIdx];
                        console.log(`[applyFormat] Used blockOccurrenceIndex ${targetIdx} among ${blockContextMatches.length} blockContext matches`);
                    }
                }
            }

            // PRIORITY 2: If sourceLine is known, prefer an occurrence on that exact line
            if (!matchedOccurrence && sourceLine >= 0) {
                const occurrencesOnSourceLine = allOccurrences.filter(occ => occ.line === sourceLine);
                if (occurrencesOnSourceLine.length > 0) {
                    matchedOccurrence = occurrencesOnSourceLine[0];
                    console.log(`[applyFormat] Matched by sourceLine ${sourceLine}`);
                }
            }

            // PRIORITY 3: Fall back to blockOccurrenceIndex
            if (!matchedOccurrence) {
                const targetIdx = Math.min(blockOccurrenceIndex, allOccurrences.length - 1);
                matchedOccurrence = allOccurrences[targetIdx];
                console.log(`[applyFormat] Fallback to occurrence #${targetIdx}`);
            }

            foundLine = matchedOccurrence.line;
            startPos = new vscode.Position(foundLine, matchedOccurrence.charStart);
            endPos = new vscode.Position(foundLine, matchedOccurrence.charStart + selectedText.length);

            const lineText = document.lineAt(foundLine).text;
            console.log(`[applyFormat] Selected occurrence on line ${foundLine}: "${lineText.substring(0, 50)}..."`);
        }

        if (foundLine === -1) {
            if (format === 'exportPdf') {
                exportToPdf(this._extensionUri, document);
                return;
            }
            vscode.window.showWarningMessage('Selected text not found in source.');
            return;
        }

        const range = new vscode.Range(startPos, endPos);
        const lineText = document.lineAt(startPos.line).text;
        const charStart = startPos.character;
        const charEnd = endPos.character;

        console.log(`[applyFormat] === TOGGLE DEBUG ===`);
        console.log(`[applyFormat] lineText: "${lineText}"`);
        console.log(`[applyFormat] charStart=${charStart}, charEnd=${charEnd}`);
        console.log(`[applyFormat] before selection: "${lineText.substring(Math.max(0, charStart - 4), charStart)}"`);
        console.log(`[applyFormat] after selection: "${lineText.substring(charEnd, Math.min(lineText.length, charEnd + 4))}"`);

        // Helper function to check and toggle formatting - handles nested markers too
        const isWrappedWith = (marker: string): boolean => {
            const len = marker.length;
            if (charStart >= len && charEnd + len <= lineText.length) {
                const before = lineText.substring(charStart - len, charStart);
                const after = lineText.substring(charEnd, charEnd + len);
                console.log(`[applyFormat] isWrappedWith('${marker}'): before="${before}", after="${after}", match=${before === marker && after === marker}`);
                return before === marker && after === marker;
            }
            console.log(`[applyFormat] isWrappedWith('${marker}'): bounds check failed`);
            return false;
        };

        // Suppress scroll sync during formatting to prevent jumps
        PreviewPanel.lastFormatTime = Date.now();
        PreviewPanel.lastRemoteScrollTime = Date.now();

        // Check for ANY existing formatting and strip it when applying same format
        // Also prevent nesting same format
        let wrapper = '';
        switch (format) {
            case 'bold':
                wrapper = '**';
                // Toggle: if already bold, remove bold markers
                if (isWrappedWith('**')) {
                    console.log(`[applyFormat] TOGGLING OFF bold`);
                    const expandedRange = new vscode.Range(
                        new vscode.Position(startPos.line, charStart - 2),
                        new vscode.Position(startPos.line, charEnd + 2)
                    );
                    editor.edit(editBuilder => editBuilder.replace(expandedRange, selectedText));
                    return;
                }
                break;
            case 'highlight':
                wrapper = '==';
                // Toggle: if already highlighted, remove highlight markers
                if (isWrappedWith('==')) {
                    console.log(`[applyFormat] TOGGLING OFF highlight`);
                    const expandedRange = new vscode.Range(
                        new vscode.Position(startPos.line, charStart - 2),
                        new vscode.Position(startPos.line, charEnd + 2)
                    );
                    editor.edit(editBuilder => editBuilder.replace(expandedRange, selectedText));
                    return;
                }
                break;
            case 'red-highlight': {
                // Check if already has red highlight (HTML mark tag)
                const redMarkRegex = /<mark[^>]*style="[^"]*#ff6b6b[^"]*"[^>]*>$/;
                const textBefore = lineText.substring(0, charStart);
                const textAfter = lineText.substring(charEnd);
                const redMarkMatch = textBefore.match(redMarkRegex);
                if (redMarkMatch && textAfter.startsWith('</mark>')) {
                    // Toggle off: remove the mark tags
                    const expandedRange = new vscode.Range(
                        new vscode.Position(startPos.line, charStart - redMarkMatch[0].length),
                        new vscode.Position(startPos.line, charEnd + '</mark>'.length)
                    );
                    editor.edit(editBuilder => editBuilder.replace(expandedRange, selectedText));
                    return;
                }
                editor.edit(editBuilder => editBuilder.replace(range, `<mark style="background:#ff6b6b;color:#fff">${selectedText}</mark>`));
                return;
            }
            case 'delete':
                // Expand range to include surrounding formatting markers if present
                const lineTextForDelete = document.lineAt(startPos.line).text;
                let deleteStart = startPos.character;
                let deleteEnd = endPos.character;

                // Check for markdown formatting wrappers and expand the range
                // Check for == (highlight)
                if (deleteStart >= 2 && lineTextForDelete.substring(deleteStart - 2, deleteStart) === '==' &&
                    deleteEnd + 2 <= lineTextForDelete.length && lineTextForDelete.substring(deleteEnd, deleteEnd + 2) === '==') {
                    deleteStart -= 2;
                    deleteEnd += 2;
                }
                // Check for ** (bold) - after expanding for ==, check again for nested **
                if (deleteStart >= 2 && lineTextForDelete.substring(deleteStart - 2, deleteStart) === '**' &&
                    deleteEnd + 2 <= lineTextForDelete.length && lineTextForDelete.substring(deleteEnd, deleteEnd + 2) === '**') {
                    deleteStart -= 2;
                    deleteEnd += 2;
                }
                // Check again for outer == if we had **==text==**
                if (deleteStart >= 2 && lineTextForDelete.substring(deleteStart - 2, deleteStart) === '==' &&
                    deleteEnd + 2 <= lineTextForDelete.length && lineTextForDelete.substring(deleteEnd, deleteEnd + 2) === '==') {
                    deleteStart -= 2;
                    deleteEnd += 2;
                }

                // Check for <mark...>...</mark> HTML tags
                const markOpenRegex = /<mark[^>]*>$/;
                const markCloseRegex = /^<\/mark>/;
                const beforeText = lineTextForDelete.substring(0, deleteStart);
                const afterText = lineTextForDelete.substring(deleteEnd);
                const markOpenMatch = beforeText.match(markOpenRegex);
                if (markOpenMatch && markCloseRegex.test(afterText)) {
                    deleteStart -= markOpenMatch[0].length;
                    deleteEnd += '</mark>'.length;
                }

                const expandedDeleteRange = new vscode.Range(
                    new vscode.Position(startPos.line, deleteStart),
                    new vscode.Position(startPos.line, deleteEnd)
                );
                editor.edit(editBuilder => editBuilder.delete(expandedDeleteRange));
                return;
            case 'exportPdf':
                exportToPdf(this._extensionUri, document);
                return;
        }

        if (wrapper) {
            editor.edit(editBuilder => editBuilder.replace(range, `${wrapper}${selectedText}${wrapper}`));
        }
    }

    private _update() {
        this._panel.title = this._currentDocument ? `Preview: ${path.basename(this._currentDocument.fileName)}` : 'Markdown Preview';
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    }

    // Incremental update: sends content via postMessage to avoid full HTML replacement.
    // This preserves the webview DOM and scroll position perfectly.
    private _updateContentOnly() {
        if (!this._currentDocument) return;
        const content = this._currentDocument.getText();
        this._panel.webview.postMessage({ type: 'updateContent', content: content });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const content = this._currentDocument?.getText() || '';
        // Get document folder for resolving relative image paths
        const documentDir = this._currentDocument ? path.dirname(this._currentDocument.uri.fsPath) : '';
        const documentBaseUri = documentDir ? webview.asWebviewUri(vscode.Uri.file(documentDir)).toString() : '';

        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'preview.css'));
        const katexCss = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vendor', 'katex', 'katex.min.css'));
        const katexJs = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vendor', 'katex', 'katex.min.js'));
        const highlightCss = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vendor', 'github.min.css'));
        const highlightJs = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vendor', 'highlight.min.js'));
        const markedJs = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vendor', 'marked.min.js'));
        const githubCss = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vendor', 'github-markdown.css'));
        const escapedContent = this._escapeHtml(content);

        // THE FIX: Updated inline script to capture blockContext using closest()
        const inlineScript = `
        const vscode = acquireVsCodeApi();
        
        // ========== SCROLL POSITION PRESERVATION ==========
        const previousState = vscode.getState();
        let savedScrollTop = previousState ? previousState.scrollTop : 0;
        
        // ========== SCROLL SYNC STATE ==========
        let lastEditorScrollTime = 0;   // When we last received a scroll from editor
        let lastPreviewScrollTime = 0;  // When we last sent a scroll to editor
        let scrollDebounceTimer = null;
        
        // Get preview element - it should exist since script is at end of body
        const previewEl = document.getElementById('preview');
        
        if (!previewEl) {
            console.error('Preview element not found!');
        }
        
        // Restore scroll position
        if (previewEl && savedScrollTop > 0) {
            setTimeout(() => {
                lastEditorScrollTime = Date.now();
                previewEl.scrollTop = savedScrollTop;
            }, 50);
        }
        
        function saveScrollPosition() {
            if (previewEl) {
                vscode.setState({ scrollTop: previewEl.scrollTop });
            }
        }

        // Preview scroll handler - syncs preview scrolling back to editor
        function handlePreviewScroll(e) {
            saveScrollPosition();
            
            // If editor just scrolled us, don't sync back (prevents loop)
            if (Date.now() - lastEditorScrollTime < 300) {
                return;
            }
            
            // Debounce: only sync after scroll stops for 100ms
            if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer);
            scrollDebounceTimer = setTimeout(() => {
                // Throttle: don't send too frequently
                if (Date.now() - lastPreviewScrollTime < 100) return;
                lastPreviewScrollTime = Date.now();

                const elements = document.querySelectorAll('[data-line]');
                if (elements.length === 0) return;

                const scrollTop = previewEl.scrollTop;
                const viewHeight = previewEl.clientHeight;
                const scrollHeight = previewEl.scrollHeight;
                
                // Edge case: at bottom
                if (scrollTop + viewHeight >= scrollHeight - 10) {
                    const lastEl = elements[elements.length - 1];
                    const lastLine = parseInt(lastEl.getAttribute('data-line')) || 0;
                    vscode.postMessage({ type: 'revealLine', line: lastLine });
                    return;
                }
                
                // Edge case: at top
                if (scrollTop <= 10) {
                    vscode.postMessage({ type: 'revealLine', line: 0 });
                    return;
                }
                
                // Normal case: find element at center of view
                const centerY = scrollTop + (viewHeight / 2);
                let bestLine = -1;
                let minDist = Infinity;

                for (const el of elements) {
                    const elTop = el.offsetTop;
                    const dist = Math.abs(elTop - centerY);
                    if (dist < minDist) {
                        minDist = dist;
                        bestLine = parseInt(el.getAttribute('data-line'));
                    }
                }
                if (bestLine >= 0) {
                    vscode.postMessage({ type: 'revealLine', line: bestLine });
                }
            }, 100);
        }
        
        // Attach scroll listener
        if (previewEl) {
            previewEl.addEventListener('scroll', handlePreviewScroll, { passive: true });
        }

        // Handle scroll messages from editor
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'scrollTo') {
                const line = message.line;
                const totalLines = message.totalLines || 1;
                const endLine = message.endLine || line;
                const newTargetY = calculateTargetY(line, totalLines, endLine);
                
                if (!isNaN(newTargetY) && previewEl) {
                    lastEditorScrollTime = Date.now();
                    previewEl.scrollTo({ top: newTargetY, behavior: 'auto' });
                }
            }
        });

        function calculateTargetY(line, totalLines, endLine) {
            const viewHeight = previewEl ? previewEl.clientHeight : window.innerHeight;
            const scrollHeight = previewEl ? previewEl.scrollHeight : document.body.scrollHeight;
            const halfView = viewHeight / 2;
            
            // Edge case: near end of document (use endLine for accurate bottom detection)
            const effectiveEnd = endLine || line;
            if (totalLines && effectiveEnd >= totalLines - 5) {
                return scrollHeight - viewHeight;  // Scroll to bottom
            }
            
            // Edge case: at start
            if (line <= 1) {
                return 0;
            }
            
            // Try to find exact element
            const exactEl = document.querySelector(\`[data-line="\${line}"]\`);
            if (exactEl) {
                const target = exactEl.offsetTop - halfView + (exactEl.clientHeight / 2);
                return Math.max(0, Math.min(target, scrollHeight - viewHeight));
            }
            
            // Interpolate between known elements
            const elements = Array.from(document.querySelectorAll('[data-line]'));
            if (elements.length > 0) {
                const sorted = elements.map(el => ({
                    line: parseInt(el.getAttribute('data-line')),
                    top: el.offsetTop
                })).sort((a, b) => a.line - b.line);
                
                let before = null, after = null;
                for (const item of sorted) {
                    if (item.line <= line) before = item;
                    else { after = item; break; }
                }
                
                let target = 0;
                if (before && after) {
                    const ratio = (line - before.line) / (after.line - before.line);
                    target = before.top + (after.top - before.top) * ratio - halfView;
                } else if (before) {
                    // Line is BEYOND the last known data-line element.
                    // Use proportional extrapolation from the last element to the end.
                    const lastLine = sorted[sorted.length - 1];
                    if (totalLines && lastLine.line < totalLines) {
                        const remainingRatio = (line - lastLine.line) / (totalLines - lastLine.line);
                        const remainingScroll = scrollHeight - lastLine.top;
                        target = lastLine.top + remainingScroll * remainingRatio - halfView;
                    } else {
                        target = before.top - halfView;
                    }
                }
                return Math.max(0, Math.min(target, scrollHeight - viewHeight));
            }
            
            // Fallback: proportional scroll
            if (totalLines) {
                return Math.max(0, (line / totalLines) * scrollHeight);
            }
            return 0;
        }
        
        // ========== TOOLBAR LOGIC - FIXED TO CAPTURE BLOCKCONTEXT ==========
        document.addEventListener('mouseup', event => {
            const selection = window.getSelection();
            const toolbar = document.getElementById('floatingToolbar');
            if (selection && selection.toString().trim().length > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                toolbar.style.top = \`\${window.scrollY + rect.top - 50}px\`;
                toolbar.style.left = \`\${rect.left}px\`;
                toolbar.classList.add('visible');
                
                const selectedText = selection.toString();
                toolbar.dataset.selectedText = selectedText;
                
                // FIXED: Use closest() to find parent block element
                const startElem = range.startContainer.nodeType === 1 
                    ? range.startContainer 
                    : range.startContainer.parentElement;
                const blockElement = startElem ? startElem.closest('li, p, td, th, h1, h2, h3, h4, h5, h6') : null;
                const blockContext = blockElement ? blockElement.textContent || '' : '';
                
                // Find closest element with data-line attribute
                const lineElement = startElem ? startElem.closest('[data-line]') : null;
                const lineNumber = lineElement ? parseInt(lineElement.getAttribute('data-line'), 10) : -1;
                
                toolbar.dataset.blockContext = blockContext;
                toolbar.dataset.sourceLine = lineNumber;
                
                // GLOBAL OCCURRENCE INDEX: Count which occurrence of selectedText
                // this is across the ENTIRE preview DOM. This works even when
                // duplicate lines are inside a single <p> (breaks: true).
                let globalOccIdx = 0;
                try {
                    const previewRoot = document.getElementById('preview');
                    if (previewRoot && selectedText) {
                        // Create a range from start of preview to start of selection
                        const preRange = document.createRange();
                        preRange.setStart(previewRoot, 0);
                        preRange.setEnd(range.startContainer, range.startOffset);
                        const textBeforeSelection = preRange.toString();
                        
                        // Count how many times selectedText appears before our selection
                        let searchFrom = 0;
                        while (true) {
                            const idx = textBeforeSelection.indexOf(selectedText, searchFrom);
                            if (idx === -1) break;
                            globalOccIdx++;
                            searchFrom = idx + selectedText.length;
                        }
                    }
                } catch (err) {
                    console.error('[webview] Error calculating globalOccurrenceIndex:', err);
                    globalOccIdx = 0;
                }
                toolbar.dataset.globalOccurrenceIndex = globalOccIdx;
                
                // Also keep sibling-based counting as fallback
                let textOccurrenceIndex = 0;
                try {
                    if (selectedText && blockElement) {
                        let sibling = blockElement.previousElementSibling;
                        while (sibling) {
                            const sibText = sibling.textContent || '';
                            if (sibText.includes(selectedText)) {
                                textOccurrenceIndex++;
                            }
                            sibling = sibling.previousElementSibling;
                        }
                    }
                } catch (err) {
                    textOccurrenceIndex = 0;
                }
                toolbar.dataset.blockOccurrenceIndex = textOccurrenceIndex;
                
                console.log('[webview] Selection: block=' + (blockElement ? blockElement.tagName : 'null') + ', context="' + blockContext.substring(0, 50) + '...", line=' + lineNumber + ', globalOccIdx=' + globalOccIdx + ', siblingIdx=' + textOccurrenceIndex);
            } else {
                if (!toolbar.contains(event.target)) toolbar.classList.remove('visible');
            }
        });
        
        function applyToolbarFormat(format) {
            const toolbar = document.getElementById('floatingToolbar');
            const selectedText = toolbar.dataset.selectedText || '';
            const blockContext = toolbar.dataset.blockContext || '';
            const sourceLine = parseInt(toolbar.dataset.sourceLine || '-1', 10);
            const blockOccurrenceIndex = parseInt(toolbar.dataset.blockOccurrenceIndex || '0', 10);
            const globalOccurrenceIndex = parseInt(toolbar.dataset.globalOccurrenceIndex || '-1', 10);
            
            if (selectedText) {
                vscode.postMessage({ 
                    type: 'applyFormat', 
                    format: format, 
                    selectedText: selectedText,
                    blockContext: blockContext,
                    sourceLine: sourceLine,
                    blockOccurrenceIndex: blockOccurrenceIndex,
                    globalOccurrenceIndex: globalOccurrenceIndex
                });
                toolbar.classList.remove('visible');
                window.getSelection().removeAllRanges();
            }
        }
        function exportPdf() { vscode.postMessage({ type: 'exportPdf' }); }
        
        document.getElementById('boldBtn').onclick = () => applyToolbarFormat('bold');
        document.getElementById('highlightBtn').onclick = () => applyToolbarFormat('highlight');
        document.getElementById('redHighlightBtn').onclick = () => applyToolbarFormat('red-highlight');
        document.getElementById('deleteBtn').onclick = () => applyToolbarFormat('delete');
        document.querySelector('.fab-export').onclick = () => exportPdf();
        
        // ========== KEYBOARD SHORTCUTS (UNDO/REDO) ==========
        // Capture Cmd+Z and Cmd+Shift+Z to trigger undo/redo in the editor
        document.addEventListener('keydown', (e) => {
            // Check for Cmd (Mac) or Ctrl (Windows/Linux)
            const isMod = e.metaKey || e.ctrlKey;
            
            if (isMod && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    // Cmd+Shift+Z = Redo
                    vscode.postMessage({ type: 'redo' });
                } else {
                    // Cmd+Z = Undo
                    vscode.postMessage({ type: 'undo' });
                }
            }
            
            // Also support Cmd+Y for redo (Windows style)
            if (isMod && e.key === 'y') {
                e.preventDefault();
                vscode.postMessage({ type: 'redo' });
            }
        });
        `;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data: file:;">
    <title>Markdown Preview</title>
    <link rel="stylesheet" href="${katexCss}">
    <script src="${katexJs}"></script>
    <link rel="stylesheet" href="${highlightCss}">
    <script src="${highlightJs}"></script>
    <script src="${markedJs}"></script>
    <link rel="stylesheet" href="${githubCss}">
    <link rel="stylesheet" href="${styleUri}">
    <style>
        .markdown-body { box-sizing: border-box; min-width: 200px; max-width: 980px; margin: 0 auto; padding: 45px; }
        @media (max-width: 767px) { .markdown-body { padding: 15px; } }
        .fab-export {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 50px;
            height: 50px;
            border-radius: 25px;
            background-color: #007acc;
            color: white;
            border: none;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            cursor: pointer;
            z-index: 1000;
            transition: transform 0.2s;
        }
        .fab-export:hover { transform: scale(1.1); background-color: #005f9e; }
    </style>
</head>
<body>
    <button class="fab-export" onclick="exportPdf()" title="Export to PDF">📄</button>

    <div class="markdown-body preview-content" id="preview"></div>
    <div class="floating-toolbar" id="floatingToolbar">
        <button id="boldBtn" title="Bold"><b>B</b></button>
        <button id="highlightBtn" title="Yellow Highlight"><span style="display:inline-block;width:14px;height:14px;background:#ffff00;border-radius:50%"></span></button>
        <button id="redHighlightBtn" title="Red Highlight"><span style="display:inline-block;width:14px;height:14px;background:#ff6b6b;border-radius:50%"></span></button>
        <button id="deleteBtn" title="Delete">🗑️</button>
    </div>
    <script id="markdown-content" type="text/plain">${escapedContent}</script>
    <script>
        ${inlineScript}
    </script>
    <script>
        function _inlineAddLineAttributes(sourceLines) {
            const preview = document.getElementById('preview');
            const usedLines = new Set();
            
            // Normalize text for comparison (remove markdown syntax, whitespace)
            function normalize(text) {
                return (text || '')
                    .replace(/[*_=~\`#\\[\\]()]/g, '')  // Remove markdown chars
                    .replace(/\\s+/g, '')              // Remove whitespace
                    .toLowerCase()
                    .substring(0, 50);                 // Only compare first 50 chars
            }
            
            // Build a map of normalized source lines for quick lookup
            const sourceMap = sourceLines.map((line, idx) => ({
                idx: idx,
                raw: line,
                norm: normalize(line)
            }));
            
            // Get all block elements that should have data-line
            const blockElements = preview.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote > p, pre, .katex-display, table, .emoji-warning');
            
            // Track our position in source as we go through elements
            let searchStartIdx = 0;
            
            blockElements.forEach(el => {
                const elText = el.textContent || '';
                const normElText = normalize(elText);
                
                // Skip very short elements
                if (normElText.length < 2) return;
                
                // Search forward from our last position (not from 0)
                // This maintains document order and prevents wrong matches
                let bestMatch = -1;
                let bestScore = 0;
                
                for (let i = searchStartIdx; i < sourceMap.length; i++) {
                    if (usedLines.has(i)) continue;
                    
                    const srcNorm = sourceMap[i].norm;
                    if (srcNorm.length < 2) continue;
                    
                    // Calculate match score
                    let score = 0;
                    if (srcNorm === normElText) {
                        score = 100;  // Perfect match
                    } else if (srcNorm.includes(normElText) || normElText.includes(srcNorm)) {
                        // Partial match - score based on overlap
                        const overlap = Math.min(srcNorm.length, normElText.length);
                        score = overlap;
                    }
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = i;
                        
                        // If perfect match, stop searching
                        if (score === 100) break;
                    }
                    
                    // Don't search too far ahead (within 20 lines)
                    if (i - searchStartIdx > 20 && bestMatch !== -1) break;
                }
                
                if (bestMatch !== -1 && bestScore >= 3) {
                    el.setAttribute('data-line', bestMatch);
                    usedLines.add(bestMatch);
                    // Move search start forward
                    searchStartIdx = bestMatch + 1;
                }
            });
            
            // Fallback: assign evenly distributed line numbers to unmatched elements
            const unmatched = Array.from(blockElements).filter(el => !el.hasAttribute('data-line'));
            if (unmatched.length > 0 && sourceLines.length > 0) {
                const step = Math.max(1, Math.floor(sourceLines.length / unmatched.length));
                let line = 0;
                unmatched.forEach((el, idx) => {
                    while (usedLines.has(line) && line < sourceLines.length) line++;
                    if (line < sourceLines.length) {
                        el.setAttribute('data-line', line);
                        usedLines.add(line);
                        line += step;
                    }
                });
            }
        }

        const renderer = new marked.Renderer();
        renderer.text = function(token) {
            let text = token.text || token;
            if (typeof text === 'string') {
                text = text.replace(/==([^=]+)==/g, '<mark>$1</mark>');
                text = text.replace(/::([^:]+)::/g, '<mark class="red-highlight">$1</mark>');
            }
            return text;
        };
        
        renderer.blockquote = function(quote) {
            const match = quote.match(/^<p>\\s*\\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\\]\\s*/i);
            if (match) {
                const type = match[1].toLowerCase();
                const title = type.charAt(0).toUpperCase() + type.slice(1);
                const content = quote.replace(/^<p>\\s*\\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\\]\\s*/i, '<p>');
                return \`<div class="markdown-alert markdown-alert-\${type}"><p class="markdown-alert-title">\${title}</p>\${content}</div>\`;
            }
            return \`<blockquote>\${quote}</blockquote>\`;
        };
        
        marked.setOptions({
            renderer: renderer,
            gfm: true,
            breaks: true,
            highlight: function(code, lang) {
                if (lang && hljs.getLanguage(lang)) {
                    try { return hljs.highlight(code, { language: lang }).value; } catch (e) {}
                }
                return hljs.highlightAuto(code).value;
            }
        });

        function renderMarkdown(text) {
            const mathBlocks = []; 
            const inlineMath = [];
            text = text.replace(/\\$\\$([^$]+)\\$\\$/g, (m, math) => { mathBlocks.push(math); return \`%%MATHBLOCK\${mathBlocks.length-1}%%\`; });
            text = text.replace(/\\$([^$\\n]+)\\$/g, (m, math) => { inlineMath.push(math); return \`%%INLINEMATH\${inlineMath.length-1}%%\`; });
            
            let html = marked.parse(text);
            html = html.replace(/%%MATHBLOCK(\\d+)%%/g, (m, i) => {
                try { return katex.renderToString(mathBlocks[parseInt(i)], { displayMode: true, throwOnError: false }); } catch(e) { return m; }
            });
            html = html.replace(/%%INLINEMATH(\\d+)%%/g, (m, i) => {
                try { return katex.renderToString(inlineMath[parseInt(i)], { displayMode: false, throwOnError: false }); } catch(e) { return m; }
            });
            return html;
        }

        const raw = ${JSON.stringify(content)};
        const documentBaseUri = "${documentBaseUri}";
        document.getElementById('preview').innerHTML = renderMarkdown(raw);
        
        // Fix relative image paths
        if (documentBaseUri) {
            document.querySelectorAll('#preview img').forEach(img => {
                const src = img.getAttribute('src');
                if (src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:') && !src.startsWith('vscode-')) {
                    img.setAttribute('src', documentBaseUri + '/' + src);
                }
            });
        }
        
        _inlineAddLineAttributes(raw.split(new RegExp('\\n')));
        
        // Handle incremental content updates (preserves scroll position)
        window.addEventListener('message', function(event) {
            const message = event.data;
            if (message.type === 'updateContent') {
                // Suppress scroll echo during re-render
                lastEditorScrollTime = Date.now();
                
                const newRaw = message.content;
                document.getElementById('preview').innerHTML = renderMarkdown(newRaw);
                
                // Fix relative image paths
                if (documentBaseUri) {
                    document.querySelectorAll('#preview img').forEach(function(img) {
                        const src = img.getAttribute('src');
                        if (src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:') && !src.startsWith('vscode-')) {
                            img.setAttribute('src', documentBaseUri + '/' + src);
                        }
                    });
                }
                
                _inlineAddLineAttributes(newRaw.split(new RegExp('\\n')));
                
                // Save scroll state
                if (previewEl) {
                    vscode.setState({ scrollTop: previewEl.scrollTop });
                }
            }
        });
    </script>
</body>
</html>`;
    }

    private _escapeHtml(text: string): string {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
}
