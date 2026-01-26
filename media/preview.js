const vscode = acquireVsCodeApi();

document.addEventListener('mouseup', event => {
    const selection = window.getSelection();
    const toolbar = document.getElementById('floatingToolbar');

    if (selection && selection.toString().trim().length > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        toolbar.style.top = `${window.scrollY + rect.top - 50}px`;
        toolbar.style.left = `${rect.left}px`;
        toolbar.classList.add('visible');

        toolbar.dataset.selectedText = selection.toString();
    } else {
        if (!toolbar.contains(event.target)) {
            toolbar.classList.remove('visible');
        }
    }
});

function applyFormat(format) {
    const toolbar = document.getElementById('floatingToolbar');
    const selectedText = toolbar.dataset.selectedText;
    if (selectedText) {
        vscode.postMessage({
            type: 'applyFormat',
            format: format,
            selectedText: selectedText
        });
        toolbar.classList.remove('visible');
        window.getSelection().removeAllRanges();
    }
}

document.getElementById('boldBtn').onclick = () => applyFormat('bold');
document.getElementById('highlightBtn').onclick = () => applyFormat('highlight');
document.getElementById('redHighlightBtn').onclick = () => applyFormat('red-highlight');
document.getElementById('deleteBtn').onclick = () => applyFormat('delete');

const exportBtn = document.getElementById('toolbarExportBtn');
if (exportBtn) {
    exportBtn.onclick = () => {
        exportPdf();
        const toolbar = document.getElementById('floatingToolbar');
        toolbar.classList.remove('visible');
        window.getSelection().removeAllRanges();
    };
}

function exportPdf() {
    vscode.postMessage({ type: 'exportPdf' });
}

// BINDIRECTIONAL SYNC: Preview Scrolled -> Listen -> Send to Extension
let scrollTimeout;
window.addEventListener('scroll', () => {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        const elements = document.querySelectorAll('[data-line]');
        let targetLine = 0;
        // Find first element that is roughly in the top 1/3 of view
        for (let el of elements) {
            const rect = el.getBoundingClientRect();
            if (rect.top >= 0 && rect.top < window.innerHeight / 2) {
                targetLine = parseInt(el.getAttribute('data-line'));
                break;
            }
        }
        if (targetLine > 0) {
            vscode.postMessage({
                type: 'revealLine',
                line: targetLine
            });
        }
    }, 150); // Debounce
});
