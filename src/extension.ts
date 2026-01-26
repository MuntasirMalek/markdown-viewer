import * as vscode from 'vscode';
import * as path from 'path';
import { PreviewPanel } from './previewPanel';
import { exportToPdf } from './pdfExport';

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('Markdown Viewer Enhanced');
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine('Extension Activation Started (v1.0.43 - GLOBAL SYNC).');

    // Status Bar Item for Sync Health
    const syncStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(syncStatusItem);

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
            syncStatusItem.text = "$(zap) MD Sync: Ready";
            syncStatusItem.show();
        } else {
            syncStatusItem.hide();
        }
    });

    const scrollListener = vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        if (event.textEditor.document.languageId === 'markdown') {
            // NUCLEAR OPTION: NO PATH CHECKS.
            // If a markdown file scrolls, we send the signal.
            // This rules out identifying issues.

            // Ensure it doesn't error out if panel is closed
            if (PreviewPanel.currentDocument) {
                const visibleRange = event.visibleRanges[0];
                if (visibleRange) {
                    // Log that we ARE sending it
                    // outputChannel.appendLine(`[Sync FORCE] Sending Line: ${visibleRange.start.line}`);

                    PreviewPanel.syncScroll(visibleRange.start.line, event.textEditor.document.lineCount);

                    syncStatusItem.text = `$(zap) MD Sync: Sending...`;
                    syncStatusItem.show();

                    // Reset status after a clearer timeout
                    setTimeout(() => {
                        syncStatusItem.text = `$(check) MD Sync: Active`;
                    }, 500);
                }
            } else {
                syncStatusItem.text = `$(circle-slash) No Preview`;
                syncStatusItem.show();
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
