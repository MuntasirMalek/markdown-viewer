import * as vscode from 'vscode';
import { PreviewPanel } from './previewPanel';
import { exportToPdf } from './pdfExport';

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('Markdown Viewer Enhanced');
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine('Extension Activation Started.');

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

    const exportPdfCommand = vscode.commands.registerCommand('markdown-viewer.exportPdf', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'markdown') {
            await exportToPdf(context.extensionUri, editor.document);
        } else {
            vscode.window.showWarningMessage('Please open a Markdown file first.');
        }
    });

    const documentChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId === 'markdown') {
            PreviewPanel.updateContent(event.document);
        }
    });

    const editorChangeListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && editor.document.languageId === 'markdown') {
            outputChannel.appendLine(`Active Editor Changed: ${editor.document.fileName}`);
            PreviewPanel.updateContent(editor.document);
        }
    });

    const scrollListener = vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        if (event.textEditor.document.languageId === 'markdown') {
            const currentDoc = PreviewPanel.currentDocument;

            // DEBUG: Uncomment to trace sync validation checks
            // if (currentDoc) {
            //    outputChannel.appendLine(`Check: ${event.textEditor.document.fileName} vs ${currentDoc.fileName}`);
            // }

            // FIXED: Use fsPath comparison to avoid encoding/scheme/case mismatches
            if (currentDoc && event.textEditor.document.uri.fsPath === currentDoc.uri.fsPath) {
                const visibleRange = event.visibleRanges[0];
                if (visibleRange) {
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

    return { outputChannel };
}

export function deactivate() {
    PreviewPanel.dispose();
}
