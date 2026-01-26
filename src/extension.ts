import * as vscode from 'vscode';
import * as path from 'path';
import { PreviewPanel } from './previewPanel';
import { exportToPdf } from './pdfExport';

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('Markdown Viewer Enhanced');
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine('Extension Activation Started (v1.0.41).');

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

            // Normalized Paths
            const eventPath = event.textEditor.document.uri.fsPath.toLowerCase();
            const previewPath = currentDoc ? currentDoc.uri.fsPath.toLowerCase() : 'none';

            // VERBOSE LOGGING ENABLED FOR DIAGNOSIS
            // This will print every scroll event.
            const isMatch = (eventPath === previewPath);

            // Log the comparison to catch the "Dead Sync" culprit
            outputChannel.appendLine(`[Scroll Check] Match=${isMatch}`);
            outputChannel.appendLine(`   Event:   ${event.textEditor.document.fileName}`);
            outputChannel.appendLine(`   Preview: ${currentDoc ? currentDoc.fileName : 'None'}`);

            if (currentDoc && isMatch) {
                const visibleRange = event.visibleRanges[0];
                if (visibleRange) {
                    outputChannel.appendLine(`   >> SYNCING line ${visibleRange.start.line}`);
                    PreviewPanel.syncScroll(visibleRange.start.line, event.textEditor.document.lineCount);
                }
            } else {
                outputChannel.appendLine(`   >> SKIPPED (Mismatch or No Preview)`);
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
