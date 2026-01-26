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

// BINDIRECTIONAL SYNC: Smooth & Accurate
// We'll use a smoother, debounced scroll handling
let isSyncing = false; // Flag to prevent echo loops
let scrollTimeout;

const scrollHandler = () => {
    if (isSyncing) return; // Ignore scrolls triggered by sync

    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        const elements = document.querySelectorAll('[data-line]');
        let targetLine = 0;
        let minDist = Infinity;

        // Find line closest to top of viewport
        const viewTop = 0;

        for (let el of elements) {
            const rect = el.getBoundingClientRect();
            // We want elements near the top, but not way above
            const dist = Math.abs(rect.top - viewTop);

            // Check if element is roughly at the top (say within 300px)
            if (dist < minDist && rect.top < window.innerHeight / 2) {
                minDist = dist;
                targetLine = parseInt(el.getAttribute('data-line'));
            }
        }

        if (targetLine > 0) {
            vscode.postMessage({
                type: 'revealLine',
                line: targetLine
            });
        }
    }, 50); // Faster response than 150ms
};

window.addEventListener('scroll', scrollHandler, { capture: true });
document.addEventListener('scroll', scrollHandler, { capture: true });
document.body.addEventListener('scroll', scrollHandler, { capture: true });

// Listener for scroll commands from Extension (Preview Scroll)
window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'scrollTo') {
        const line = message.line;
        const totalLines = message.totalLines;

        // Try strict line match
        const el = document.querySelector(`[data-line="${line}"]`);

        isSyncing = true; // Set flag

        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (totalLines) {
            // Percentage Fallback
            const pct = line / totalLines;
            const targetY = pct * document.body.scrollHeight;
            window.scrollTo({ top: targetY, behavior: 'smooth' });
        }

        // Release flag after animation
        setTimeout(() => { isSyncing = false; }, 600);
    }
});
