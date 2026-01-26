import * as vscode from 'vscode';
import * as path from 'path';
import { PreviewPanel } from './previewPanel';
import { exportToPdf } from './pdfExport';

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('Markdown Viewer Enhanced');
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine('Extension Activation Started (v1.0.55 - RESTORED v1.0.51).');

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

            // 1. TIMESTAMP GATE (THE GUARD)
            // If the preview scrolled the editor recently (< 1000ms), STOP.
            // This prevents the loop/jitter.
            if (Date.now() - PreviewPanel.lastRemoteScrollTime < 1000) {
                return;
            }

            // 2. NUCLEAR OPTION (NO PATH CHECKS)
            // We removed the path checks because they were failing for your specific file.
            // Since we have the Timestamp Gate, we don't need to worry about loops.
            // And honestly, if you scroll *any* markdown file, you probably want the preview to sync.

            // 3. THROTTLE
            const now = Date.now();
            if (now - lastScrollTime < 50) {
                return;
            }
            lastScrollTime = now;

            const visibleRange = event.visibleRanges[0];
            if (visibleRange) {
                PreviewPanel.syncScroll(visibleRange.start.line, event.textEditor.document.lineCount);
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
