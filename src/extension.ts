import * as vscode from 'vscode';
import { PreviewPanel } from './previewPanel';
import { exportToPdf } from './pdfExport';

export function activate(context: vscode.ExtensionContext) {
    console.log('Markdown Viewer Enhanced is now active!');

    // Register preview command
    const previewCommand = vscode.commands.registerCommand('markdown-viewer.preview', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'markdown') {
            PreviewPanel.createOrShow(context.extensionUri, editor.document);
        } else {
            vscode.window.showWarningMessage('Please open a Markdown file first.');
        }
    });

    // Register PDF export command
    const exportPdfCommand = vscode.commands.registerCommand('markdown-viewer.exportPdf', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'markdown') {
            await exportToPdf(context.extensionUri, editor.document);
        } else {
            vscode.window.showWarningMessage('Please open a Markdown file first.');
        }
    });

    // Listen for text document changes
    const documentChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId === 'markdown') {
            PreviewPanel.updateContent(event.document);
        }
    });

    // Listen for active editor changes
    const editorChangeListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && editor.document.languageId === 'markdown') {
            PreviewPanel.updateContent(editor.document);
        }
    });

    // Listen for scroll changes in editor to sync with preview
    const scrollListener = vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        if (event.textEditor.document.languageId === 'markdown') {
            const visibleRange = event.visibleRanges[0];
            if (visibleRange) {
                PreviewPanel.syncScroll(visibleRange.start.line);
            }
        }
    });

    context.subscriptions.push(
        previewCommand,
        exportPdfCommand,
        documentChangeListener,
        editorChangeListener,
        scrollListener
    );
}

export function deactivate() {
    PreviewPanel.dispose();
}
