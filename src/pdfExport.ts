import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

let puppeteer: typeof import('puppeteer-core') | undefined;
try { puppeteer = require('puppeteer-core'); } catch (e) { console.error('puppeteer-core not available:', e); }

function findChromePath(): string | undefined {
    const config = vscode.workspace.getConfiguration('markdownViewer');
    const configuredPath = config.get<string>('chromePath');
    if (configuredPath && fs.existsSync(configuredPath)) return configuredPath;
    const platform = os.platform();
    const possiblePaths: string[] = [];
    if (platform === 'darwin') {
        possiblePaths.push(
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            `${os.homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
        );
    } else if (platform === 'win32') {
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
        possiblePaths.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser');
    }
    for (const p of possiblePaths) { if (fs.existsSync(p)) return p; }
    return undefined;
}

function generateHtmlForPdf(markdownContent: string, extensionUri: vscode.Uri): string {
    const vendorPath = path.join(extensionUri.fsPath, 'media', 'vendor');
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
    <link rel="stylesheet" href="${katexCss}">
    <script src="${katexJs}"></script>
    <link rel="stylesheet" href="${highlightCss}">
    <script src="${highlightJs}"></script>
    <script src="${markedJs}"></script>
    <link rel="stylesheet" href="${githubCss}">
    <style>
        body { background-color: white; }
        .markdown-body { box-sizing: border-box; min-width: 200px; max-width: 980px; margin: 0 auto; padding: 20px; }
        @page { size: A4; margin: 20mm; }
        .katex-display { overflow-x: auto; overflow-y: hidden; }
        pre { background-color: #f6f8fa !important; }
        /* Magic Auto-Alert for PDF */
        .emoji-warning {
            display: inline-block;
            width: 95%;
            background-color: #fff5b1;
            color: #24292f;
            padding: 8px 12px;
            border-left: 4px solid #e3b341;
            border-radius: 0 2px 2px 0;
            margin: 4px 0;
            white-space: normal;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
        }
        .emoji-warning-icon {
            font-weight: bold;
            margin-right: 6px;
            color: #856404;
        }
        .emoji-warning em { font-style: normal; font-weight: 500; }
    </style>
</head>
<body>
    <div class="markdown-body" id="content"></div>
    <script>
        const renderer = new marked.Renderer();
        renderer.text = function(token) {
            let text = token.text || token;
            if (typeof text === 'string') {
                text = text.replace(/==([^=]+)==/g, '<mark style="background-color: #ffe135; border-radius: 2px; padding: 0.1em 0.2em;">$1</mark>');
                if (text.includes('⚠️')) {
                     text = text.replace(/(⚠️)(\s*[^<\\n]+)/g, '<span class="emoji-warning"><span class="emoji-warning-icon">!</span>$2</span>');
                }
            }
            return text;
        };
        renderer.blockquote = function(quote) {
            const match = quote.match(/^<p>\\s*\\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\\]\\s*/i);
            if (match) {
                const type = match[1].toLowerCase();
                const title = type.charAt(0).toUpperCase() + type.slice(1);
                const content = quote.replace(/^<p>\\s*\\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\\]\\s*/i, '<p>');
                return \`<div class="markdown-alert markdown-alert-\${type}"><p class="markdown-alert-title">\${title}</p>\${content}</div>\`;
            }
            return \`<blockquote>\${quote}</blockquote>\`;
        };

        marked.setOptions({
            renderer: renderer,
            gfm: true,
            breaks: true,
            highlight: function(code, lang) {
                if (lang && hljs.getLanguage(lang)) {
                    try { return hljs.highlight(code, { language: lang }).value; } catch (e) {}
                }
                return hljs.highlightAuto(code).value;
            }
        });

        function renderMarkdown(text) {
            const mathBlocks = [];
            const inlineMath = [];
            text = text.replace(/\\$\\$([^$]+)\\$\\$/g, (m, math) => { mathBlocks.push(math); return \`%%MATHBLOCK\${mathBlocks.length-1}%%\`; });
            text = text.replace(/\\$([^$\\n]+)\\$/g, (m, math) => { inlineMath.push(math); return \`%%INLINEMATH\${inlineMath.length-1}%%\`; });
            let html = marked.parse(text);
            html = html.replace(/%%MATHBLOCK(\\d+)%%/g, (m, i) => {
                try { return katex.renderToString(mathBlocks[parseInt(i)], { displayMode: true, throwOnError: false }); } catch(e) { return m; }
            });
            html = html.replace(/%%INLINEMATH(\\d+)%%/g, (m, i) => {
                try { return katex.renderToString(inlineMath[parseInt(i)], { displayMode: false, throwOnError: false }); } catch(e) { return m; }
            });
            return html;
        }

        const raw = ${JSON.stringify(markdownContent)};
        document.getElementById('content').innerHTML = renderMarkdown(raw);
    </script>
</body>
</html>`;
}

export async function exportToPdf(extensionUri: vscode.Uri, document: vscode.TextDocument): Promise<void> {
    const ext = vscode.extensions.getExtension('utsho.markdown-viewer-enhanced');
    const outputChannel = ext?.exports?.outputChannel;
    if (outputChannel) outputChannel.appendLine(`[${new Date().toISOString()}] Starting PDF export for ${document.fileName}`);
    if (!puppeteer) { vscode.window.showErrorMessage('PDF export requires "puppeteer-core".'); return; }

    const chromePath = findChromePath();
    if (outputChannel) outputChannel.appendLine(chromePath ? `Found Chrome: ${chromePath}` : 'Chrome not found.');
    if (!chromePath) { vscode.window.showErrorMessage('Chrome/Chromium not found.'); return; }

    const defaultFileName = path.basename(document.fileName, '.md') + '.pdf';
    const defaultUri = vscode.Uri.file(path.join(path.dirname(document.fileName), defaultFileName));
    const saveUri = await vscode.window.showSaveDialog({ defaultUri, filters: { 'PDF': ['pdf'] } });
    if (!saveUri) return;

    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Exporting...', cancellable: false }, async (p) => {
        try {
            p.report({ increment: 10, message: 'Launching...' });
            const browser = await puppeteer.launch({ headless: true, executablePath: chromePath, args: ['--no-sandbox'] });
            const page = await browser.newPage();
            const html = generateHtmlForPdf(document.getText(), extensionUri);
            await page.setContent(html, { waitUntil: ['networkidle0', 'domcontentloaded'], timeout: 60000 });
            await new Promise(r => setTimeout(r, 1500));

            const config = vscode.workspace.getConfiguration('markdownViewer');
            await page.pdf({ path: saveUri.fsPath, format: (config.get('pdfPageSize') || 'A4') as any, margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' }, printBackground: true });

            await browser.close();
            if (outputChannel) outputChannel.appendLine('Success.');
            const action = await vscode.window.showInformationMessage(`Exported: ${path.basename(saveUri.fsPath)}`, 'Open');
            if (action === 'Open') vscode.env.openExternal(saveUri);
        } catch (e: any) {
            if (outputChannel) outputChannel.appendLine(`Error: ${e.message}\n${e.stack}`);
            vscode.window.showErrorMessage(`Failed: ${e.message}`);
        }
    });
}
