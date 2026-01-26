import * as vscode from 'vscode';
import { PreviewPanel } from './previewPanel';
import { exportToPdf } from './pdfExport';

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('Markdown Viewer Enhanced');
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine('Extension Activation Started (v1.0.40).');

    const openPreview = () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'markdown') {
            outputChannel.appendLine(`[Command] Opening preview for: ${editor.document.fileName}`);
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
            outputChannel.appendLine(`[Focus] Active Editor Changed: ${editor.document.fileName}`);
            PreviewPanel.updateContent(editor.document);
        }
    });

    const scrollListener = vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        if (event.textEditor.document.languageId === 'markdown') {
            const currentDoc = PreviewPanel.currentDocument;

            // Normalized Paths (Fix for macOS case-insensitivity)
            const eventPath = event.textEditor.document.uri.fsPath.toLowerCase();
            const previewPath = currentDoc ? currentDoc.uri.fsPath.toLowerCase() : 'none';

            // Uncommenting logs to debug "Dead Sync"
            // Using terse format to avoid flooding too much, but enough to verify
            /*
            outputChannel.appendLine(`[Scroll] Event: ${path.basename(eventPath)} | Preview: ${path.basename(previewPath)}`);
            */

            // If we want to truly debug this for the user, we should enable ONE log line per event if they don't match?
            // No, that would spam if they have two split editors.
            // Let's rely on the fix (toLowerCase) first. 
            // But I will enable a 'Syncing' log if it matches, so we know it SUCCEEDED.

            if (currentDoc && eventPath === previewPath) {
                const visibleRange = event.visibleRanges[0];
                if (visibleRange) {
                    // outputChannel.appendLine(`[Sync] Triggered for Line: ${visibleRange.start.line}`);
                    PreviewPanel.syncScroll(visibleRange.start.line, event.textEditor.document.lineCount);
                }
            } else {
                // outputChannel.appendLine(`[Sync] Skipped. Mismatch.`);
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
