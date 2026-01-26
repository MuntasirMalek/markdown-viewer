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
                    vscode.Uri.joinPath(extensionUri, 'media')
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
                    case 'exportPdf':
                        vscode.commands.executeCommand('markdown-viewer.exportPdf');
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
            vscode.window.showWarningMessage('No active document found for markdown preview.');
            return;
        }

        const editor = vscode.window.visibleTextEditors.find(
            e => e.document.uri.toString() === this._currentDocument?.uri.toString()
        );

        if (!editor) {
            vscode.window.showWarningMessage('Could not find the editor for this preview. Please ensure the markdown file is open.');
            return;
        }

        if (!selectedText) return;

        const document = editor.document;
        const text = document.getText();

        const index = text.indexOf(selectedText);
        if (index === -1) {
            vscode.window.showWarningMessage('Could not find exactly matching text in source. Try selecting distinct text.');
            return;
        }

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

        // Resources
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'preview.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'preview.js'));

        // Vendored resources
        const katexCss = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vendor', 'katex', 'katex.min.css'));
        const katexJs = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vendor', 'katex', 'katex.min.js'));
        const highlightCss = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vendor', 'github.min.css'));
        const highlightJs = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vendor', 'highlight.min.js'));
        const markedJs = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vendor', 'marked.min.js'));

        // GitHub Markdown CSS
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
        .markdown-body {
            box-sizing: border-box;
            min-width: 200px;
            max-width: 980px;
            margin: 0 auto;
            padding: 45px;
        }
        
        @media (max-width: 767px) {
            .markdown-body {
                padding: 15px;
            }
        }
        
        /* Toolbar */
        .top-toolbar {
            position: fixed;
            top: 0;
            right: 20px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            border-top: none;
            padding: 4px 8px;
            border-radius: 0 0 4px 4px;
            z-index: 1000;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            display: flex;
            gap: 8px;
        }
        
        .toolbar-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 12px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 12px;
            font-family: var(--vscode-font-family);
        }
        
        .toolbar-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }

        /* Fix for KaTeX in GitHub CSS */
        .katex-display { overflow-x: auto; overflow-y: hidden; }
    </style>
</head>
<body>
    <div class="top-toolbar">
        <button class="toolbar-btn" onclick="exportPdf()">Export PDF</button>
    </div>

    <!-- Main Content Container with github-markdown-css class -->
    <div class="markdown-body preview-content" id="preview"></div>
    
    <!-- Floating Toolbar (for selection) -->
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
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
}
