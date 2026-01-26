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
            if (PreviewPanel.currentPanel._currentDocument?.uri.toString() === document.uri.toString()) {
                return;
            }
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
                        this._applyFormat(message.format, message.selectedText);
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

    private _applyFormat(format: string, selectedText: string) {
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
        const index = document.getText().indexOf(selectedText);
        if (index === -1) {
            if (format === 'exportPdf') {
                exportToPdf(this._extensionUri, document);
                return;
            }
            vscode.window.showWarningMessage('Selected text not found in source.');
            return;
        }
        const startPos = document.positionAt(index);
        const endPos = document.positionAt(index + selectedText.length);
        const range = new vscode.Range(startPos, endPos);
        let wrapper = '';
        switch (format) {
            case 'bold': wrapper = '**'; break;
            case 'highlight': wrapper = '=='; break;
            case 'red-highlight':
                editor.edit(editBuilder => editBuilder.replace(range, `<mark style="background:#ff6b6b;color:#fff">${selectedText}</mark>`));
                return;
            case 'delete':
                editor.edit(editBuilder => editBuilder.delete(range));
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

        const inlineScript = `
        const vscode = acquireVsCodeApi();

        window.onerror = function(message, source, lineno, colno, error) {
            vscode.postMessage({ type: 'error', text: \`\${message} at line \${lineno}\` });
        };

        let ignoreSyncUntil = 0; 
        let lastSyncSend = 0;

        const scrollHandler = (e) => {
            if (Date.now() < ignoreSyncUntil) return;

            const now = Date.now();
            if (now - lastSyncSend < 50) return; 
            lastSyncSend = now;

            const elements = document.querySelectorAll('[data-line]');
            if (elements.length === 0) return;

            const centerY = window.scrollY + (window.innerHeight / 2);
            let bestLine = -1;
            let minDist = Infinity;

            for (const el of elements) {
                const rect = el.getBoundingClientRect(); 
                const absTop = window.scrollY + rect.top;
                const dist = Math.abs(absTop - centerY);
                if (dist < minDist) {
                    minDist = dist;
                    bestLine = parseInt(el.getAttribute('data-line'));
                }
            }
            if (bestLine >= 0) {
                vscode.postMessage({ type: 'revealLine', line: bestLine });
            }
        };

        window.addEventListener('scroll', scrollHandler, { capture: true });

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'scrollTo') {
                const line = message.line;
                const totalLines = message.totalLines;
                const newTargetY = calculateTargetY(line, totalLines);
                
                if (!isNaN(newTargetY)) {
                    ignoreSyncUntil = Date.now() + 500; // Increased Lock time
                    window.scrollTo({ top: newTargetY, behavior: 'auto' });
                }
            } else if (message.type === 'applyFormat') {
                // handle format
            }
        });

        function calculateTargetY(line, totalLines) {
            const documentHeight = document.body.scrollHeight;
            const windowHeight = window.innerHeight;

            // 1. Calculate Pure Percentage Target
            let percentageTarget = 0;
            if (totalLines > 0) {
                const percentage = line / totalLines;
                percentageTarget = percentage * (documentHeight - windowHeight);
                if (percentageTarget < 0) percentageTarget = 0;
            }

            // 2. Try DATA-LINE Matching
            const exactEl = document.querySelector(\`[data-line="\${line}"]\`);
            let matchedTarget = -1;

            if (exactEl) {
                 matchedTarget = exactEl.offsetTop - (windowHeight / 2) + (exactEl.clientHeight / 2);
            } else {
                // Interpolation
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
                     
                     if (before && after) {
                          // Check GAP size
                          // If the gap is huge (e.g. > 50 lines), the interpolation might be way off (jumping sections)
                          if ((after.line - before.line) < 50) {
                              const ratio = (line - before.line) / (after.line - before.line);
                              matchedTarget = before.top + (after.top - before.top) * ratio - (windowHeight / 2);
                          }
                     } else if (before) {
                          if ((line - before.line) < 20) {
                              matchedTarget = before.top - (windowHeight / 2);
                          }
                     }
                }
            }
            
            // 3. HYBRID DECISION
            // If we have a good matched target, use it.
            if (matchedTarget !== -1) {
                // But if matched target is suspiciously far from percentage target (e.g. > 1 screen height),
                // it might be a false positive (matching 'the' in a different section).
                // Let's trust the match, BUT blend it if stats are weak. 
                // Actually, for now, TRUST MATCH unless it's null.
                return matchedTarget;
            }
            
            // 4. FALLBACK TO PERCENTAGE
            // If data-line failed or gap was too big, use percentage.
            return percentageTarget;
        }
        
        // Toolbar Logic
        document.addEventListener('mouseup', event => {
            const selection = window.getSelection();
            const toolbar = document.getElementById('floatingToolbar');
            if (selection && selection.toString().trim().length > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                toolbar.style.top = \`\${window.scrollY + rect.top - 50}px\`;
                toolbar.style.left = \`\${rect.left}px\`;
                toolbar.classList.add('visible');
                toolbar.dataset.selectedText = selection.toString();
            } else {
                if (!toolbar.contains(event.target)) toolbar.classList.remove('visible');
            }
        });
        
        function applyToolbarFormat(format) {
            const toolbar = document.getElementById('floatingToolbar');
            if (toolbar.dataset.selectedText) {
                vscode.postMessage({ type: 'applyFormat', format: format, selectedText: toolbar.dataset.selectedText });
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
        /* MPE-style: Solid Gray Blocks */
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
            // Expanded query selector to include spans (some inline elements might wrap)
            const blockElements = preview.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote > p, pre, .katex-display, table, .emoji-warning');
            blockElements.forEach(el => {
                const elText = el.textContent.trim();
                const cleanElText = elText.replace(/\\s+/g, '');
                // Removed length check to support short bullets
                if (cleanElText.length === 0) return;

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
                     text = text.replace(/(⚠️)(\s*[^<\\n]+)/g, '<span class="emoji-warning">$1 $2</span>');
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
