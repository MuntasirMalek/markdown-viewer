import * as vscode from 'vscode';
import { PreviewPanel } from './previewPanel';
import { exportToPdf } from './pdfExport';

export function activate(context: vscode.ExtensionContext) {
    // Create output channel
    const outputChannel = vscode.window.createOutputChannel('Markdown Viewer Enhanced');
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine('Extension Activation Started.');

    // Register preview command
    const openPreview = () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'markdown') {
            outputChannel.appendLine(`Opening preview for: ${editor.document.fileName}`);
            PreviewPanel.createOrShow(context.extensionUri, editor.document);
        } else {
            vscode.window.showWarningMessage('Please open a Markdown file first.');
        }
    };

    const previewCommand = vscode.commands.registerCommand('markdown-viewer.preview', openPreview);
    const compatPreviewSide = vscode.commands.registerCommand('markdown-preview-enhanced.openPreviewToTheSide', openPreview);
    const compatPreview = vscode.commands.registerCommand('markdown-preview-enhanced.openPreview', openPreview);

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
            outputChannel.appendLine(`Active Editor Changed: ${editor.document.fileName}`);
            PreviewPanel.updateContent(editor.document);
        }
    });

    // Listen for scroll changes in editor to sync with preview
    const scrollListener = vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        if (event.textEditor.document.languageId === 'markdown') {
            const currentDoc = PreviewPanel.currentDocument;

            // DEBUG LOG
            /*
            outputChannel.appendLine(`Scroll Event: ${event.textEditor.document.fileName}`);
            if (currentDoc) {
                outputChannel.appendLine(`Current Preview Doc: ${currentDoc.fileName}`);
                outputChannel.appendLine(`Match? ${event.textEditor.document.uri.toString() === currentDoc.uri.toString()}`);
            } else {
                outputChannel.appendLine('No Current Preview Doc.');
            }
            */

            if (currentDoc && event.textEditor.document.uri.toString() === currentDoc.uri.toString()) {
                const visibleRange = event.visibleRanges[0];
                if (visibleRange) {
                    // outputChannel.appendLine(`Syncing to line: ${visibleRange.start.line}`);
                    PreviewPanel.syncScroll(visibleRange.start.line, event.textEditor.document.lineCount);
                }
            }
        }
    });

    context.subscriptions.push(
        previewCommand,
        compatPreviewSide,
        compatPreview,
        exportPdfCommand,
        documentChangeListener,
        editorChangeListener,
        scrollListener
    );

    // Assign output channel to exports for PDF module
    const exports = { outputChannel };
    return exports;
}

export function deactivate() {
    PreviewPanel.dispose();
}
