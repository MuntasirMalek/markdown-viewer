import * as vscode from 'vscode';
import * as path from 'path';
import { exportToPdf } from './pdfExport';

export class PreviewPanel {
    public static currentPanel: PreviewPanel | undefined;
    private static readonly viewType = 'markdownViewerPreview';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _currentDocument: vscode.TextDocument | undefined;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, document: vscode.TextDocument) {
        const column = vscode.ViewColumn.Beside;
        if (PreviewPanel.currentPanel) {
            PreviewPanel.currentPanel._panel.reveal(column);
            PreviewPanel.currentPanel._currentDocument = document;
            PreviewPanel.currentPanel._update();
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
            PreviewPanel.currentPanel._currentDocument = document;
            PreviewPanel.currentPanel._update();
        }
    }

    public static syncScroll(line: number) {
        if (PreviewPanel.currentPanel) {
            PreviewPanel.currentPanel._panel.webview.postMessage({ type: 'scrollTo', line: line });
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
                    case 'applyFormat':
                        this._applyFormat(message.format, message.selectedText);
                        return;
                    case 'exportPdf':
                        // Export directly from current panel context
                        if (this._currentDocument) {
                            exportToPdf(this._extensionUri, this._currentDocument);
                        } else {
                            vscode.window.showWarningMessage('No document to export. Please open a Markdown file.');
                        }
                        return;
                }
            },
            null,
            this._disposables
        );
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
            vscode.window.showWarningMessage('Editor not found or no text selected.');
            return;
        }
        const document = editor.document;
        const index = document.getText().indexOf(selectedText);
        if (index === -1) {
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
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'preview.js'));
        const katexCss = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vendor', 'katex', 'katex.min.css'));
        const katexJs = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vendor', 'katex', 'katex.min.js'));
        const highlightCss = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vendor', 'github.min.css'));
        const highlightJs = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vendor', 'highlight.min.js'));
        const markedJs = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vendor', 'marked.min.js'));
        const githubCss = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vendor', 'github-markdown.css'));
        const escapedContent = this._escapeHtml(content);

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
        .top-toolbar { position: fixed; top: 0; right: 20px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); border-top: none; padding: 4px 8px; border-radius: 0 0 4px 4px; z-index: 1000; display: flex; gap: 8px; }
        .toolbar-btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 12px; border-radius: 2px; cursor: pointer; font-size: 12px; }
        .toolbar-btn:hover { background: var(--vscode-button-hoverBackground); }
        .katex-display { overflow-x: auto; overflow-y: hidden; }
        
        /* MPE-style: Solid Gray Blocks */
        .emoji-warning {
            display: inline-block;
            width: 95%; 
            background-color: #f1f1f1; /* Solid Gray */
            color: #24292e;
            padding: 8px 12px;
            border-left: 4px solid #f1f1f1; /* Matching Border */
            border-radius: 0 2px 2px 0;
            margin: 4px 0;
            white-space: normal;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
        }
        .emoji-warning-icon { margin-right: 6px; }
    </style>
</head>
<body>
    <div class="top-toolbar">
        <button class="toolbar-btn" onclick="exportPdf()">Export PDF</button>
    </div>
    <div class="markdown-body preview-content" id="preview"></div>
    <div class="floating-toolbar" id="floatingToolbar">
        <button id="boldBtn" title="Bold"><b>B</b></button>
        <button id="highlightBtn" title="Yellow Highlight"><span style="display:inline-block;width:14px;height:14px;background:#ffff00;border-radius:50%"></span></button>
        <button id="redHighlightBtn" title="Red Highlight"><span style="display:inline-block;width:14px;height:14px;background:#ff6b6b;border-radius:50%"></span></button>
        <button id="deleteBtn" title="Delete">🗑️</button>
    </div>
    <script id="markdown-content" type="text/plain">${escapedContent}</script>
    <script src="${scriptUri}"></script>
    <script>
        const renderer = new marked.Renderer();
        renderer.text = function(token) {
            let text = token.text || token;
            if (typeof text === 'string') {
                // Restore Highlighter ==text==
                text = text.replace(/==([^=]+)==/g, '<mark>$1</mark>');
                
                text = text.replace(/::([^:]+)::/g, '<mark class="red-highlight">$1</mark>');
                
                // MPE-style Auto-Alert: Restoring Emoji ⚠️
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
        
        // Ensure scroll sync logic runs after rendering
        if (typeof addLineAttributes === 'function') {
            addLineAttributes(raw.split('\\n'));
        }
    </script>
</body>
</html>`;
    }

    private _escapeHtml(text: string): string {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
}
