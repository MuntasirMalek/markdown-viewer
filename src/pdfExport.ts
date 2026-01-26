import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Import puppeteer-core for PDF generation
let puppeteer: typeof import('puppeteer-core') | undefined;

try {
    puppeteer = require('puppeteer-core');
} catch (e) {
    console.error('puppeteer-core not available:', e);
}

/**
 * Find Chrome/Chromium executable path
 */
function findChromePath(): string | undefined {
    const config = vscode.workspace.getConfiguration('markdownViewer');
    const configuredPath = config.get<string>('chromePath');

    if (configuredPath && fs.existsSync(configuredPath)) {
        return configuredPath;
    }

    // Common Chrome/Chromium paths
    const platform = os.platform();
    const possiblePaths: string[] = [];

    if (platform === 'darwin') {
        // macOS
        possiblePaths.push(
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            `${os.homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
        );
    } else if (platform === 'win32') {
        // Windows
        const programFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files';
        const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
        const localAppData = process.env['LOCALAPPDATA'] || '';

        possiblePaths.push(
            `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
            `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
            `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`,
            `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`
        );
    } else {
        // Linux
        possiblePaths.push(
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium'
        );
    }

    for (const chromePath of possiblePaths) {
        if (fs.existsSync(chromePath)) {
            return chromePath;
        }
    }

    return undefined;
}

/**
 * Generate HTML content for PDF export
 */
function generateHtmlForPdf(markdownContent: string, extensionUri: vscode.Uri): string {
    const vendorPath = path.join(extensionUri.fsPath, 'media', 'vendor');

    // Convert to file URIs for Puppeteer
    const toFileUri = (p: string) => vscode.Uri.file(p).toString();

    const katexCss = toFileUri(path.join(vendorPath, 'katex', 'katex.min.css'));
    const katexJs = toFileUri(path.join(vendorPath, 'katex', 'katex.min.js'));
    const highlightCss = toFileUri(path.join(vendorPath, 'github.min.css'));
    const highlightJs = toFileUri(path.join(vendorPath, 'highlight.min.js'));
    const markedJs = toFileUri(path.join(vendorPath, 'marked.min.js'));
    const githubCss = toFileUri(path.join(vendorPath, 'github-markdown.css'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Markdown Export</title>
    
    <!-- KaTeX -->
    <link rel="stylesheet" href="${katexCss}">
    <script src="${katexJs}"></script>
    
    <!-- Highlight.js -->
    <link rel="stylesheet" href="${highlightCss}">
    <script src="${highlightJs}"></script>
    
    <!-- Marked.js -->
    <script src="${markedJs}"></script>
    
    <!-- GitHub Markdown CSS -->
    <link rel="stylesheet" href="${githubCss}">
    
    <style>
        /* Base styles for PDF */
        body {
            background-color: white;
        }

        .markdown-body {
            box-sizing: border-box;
            min-width: 200px;
            max-width: 980px;
            margin: 0 auto;
            padding: 20px;
        }

        @page {
            size: A4;
            margin: 20mm;
        }

        /* Fix for KaTeX in GitHub CSS */
        .katex-display { overflow-x: auto; overflow-y: hidden; }
        
        /* Ensure syntax highlighting bg is correct */
        pre { background-color: #f6f8fa !important; }
    </style>
</head>
<body>
    <div class="markdown-body" id="content"></div>
    
    <script>
        // Configure marked
        const renderer = new marked.Renderer();
        renderer.text = function(token) {
            let text = token.text || token;
            if (typeof text === 'string') {
                text = text.replace(/==([^=]+)==/g, '<mark style="background-color: #ffe135; border-radius: 2px; padding: 0.1em 0.2em;">$1</mark>');
            }
            return text;
        };

        marked.setOptions({
            renderer: renderer,
            gfm: true,
            breaks: true,
            highlight: function(code, lang) {
                if (lang && hljs.getLanguage(lang)) {
                    try {
                        return hljs.highlight(code, { language: lang }).value;
                    } catch (e) {}
                }
                return hljs.highlightAuto(code).value;
            }
        });

        function renderMarkdown(text) {
            const mathBlocks = [];
            const inlineMath = [];

            // Extract display math
            text = text.replace(/\$\$([^$]+)\$\$/g, (match, math) => {
                mathBlocks.push(math);
                return \`%%MATHBLOCK\${mathBlocks.length - 1}%%\`;
            });

            // Extract inline math
            text = text.replace(/\\$([^$\\n]+)\\$/g, (match, math) => {
                inlineMath.push(math);
                return \`%%INLINEMATH\${inlineMath.length - 1}%%\`;
            });

            let html = marked.parse(text);

            // Restore math
            html = html.replace(/%%MATHBLOCK(\\d+)%%/g, (match, index) => {
                try {
                    return katex.renderToString(mathBlocks[parseInt(index)], {
                        displayMode: true,
                        throwOnError: false
                    });
                } catch (e) {
                    return match;
                }
            });

            html = html.replace(/%%INLINEMATH(\\d+)%%/g, (match, index) => {
                try {
                    return katex.renderToString(inlineMath[parseInt(index)], {
                        displayMode: false,
                        throwOnError: false
                    });
                } catch (e) {
                    return match;
                }
            });

            return html;
        }

        const markdownContent = ${JSON.stringify(markdownContent)};
        document.getElementById('content').innerHTML = renderMarkdown(markdownContent);
    </script>
</body>
</html>`;
}

/**
 * Export markdown document to PDF
 */
export async function exportToPdf(extensionUri: vscode.Uri, document: vscode.TextDocument): Promise<void> {
    if (!puppeteer) {
        vscode.window.showErrorMessage(
            'PDF export requires "puppeteer-core". Please ensure dependencies are installed.'
        );
        return;
    }

    const chromePath = findChromePath();
    if (!chromePath) {
        const action = await vscode.window.showErrorMessage(
            'Chrome/Chromium not found. PDF export requires Chrome, Chromium, or Edge to be installed.',
            'Configure Path'
        );
        if (action === 'Configure Path') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'markdownViewer.chromePath');
        }
        return;
    }

    // Ask for save location
    const defaultFileName = path.basename(document.fileName, '.md') + '.pdf';
    const defaultUri = vscode.Uri.file(
        path.join(path.dirname(document.fileName), defaultFileName)
    );

    const saveUri = await vscode.window.showSaveDialog({
        defaultUri: defaultUri,
        filters: { 'PDF': ['pdf'] }
    });

    if (!saveUri) {
        return; // User cancelled
    }

    // Show progress
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Exporting to PDF...',
            cancellable: false
        },
        async (progress) => {
            try {
                progress.report({ increment: 10, message: 'Launching browser...' });

                const browser = await puppeteer.launch({
                    headless: true,
                    executablePath: chromePath,
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                });

                progress.report({ increment: 20, message: 'Rendering content...' });

                const page = await browser.newPage();

                // Pass extensionUri to resolve local resources
                const htmlContent = generateHtmlForPdf(document.getText(), extensionUri);

                // Determine local path to serve as base for relative images
                // But for styles we used absolute file URIs.
                await page.setContent(htmlContent, {
                    waitUntil: ['networkidle0', 'domcontentloaded'],
                    timeout: 30000
                });

                // Wait a bit for fonts and math to render
                await new Promise(resolve => setTimeout(resolve, 1500));

                progress.report({ increment: 50, message: 'Generating PDF...' });

                const config = vscode.workspace.getConfiguration('markdownViewer');
                const pageSize = config.get<string>('pdfPageSize') || 'A4';
                const margin = config.get<string>('pdfMargin') || '20mm';

                await page.pdf({
                    path: saveUri.fsPath,
                    format: pageSize as any,
                    margin: {
                        top: margin,
                        bottom: margin,
                        left: margin,
                        right: margin
                    },
                    printBackground: true
                });

                progress.report({ increment: 100, message: 'Done!' });

                await browser.close();

                const openAction = await vscode.window.showInformationMessage(
                    `PDF exported successfully: ${path.basename(saveUri.fsPath)}`,
                    'Open File',
                    'Open Folder'
                );

                if (openAction === 'Open File') {
                    vscode.env.openExternal(saveUri);
                } else if (openAction === 'Open Folder') {
                    vscode.commands.executeCommand('revealFileInOS', saveUri);
                }

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Failed to export PDF: ${errorMessage}`);
                console.error('PDF export error:', error);
            }
        }
    );
}
