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
function generateHtmlForPdf(markdownContent: string): string {
    // We'll use the same rendering approach as the preview
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Markdown Export</title>
    
    <!-- KaTeX -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    
    <!-- Highlight.js -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github.min.css">
    <script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js"></script>
    
    <!-- Marked.js -->
    <script src="https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js"></script>
    
    <style>
        :root {
            --bg-preview: #ffffff;
            --text-preview: #24292e;
            --text-preview-secondary: #6a737d;
            --preview-border: #eaecef;
            --code-bg: #f6f8fa;
            --code-border: #d0d7de;
            --table-header-bg: #f6f8fa;
            --table-row-alt: #f6f8fa;
            --table-border: #d0d7de;
            --blockquote-border: #d0d7de;
            --blockquote-bg: #f6f8fa;
            --highlight-bg: #ffe135;
            --link-color: #0969da;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: var(--bg-preview);
            color: var(--text-preview);
            line-height: 1.6;
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
        }

        h1, h2, h3, h4, h5, h6 {
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
            color: var(--text-preview);
        }

        h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid var(--preview-border); }
        h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid var(--preview-border); }
        h3 { font-size: 1.25em; }
        h4 { font-size: 1em; }
        h5 { font-size: 0.875em; }
        h6 { font-size: 0.85em; color: var(--text-preview-secondary); }

        p { margin-bottom: 16px; }

        a { color: var(--link-color); text-decoration: none; }
        a:hover { text-decoration: underline; }

        code {
            background: var(--code-bg);
            padding: 0.2em 0.4em;
            border-radius: 4px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 0.9em;
        }

        pre {
            background: var(--code-bg);
            border: 1px solid var(--code-border);
            border-radius: 6px;
            padding: 16px;
            overflow-x: auto;
            margin-bottom: 16px;
        }

        pre code {
            background: none;
            padding: 0;
            border-radius: 0;
        }

        blockquote {
            padding: 0.5em 1em;
            margin: 0 0 16px;
            border-left: 4px solid var(--blockquote-border);
            background: var(--blockquote-bg);
            color: var(--text-preview-secondary);
        }

        ul, ol {
            margin-bottom: 16px;
            padding-left: 2em;
        }

        li { margin-bottom: 4px; }

        table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 16px;
        }

        th, td {
            border: 1px solid var(--table-border);
            padding: 8px 12px;
            text-align: left;
        }

        th {
            background: var(--table-header-bg);
            font-weight: 600;
        }

        tr:nth-child(even) { background: var(--table-row-alt); }

        mark {
            background: var(--highlight-bg);
            padding: 0.1em 0.2em;
            border-radius: 2px;
        }

        mark.red-highlight {
            background: #ff6b6b;
            color: #fff;
        }

        img {
            max-width: 100%;
            height: auto;
        }

        hr {
            border: none;
            border-top: 1px solid var(--preview-border);
            margin: 24px 0;
        }

        .katex-display {
            overflow-x: auto;
            overflow-y: hidden;
            padding: 8px 0;
        }
    </style>
</head>
<body>
    <div id="content"></div>
    
    <script>
        // Configure marked
        const renderer = new marked.Renderer();
        renderer.text = function(token) {
            let text = token.text || token;
            if (typeof text === 'string') {
                text = text.replace(/==([^=]+)==/g, '<mark>$1</mark>');
                text = text.replace(/::([^:]+)::/g, '<mark class="red-highlight">$1</mark>');
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

            text = text.replace(/\\$\\$([^$]+)\\$\\$/g, (match, math) => {
                mathBlocks.push(math);
                return \`%%MATHBLOCK\${mathBlocks.length - 1}%%\`;
            });

            text = text.replace(/\\$([^$\\n]+)\\$/g, (match, math) => {
                inlineMath.push(math);
                return \`%%INLINEMATH\${inlineMath.length - 1}%%\`;
            });

            let html = marked.parse(text);

            html = html.replace(/%%MATHBLOCK(\\d+)%%/g, (match, index) => {
                try {
                    return katex.renderToString(mathBlocks[parseInt(index)], {
                        displayMode: true,
                        throwOnError: false
                    });
                } catch (e) {
                    return \`<span class="math-error">\${mathBlocks[parseInt(index)]}</span>\`;
                }
            });

            html = html.replace(/%%INLINEMATH(\\d+)%%/g, (match, index) => {
                try {
                    return katex.renderToString(inlineMath[parseInt(index)], {
                        displayMode: false,
                        throwOnError: false
                    });
                } catch (e) {
                    return \`<span class="math-error">\${inlineMath[parseInt(index)]}</span>\`;
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
            'PDF export requires puppeteer-core. Please run "npm install" in the extension folder.'
        );
        return;
    }

    const chromePath = findChromePath();
    if (!chromePath) {
        const action = await vscode.window.showErrorMessage(
            'Chrome/Chromium not found. PDF export requires Chrome, Chromium, or Edge.',
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
                const htmlContent = generateHtmlForPdf(document.getText());

                await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

                // Wait a bit for fonts and math to render
                await new Promise(resolve => setTimeout(resolve, 1000));

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
