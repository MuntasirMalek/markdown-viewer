import * as vscode from 'vscode';
import * as path from 'path';
import { PreviewPanel } from './previewPanel';
import { exportToPdf } from './pdfExport';

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('Markdown Viewer Enhanced');
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine('Extension Activation Started (v1.0.42).');

    // Status Bar Item for Sync Health
    const syncStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    syncStatusItem.command = 'markdown-viewer.showLogs'; // Optional: clicking shows logs?
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

            // Update Status Bar
            syncStatusItem.text = "$(check) MD Sync: Ready";
            syncStatusItem.show();
        } else {
            syncStatusItem.hide();
        }
    });

    const scrollListener = vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        if (event.textEditor.document.languageId === 'markdown') {
            const currentDoc = PreviewPanel.currentDocument;

            // Sync Validation Logic
            let shouldSync = false;
            let reason = "Mismatch";

            if (currentDoc) {
                const eventPath = event.textEditor.document.uri.fsPath.toLowerCase();
                const previewPath = currentDoc.uri.fsPath.toLowerCase();
                const eventBase = path.basename(eventPath);
                const previewBase = path.basename(previewPath);

                if (eventPath === previewPath) {
                    shouldSync = true;
                    reason = "Exact Match";
                } else if (eventBase === previewBase) {
                    shouldSync = true;
                    reason = "Basename Match (Fallback)";
                } else {
                    reason = `Path Mismatch (${eventBase} != ${previewBase})`;
                }
            } else {
                reason = "No Preview Doc";
            }

            // Update UI
            if (shouldSync) {
                const visibleRange = event.visibleRanges[0];
                if (visibleRange) {
                    // outputChannel.appendLine(`[Sync] ${reason} -> Line ${visibleRange.start.line}`);
                    PreviewPanel.syncScroll(visibleRange.start.line, event.textEditor.document.lineCount);
                    syncStatusItem.text = `$(check) MD Sync: Active (${reason === "Exact Match" ? "Exact" : "Fallback"})`;
                    syncStatusItem.show();
                }
            } else {
                // outputChannel.appendLine(`[Sync Fail] ${reason}`);
                if (currentDoc) {
                    syncStatusItem.text = `$(alert) MD Sync: Mismatch`;
                    syncStatusItem.tooltip = `Editor: ${path.basename(event.textEditor.document.fileName)}\nPreview: ${path.basename(currentDoc.fileName)}`;
                    syncStatusItem.show();
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
