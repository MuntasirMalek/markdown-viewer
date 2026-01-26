import * as vscode from 'vscode';
import * as path from 'path';
import { PreviewPanel } from './previewPanel';
import { exportToPdf } from './pdfExport';

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('Markdown Viewer Enhanced');
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine('Extension Activation Started (v1.0.48 - THROTTLED).');

    // Status Bar Item for Sync Health
    const syncStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    syncStatusItem.command = 'markdown-viewer.showLogs';
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
            syncStatusItem.text = "$(check) MD Sync: Ready";
            syncStatusItem.show();
        } else {
            syncStatusItem.hide();
        }
    });

    // SCROLL THROTTLING
    let lastScrollTime = 0;

    const scrollListener = vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        if (event.textEditor.document.languageId === 'markdown') {

            // THROTTLE: 50ms Limit
            // This prevents flooding the WebView with hundreds of messages per second on fast scroll,
            // which was likely causing the "Not Responding" freeze and the broken/laggy sync.
            const now = Date.now();
            if (now - lastScrollTime < 50) {
                return;
            }
            lastScrollTime = now;

            const visibleRange = event.visibleRanges[0];
            if (visibleRange) {
                PreviewPanel.syncScroll(visibleRange.start.line, event.textEditor.document.lineCount);

                // Only update StatusBar occasionally to avoid UI flicker/load
                // We don't need to show 'Active' every 50ms.
                // Just let it be.
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
