import * as vscode from 'vscode';
import * as path from 'path';

export class PreviewPanel {
    public static currentPanel: PreviewPanel | undefined;
    private static readonly viewType = 'markdownViewerPreview';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _currentDocument: vscode.TextDocument | undefined;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, document: vscode.TextDocument) {
        const column = vscode.ViewColumn.Beside;

        // If panel exists, reveal it
        if (PreviewPanel.currentPanel) {
            PreviewPanel.currentPanel._panel.reveal(column);
            PreviewPanel.currentPanel._currentDocument = document;
            PreviewPanel.currentPanel._update();
            return;
        }

        // Create new panel
        const panel = vscode.window.createWebviewPanel(
            PreviewPanel.viewType,
            'Markdown Preview',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'node_modules')
                ]
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
            PreviewPanel.currentPanel._panel.webview.postMessage({
                type: 'scrollTo',
                line: line
            });
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

        // Set initial content
        this._update();

        // Listen for panel disposal
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'alert':
                        vscode.window.showInformationMessage(message.text);
                        return;
                    case 'applyFormat':
                        this._applyFormat(message.format, message.selectedText);
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
        const editor = vscode.window.activeTextEditor;
        if (!editor || !selectedText) return;

        const document = editor.document;
        const text = document.getText();

        // Find the selected text in the document
        const index = text.indexOf(selectedText);
        if (index === -1) return;

        const startPos = document.positionAt(index);
        const endPos = document.positionAt(index + selectedText.length);
        const range = new vscode.Range(startPos, endPos);

        let wrapper = '';
        switch (format) {
            case 'bold':
                wrapper = '**';
                break;
            case 'highlight':
                wrapper = '==';
                break;
            case 'red-highlight':
                // Use HTML mark with inline style for red
                editor.edit(editBuilder => {
                    editBuilder.replace(range, `<mark style="background:#ff6b6b;color:#fff">${selectedText}</mark>`);
                });
                return;
            case 'delete':
                editor.edit(editBuilder => {
                    editBuilder.delete(range);
                });
                return;
        }

        if (wrapper) {
            editor.edit(editBuilder => {
                editBuilder.replace(range, `${wrapper}${selectedText}${wrapper}`);
            });
        }
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.title = this._currentDocument
            ? `Preview: ${path.basename(this._currentDocument.fileName)}`
            : 'Markdown Preview';
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const content = this._currentDocument?.getText() || '';

        // Get resource URIs
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'preview.css')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'preview.js')
        );

        // Use CDN for libraries (simpler than bundling)
        const katexCss = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
        const katexJs = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
        const highlightCss = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github.min.css';
        const highlightJs = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js';
        const markedJs = 'https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js';

        // Escape content for safe embedding
        const escapedContent = this._escapeHtml(content);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'unsafe-inline' https://cdn.jsdelivr.net; font-src https://cdn.jsdelivr.net; img-src ${webview.cspSource} https: data:;">
    <title>Markdown Preview</title>
    
    <!-- KaTeX -->
    <link rel="stylesheet" href="${katexCss}">
    <script src="${katexJs}"></script>
    
    <!-- Highlight.js -->
    <link rel="stylesheet" href="${highlightCss}">
    <script src="${highlightJs}"></script>
    
    <!-- Marked.js -->
    <script src="${markedJs}"></script>
    
    <!-- Custom styles -->
    <link rel="stylesheet" href="${styleUri}">
</head>
<body>
    <div class="preview-content" id="preview"></div>
    
    <!-- Floating Toolbar -->
    <div class="floating-toolbar" id="floatingToolbar">
        <button id="boldBtn" title="Bold"><b>B</b></button>
        <button id="highlightBtn" title="Yellow Highlight">
            <span style="display: inline-block; width: 14px; height: 14px; background: #ffe135; border-radius: 50%;"></span>
        </button>
        <button id="redHighlightBtn" title="Red Highlight">
            <span style="display: inline-block; width: 14px; height: 14px; background: #ff6b6b; border-radius: 50%;"></span>
        </button>
        <button id="deleteBtn" title="Delete">🗑️</button>
    </div>

    <script id="markdown-content" type="text/plain">${escapedContent}</script>
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }

    private _escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
