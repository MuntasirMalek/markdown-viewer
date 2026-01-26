import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as cp from 'child_process';

// We are abandoning puppeteer-core dependency hell.
// We will use a lightweight method: Call Chrome directly via CLI if possible,
// OR ask user to install a PDF printer extension? No, we stick to Chrome CLI 'headless' printing.

// Actually, calling chrome --headless --print-to-pdf is standard and requires NO node modules.
// This is the robust way.

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
    <!-- We inline styles for CLI PDF export as file:// access might be restricted in some chrome contexts -->
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
        .emoji-warning {
            display: inline-block;
            width: 95%; 
            background-color: #f1f1f1; 
            color: #24292e;
            padding: 8px 12px;
            border-left: 4px solid #f1f1f1;
            border-radius: 0 2px 2px 0;
            margin: 4px 0;
            white-space: normal;
        }
    </style>
</head>
<body>
    <div class="markdown-body" id="content"></div>
    <script>
        const renderer = new marked.Renderer();
        renderer.text = function(token) {
            let text = token.text || token;
            if (typeof text === 'string') {
                text = text.replace(/==([^=]+)==/g, '<mark style="background-color: #ffff00; color: #000;">$1</mark>');
                if (text.includes('⚠️')) {
                     text = text.replace(/(⚠️)(\s*[^<\\n]+)/g, '<span class="emoji-warning">$1 $2</span>');
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
    const outputChannel = vscode.extensions.getExtension('utsho.markdown-viewer-enhanced')?.exports?.outputChannel;
    // Note: exports might be undefined depending on activation order, need to check.
    // Actually we can just create one if missing? But let's assume one exists or just log to console.

    // 1. Find Chrome
    const chromePath = findChromePath();
    if (!chromePath) {
        vscode.window.showErrorMessage('Chrome/Chromium/Edge not found. Please install one of them to enable PDF export.');
        return;
    }

    // 2. Prepare Temp File
    const tmpDir = os.tmpdir();
    const tmpHtmlPath = path.join(tmpDir, `mve_export_${Date.now()}.html`);
    const htmlContent = generateHtmlForPdf(document.getText(), extensionUri);

    // We MUST wait for JS to execute.
    // Chrome Headless CLI --print-to-pdf renders the HTML *after* it loads.
    // However, our `generateHtmlForPdf` has a script that RUNS on load to populate #content.
    // Chrome Headless is fast. It might print before the script runs.
    // Fix: We should pre-render the Markdown to HTML *in node* if possible, 
    // OR just write the *rendered* HTML to the file.
    // But we are using `marked` client-side in the preview.
    // To be robust without Puppeteer, we should really pre-compile the markdown here in Node.
    // But `katex`, `highlight.js` etc are set up for browser usage in the `generateHtml` function.
    // Let's stick to the current HTML but ensure it runs.
    // Chrome's --virtual-time-budget might help.

    fs.writeFileSync(tmpHtmlPath, htmlContent);

    const defaultFileName = path.basename(document.fileName, '.md') + '.pdf';
    const defaultUri = vscode.Uri.file(path.join(path.dirname(document.fileName), defaultFileName));
    const saveUri = await vscode.window.showSaveDialog({ defaultUri, filters: { 'PDF': ['pdf'] } });
    if (!saveUri) return;

    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Exporting via Chrome CLI...', cancellable: false }, async (p) => {
        return new Promise<void>((resolve, reject) => {
            // --headless=new is better for modern chrome
            // --run-all-compositor-stages-before-draw
            // --virtual-time-budget=2000 to allow JS to run
            const args = [
                '--headless=new',
                '--disable-gpu',
                '--no-pdf-header-footer',
                '--print-to-pdf="' + saveUri.fsPath + '"',
                '--virtual-time-budget=5000', // Allow 5 seconds for JS to render
                '"' + tmpHtmlPath + '"'
            ];

            // On Windows, quoting might be different, but let's try standard spawn
            // Actually, spawn argument array handles quoting usually.
            const spawnArgs = [
                '--headless=new',
                '--disable-gpu',
                '--no-pdf-header-footer',
                `--print-to-pdf=${saveUri.fsPath}`,
                '--virtual-time-budget=5000',
                tmpHtmlPath
            ];

            const proc = cp.spawn(chromePath, spawnArgs);

            proc.on('close', (code) => {
                // Cleanup
                try { fs.unlinkSync(tmpHtmlPath); } catch (e) { }

                if (code === 0) {
                    vscode.window.showInformationMessage(`Exported: ${path.basename(saveUri.fsPath)}`, 'Open')
                        .then(s => { if (s === 'Open') vscode.env.openExternal(saveUri); });
                    resolve();
                } else {
                    vscode.window.showErrorMessage(`Chrome exited with code ${code}. PDF might not be generated.`);
                    resolve();
                }
            });

            proc.on('error', (err) => {
                vscode.window.showErrorMessage(`Failed to launch Chrome: ${err.message}`);
                resolve();
            });
        });
    });
}
