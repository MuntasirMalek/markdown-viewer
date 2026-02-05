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
        const panel = vscode.window.createWebviewPanel(
            PreviewPanel.viewType,
            'Markdown Preview',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );
        PreviewPanel.currentPanel = new PreviewPanel(panel, extensionUri, document);
    }

    public static updateContent(document: vscode.TextDocument) {
        if (PreviewPanel.currentPanel) {
            // Always update for the current document (that's the whole point of live preview!)
            if (PreviewPanel.currentPanel._currentDocument?.uri.toString() === document.uri.toString()) {
                PreviewPanel.currentPanel._update();
                return;
            }
            // Only switch documents if different
            PreviewPanel.currentPanel._currentDocument = document;
            PreviewPanel.currentPanel._update();
        }
    }

    public static syncScroll(line: number, totalLines?: number) {
        if (PreviewPanel.currentPanel) {
            PreviewPanel.currentPanel._panel.webview.postMessage({ type: 'scrollTo', line: line, totalLines: totalLines })
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
                        this._applyFormat(message.format, message.selectedText, message.sourceLine, message.blockContext || '', message.blockOccurrenceIndex || 0);
                        return;
                    case 'exportPdf':
                        if (this._currentDocument) {
                            exportToPdf(this._extensionUri, this._currentDocument);
                        } else {
                            vscode.window.showWarningMessage('No document to export. Please open a Markdown file.');
                        }
                        return;
                    case 'revealLine':
                        if (Date.now() - this._lastScrollTime > 50) {
                            this._revealLineInEditor(message.line);
                            this._lastScrollTime = Date.now();
                        }
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

    private _applyFormat(format: string, selectedText: string, sourceLine: number = -1, blockContext: string = '', blockOccurrenceIndex: number = 0) {
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
        allOccurrences.forEach((occ, idx) => {
            console.log(`[applyFormat]   Occurrence ${idx}: line ${occ.line}, char ${occ.charStart}, wrapped=${occ.isWrapped || 'none'}`);
        });

        // Pick the correct occurrence using multiple strategies
        if (allOccurrences.length > 0) {
            let matchedOccurrence: TextOccurrence | null = null;

            // PRIORITY 1: Use blockContext to find the matching line
            // Each list item has unique labels (ক, খ, গ), so we match by full block text
            if (blockContext && blockContext.length > 5) {
                const normalizedBlockContext = blockContext.replace(/\s+/g, '').toLowerCase();
                for (const occ of allOccurrences) {
                    const lineText = document.lineAt(occ.line).text;
                    const normalizedLine = lineText.replace(/\s+/g, '').toLowerCase();
                    // Check if line contains key parts of block context (excluding common text)
                    if (normalizedBlockContext.includes(normalizedLine) || normalizedLine.includes(normalizedBlockContext.substring(0, 20))) {
                        matchedOccurrence = occ;
                        console.log(`[applyFormat] Matched by blockContext on line ${occ.line}`);
                        break;
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

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const content = this._currentDocument?.getText() || '';
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
        
        // ========== VISUAL DEBUG MODE ==========
        const DEBUG = false;
        const debugEl = document.createElement('div');
        debugEl.id = 'debug-overlay';
        debugEl.style.cssText = 'position:fixed;bottom:10px;left:10px;background:rgba(0,0,0,0.85);color:#0f0;font-family:monospace;font-size:11px;padding:8px 12px;border-radius:6px;z-index:9999;max-width:350px;max-height:200px;overflow:auto;';
        debugEl.innerHTML = 'DEBUG: Loading...';
        if (DEBUG) document.body.appendChild(debugEl);
        
        function debugLog(msg) {
            if (!DEBUG) return;
            const time = new Date().toLocaleTimeString();
            debugEl.innerHTML = '[' + time + '] ' + msg + '<br>' + debugEl.innerHTML;
            if (debugEl.children.length > 15) debugEl.lastChild.remove();
        }

        window.onerror = function(message, source, lineno, colno, error) {
            vscode.postMessage({ type: 'error', text: \`\${message} at line \${lineno}\` });
            debugLog('❌ ERROR: ' + message);
        };

        let ignoreSyncUntil = 0; 
        let lastSyncSend = 0;
        
        const previewEl = document.getElementById('preview');
        debugLog('previewEl found: ' + !!previewEl);
        
        if (previewEl && savedScrollTop > 0) {
            setTimeout(() => {
                previewEl.scrollTop = savedScrollTop;
                debugLog('🔄 Restored scroll: ' + savedScrollTop);
            }, 50);
        }
        
        function saveScrollPosition() {
            if (previewEl) {
                vscode.setState({ scrollTop: previewEl.scrollTop });
            }
        }

        const scrollHandler = (e) => {
            if (Date.now() < ignoreSyncUntil) {
                debugLog('⏸️ Scroll ignored (lockout)');
                return;
            }

            const now = Date.now();
            if (now - lastSyncSend < 50) return; 
            lastSyncSend = now;

            const elements = document.querySelectorAll('[data-line]');
            debugLog('📜 Scroll! data-line elements: ' + elements.length);
            if (elements.length === 0) return;

            const scrollTop = previewEl ? previewEl.scrollTop : 0;
            const viewHeight = previewEl ? previewEl.clientHeight : window.innerHeight;
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
                debugLog('➡️ Sending revealLine: ' + bestLine);
                vscode.postMessage({ type: 'revealLine', line: bestLine });
            }
        };

        if (previewEl) {
            previewEl.addEventListener('scroll', (e) => {
                saveScrollPosition();
                scrollHandler(e);
            }, { passive: true });
            debugLog('✅ Scroll listener attached to #preview');
        } else {
            debugLog('❌ #preview NOT FOUND!');
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'scrollTo') {
                debugLog('⬅️ Received scrollTo: line ' + message.line);
                const line = message.line;
                const newTargetY = calculateTargetY(line, message.totalLines);
                debugLog('📍 Target Y: ' + Math.round(newTargetY));
                if (!isNaN(newTargetY) && previewEl) {
                    ignoreSyncUntil = Date.now() + 200;
                    previewEl.scrollTo({ top: newTargetY, behavior: 'auto' });
                }
            }
        });

        function calculateTargetY(line, totalLines) {
            const viewHeight = previewEl ? previewEl.clientHeight : window.innerHeight;
            const halfView = viewHeight / 2;
            
            const exactEl = document.querySelector(\`[data-line="\${line}"]\`);
            if (exactEl) {
                 const target = exactEl.offsetTop - halfView + (exactEl.clientHeight / 2);
                 return Math.max(0, target);
            }
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
                      target = before.top - halfView;
                 }
                 return Math.max(0, target);
            } else if (totalLines) {
                 return Math.max(0, (line / totalLines) * (previewEl ? previewEl.scrollHeight : document.body.scrollHeight));
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
                
                console.log('[webview] Selection: block=' + (blockElement ? blockElement.tagName : 'null') + ', context="' + blockContext.substring(0, 50) + '...", line=' + lineNumber);
            } else {
                if (!toolbar.contains(event.target)) toolbar.classList.remove('visible');
            }
        });
        
        function applyToolbarFormat(format) {
            const toolbar = document.getElementById('floatingToolbar');
            const selectedText = toolbar.dataset.selectedText || '';
            const blockContext = toolbar.dataset.blockContext || '';
            const sourceLine = parseInt(toolbar.dataset.sourceLine || '-1', 10);
            
            if (selectedText) {
                vscode.postMessage({ 
                    type: 'applyFormat', 
                    format: format, 
                    selectedText: selectedText,
                    blockContext: blockContext,
                    sourceLine: sourceLine
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
        `;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:;">
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
        .emoji-warning {
            display: inline-block;
            width: 95%; 
            background-color: #f1f1f1; 
            color: #24292e;
            padding: 8px 12px;
            border-left: 4px solid #f1f1f1; 
            border-radius: 0 2px 2px 0;
            margin: 4px 0;
            white-space: normal;
        }
        .emoji-warning-icon { margin-right: 6px; }
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
            const blockElements = preview.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote > p, pre, .katex-display, table, .emoji-warning');
            blockElements.forEach(el => {
                const elText = el.textContent.trim();
                const cleanElText = elText.replace(/\\s+/g, '');
                if (cleanElText.length < 2) return;

                for (let i = 0; i < sourceLines.length; i++) {
                     if (usedLines.has(i)) continue;
                     const srcLine = sourceLines[i];
                     const cleanSrcLine = srcLine.replace(/\\s+/g, '');
                     
                     if (cleanSrcLine.includes(cleanElText) || cleanElText.includes(cleanSrcLine)) {
                         el.setAttribute('data-line', i);
                         usedLines.add(i);
                         break;
                     }
                }
            });
        }

        const renderer = new marked.Renderer();
        renderer.text = function(token) {
            let text = token.text || token;
            if (typeof text === 'string') {
                text = text.replace(/==([^=]+)==/g, '<mark>$1</mark>');
                text = text.replace(/::([^:]+)::/g, '<mark class="red-highlight">$1</mark>');
                if (text.includes('⚠️')) {
                     text = text.replace(/(⚠️)(\\s*[^<\\n]+)/g, '<span class="emoji-warning">$1 $2</span>');
                }
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
            
            text = text.replace(/==([^=]+)==/g, '<mark>$1</mark>');
            
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
        document.getElementById('preview').innerHTML = renderMarkdown(raw);
        
        _inlineAddLineAttributes(raw.split('\\n'));
    </script>
</body>
</html>`;
    }

    private _escapeHtml(text: string): string {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
}
