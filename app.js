/**
 * PDF Toolkit — App Logic
 * Merge, Split, and Rotate PDFs in the browser.
 * Uses: pdf-lib (manipulation), PDF.js (rendering), JSZip, FileSaver
 */

// ============================================
// Initialize PDF.js worker
// ============================================
pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

// ============================================
// State
// ============================================
const state = {
    mode: 'merge', // 'merge' | 'split' | 'watermark'
    merge: {
        files: [],      // { id, name, size, arrayBuffer, pageCount }
        pages: [],      // { id, fileId, fileName, pageIndex, rotation, thumbCanvas }
        bookmarks: [],  // { id, title, pageIndex, level }
    },
    split: {
        file: null,       // { name, size, arrayBuffer, pageCount }
        pages: [],        // { id, pageIndex, rotation, selected, thumbCanvas }
        format: 'pdf',
        scale: 2,
    },
    preview: {
        pages: null,      // reference to current pages array
        currentIndex: 0,
        pdfDoc: null,     // for rendering
        pdfDocs: null,    // for merge multi-doc
    }
};

let fileIdCounter = 0;
let pageIdCounter = 0;
let bookmarkIdCounter = 0;

// ============================================
// DOM References
// ============================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
    // Tabs
    tabMerge: $('#tabMerge'),
    tabSplit: $('#tabSplit'),
    tabWatermark: $('#tabWatermark'),
    tabPrintConv: $('#tabPrintConv'),
    mergeSection: $('#mergeSection'),
    splitSection: $('#splitSection'),
    watermarkSection: $('#watermarkSection'),
    printConvSection: $('#printConvSection'),

    // Merge
    mergeDropZone: $('#mergeDropZone'),
    mergeFileInput: $('#mergeFileInput'),
    mergeSelectBtn: $('#mergeSelectBtn'),
    mergeFileList: $('#mergeFileList'),
    mergeFileItems: $('#mergeFileItems'),
    mergeFileCount: $('#mergeFileCount'),
    mergeAddMore: $('#mergeAddMore'),
    mergeSortAsc: $('#mergeSortAsc'),
    mergeSortDesc: $('#mergeSortDesc'),
    mergeClearAll: $('#mergeClearAll'),
    mergePagesSection: $('#mergePagesSection'),
    mergePagesGrid: $('#mergePagesGrid'),
    mergePageCount: $('#mergePageCount'),
    mergeRotateAll: $('#mergeRotateAll'),
    mergeBookmarkSection: $('#mergeBookmarkSection'),
    mergeBookmarkTree: $('#mergeBookmarkTree'),
    mergeBookmarkCount: $('#mergeBookmarkCount'),
    mergeBookmarkHint: $('#mergeBookmarkHint'),
    mergeAddBookmark: $('#mergeAddBookmark'),
    mergeAutoBookmark: $('#mergeAutoBookmark'),
    mergeClearBookmarks: $('#mergeClearBookmarks'),
    mergeActionBar: $('#mergeActionBar'),
    mergeActionInfo: $('#mergeActionInfo'),
    mergePdfBtn: $('#mergePdfBtn'),

    // Split
    splitDropZone: $('#splitDropZone'),
    splitFileInput: $('#splitFileInput'),
    splitSelectBtn: $('#splitSelectBtn'),
    splitFileInfo: $('#splitFileInfo'),
    splitFileName: $('#splitFileName'),
    splitFileMeta: $('#splitFileMeta'),
    splitRemoveFile: $('#splitRemoveFile'),
    splitPagesSection: $('#splitPagesSection'),
    splitPagesGrid: $('#splitPagesGrid'),
    splitPageCount: $('#splitPageCount'),
    splitSelectAll: $('#splitSelectAll'),
    splitRotateAll: $('#splitRotateAll'),
    splitActionBar: $('#splitActionBar'),
    splitFormatSelector: $('#splitFormatSelector'),
    splitScaleGroup: $('#splitScaleGroup'),
    splitScale: $('#splitScale'),
    splitMergeBtn: $('#splitMergeBtn'),
    splitMergeLabel: $('#splitMergeLabel'),
    splitDownloadBtn: $('#splitDownloadBtn'),
    splitDownloadLabel: $('#splitDownloadLabel'),

    // Preview modal
    previewModal: $('#previewModal'),
    previewTitle: $('#previewTitle'),
    previewClose: $('#previewClose'),
    previewPrev: $('#previewPrev'),
    previewNext: $('#previewNext'),
    previewCanvas: $('#previewCanvas'),
    previewCanvasWrap: $('#previewCanvasWrap'),
    previewPageInfo: $('#previewPageInfo'),
    previewRotateCCW: $('#previewRotateCCW'),
    previewRotateCW: $('#previewRotateCW'),
    previewRotationLabel: $('#previewRotationLabel'),

    // Loading
    loadingOverlay: $('#loadingOverlay'),
    loadingText: $('#loadingText'),
    loadingProgress: $('#loadingProgress'),

    // Toast
    toastContainer: $('#toastContainer'),
};

// ============================================
// Utilities
// ============================================
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function zeroPad(num, totalPages) {
    const digits = Math.max(4, String(totalPages).length);
    return String(num).padStart(digits, '0');
}

function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-message">${message}</span>`;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function showLoading(text = '처리 중...', progress = -1) {
    dom.loadingText.textContent = text;
    dom.loadingProgress.style.width = progress >= 0 ? `${progress}%` : '0%';
    dom.loadingOverlay.classList.remove('hidden');
}

function updateLoading(text, progress) {
    if (text) dom.loadingText.textContent = text;
    if (progress >= 0) dom.loadingProgress.style.width = `${progress}%`;
}

function hideLoading() {
    dom.loadingOverlay.classList.add('hidden');
}

// ============================================
// Tab Switching
// ============================================
function switchTab(tab) {
    const prevTab = state.mode;
    state.mode = tab;
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    $$('.tab-content').forEach(s => s.classList.remove('active'));

    // HWP 탭 이탈 시 백그라운드 서버 자동 종료 (file:// 모드일 때만 종료하여 http:로 직접 접속한 유저의 에셋 끊김 방지)
    if (prevTab === 'hwp' && tab !== 'hwp' && window.shutdownHwpServer) {
        if (window.location.protocol === 'file:') {
            window.shutdownHwpServer();
        }
    }

    if (tab === 'merge') {
        dom.tabMerge.classList.add('active');
        dom.mergeSection.classList.add('active');
    } else if (tab === 'split') {
        dom.tabSplit.classList.add('active');
        dom.splitSection.classList.add('active');
    } else if (tab === 'watermark') {
        dom.tabWatermark.classList.add('active');
        dom.watermarkSection.classList.add('active');
    } else if (tab === 'printconv') {
        dom.tabPrintConv.classList.add('active');
        dom.printConvSection.classList.add('active');
    } else if (tab === 'hwp') {
        $('#tabHwp').classList.add('active');
        $('#hwpSection').classList.add('active');
        // HWP 탭 진입 시 서버 상태 확인 및 자동 켜기
        if (window.wakeHwpServer) window.wakeHwpServer();
    }
}

dom.tabMerge.addEventListener('click', () => switchTab('merge'));
dom.tabSplit.addEventListener('click', () => switchTab('split'));
dom.tabWatermark.addEventListener('click', () => switchTab('watermark'));
dom.tabPrintConv.addEventListener('click', () => switchTab('printconv'));
$('#tabHwp').addEventListener('click', () => switchTab('hwp'));

// ============================================
// Drag & Drop Setup
// ============================================
const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/bmp', 'image/gif', 'image/tiff', 'image/webp'];
const SUPPORTED_TYPES = ['application/pdf', ...SUPPORTED_IMAGE_TYPES];

function isImageFile(file) {
    return SUPPORTED_IMAGE_TYPES.includes(file.type);
}

function isSupportedFile(file) {
    return SUPPORTED_TYPES.includes(file.type);
}

function setupDropZone(dropZone, fileInput, handler, acceptImages = false) {
    ['dragenter', 'dragover'].forEach(e => {
        dropZone.addEventListener(e, (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            dropZone.classList.add('drag-over');
        });
    });
    ['dragleave', 'drop'].forEach(e => {
        dropZone.addEventListener(e, (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            dropZone.classList.remove('drag-over');
        });
    });
    dropZone.addEventListener('drop', (ev) => {
        const filterFn = acceptImages ? isSupportedFile : (f => f.type === 'application/pdf');
        const files = [...ev.dataTransfer.files].filter(filterFn);
        if (files.length) handler(files);
        else showToast(acceptImages ? '지원되지 않는 파일 형식입니다.' : 'PDF 파일만 지원됩니다.', 'error');
    });
    dropZone.addEventListener('click', (ev) => {
        if (ev.target.closest('.btn-select') || ev.target === dropZone || ev.target.closest('.drop-zone-inner')) {
            fileInput.click();
        }
    });
    fileInput.addEventListener('change', () => {
        const filterFn = acceptImages ? isSupportedFile : (f => f.type === 'application/pdf');
        const files = [...fileInput.files].filter(filterFn);
        if (files.length) handler(files);
        fileInput.value = '';
    });
}

// ============================================
// Render page thumbnail to canvas
// ============================================
async function renderPageThumb(pdfDoc, pageIndex, rotation = 0, maxSize = 200) {
    const page = await pdfDoc.getPage(pageIndex + 1);
    const baseViewport = page.getViewport({ scale: 1, rotation });
    const scale = maxSize / Math.max(baseViewport.width, baseViewport.height);
    const viewport = page.getViewport({ scale, rotation });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
}

async function renderPagePreview(pdfDoc, pageIndex, rotation = 0, maxSize = 800) {
    const page = await pdfDoc.getPage(pageIndex + 1);
    const baseViewport = page.getViewport({ scale: 1, rotation });
    const scale = maxSize / Math.max(baseViewport.width, baseViewport.height);
    const viewport = page.getViewport({ scale, rotation });

    const canvas = dom.previewCanvas;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
}

// ============================================
//  Image Utilities
// ============================================

function loadImage(arrayBuffer, mimeType) {
    return new Promise((resolve, reject) => {
        const blob = new Blob([arrayBuffer], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { resolve(img); URL.revokeObjectURL(url); };
        img.onerror = () => { reject(new Error('이미지 로드 실패')); URL.revokeObjectURL(url); };
        img.src = url;
    });
}

function renderImageThumb(img, rotation = 0, maxSize = 200) {
    const rad = (rotation * Math.PI) / 180;
    const absS = Math.abs(Math.sin(rad)), absC = Math.abs(Math.cos(rad));
    const rotW = img.width * absC + img.height * absS;
    const rotH = img.width * absS + img.height * absC;
    const scale = maxSize / Math.max(rotW, rotH);
    const cw = Math.round(rotW * scale), ch = Math.round(rotH * scale);

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -img.width * scale / 2, -img.height * scale / 2, img.width * scale, img.height * scale);
    return canvas;
}

function renderImagePreview(img, rotation = 0, maxSize = 800) {
    const rad = (rotation * Math.PI) / 180;
    const absS = Math.abs(Math.sin(rad)), absC = Math.abs(Math.cos(rad));
    const rotW = img.width * absC + img.height * absS;
    const rotH = img.width * absS + img.height * absC;
    const scale = maxSize / Math.max(rotW, rotH);
    const cw = Math.round(rotW * scale), ch = Math.round(rotH * scale);

    const canvas = dom.previewCanvas;
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -img.width * scale / 2, -img.height * scale / 2, img.width * scale, img.height * scale);
}

// ============================================
//  MERGE Logic
// ============================================

async function handleMergeFiles(files) {
    showLoading('파일을 읽는 중...');
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            updateLoading(`${file.name} 로드 중...`, ((i + 1) / files.length) * 50);
            const arrayBuffer = await file.arrayBuffer();

            if (isImageFile(file)) {
                // Handle image file
                const img = await loadImage(arrayBuffer, file.type);
                const fileId = ++fileIdCounter;
                const fileEntry = {
                    id: fileId,
                    name: file.name,
                    size: file.size,
                    arrayBuffer: arrayBuffer,
                    pageCount: 1,
                    type: 'image',
                    mimeType: file.type,
                    imgWidth: img.width,
                    imgHeight: img.height,
                };
                state.merge.files.push(fileEntry);

                const thumbCanvas = renderImageThumb(img, 0);
                state.merge.pages.push({
                    id: ++pageIdCounter,
                    fileId,
                    fileName: file.name,
                    pageIndex: 0,
                    rotation: 0,
                    thumbCanvas,
                });
            } else {
                // Handle PDF file
                const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
                const fileId = ++fileIdCounter;
                const fileEntry = {
                    id: fileId,
                    name: file.name,
                    size: file.size,
                    arrayBuffer: arrayBuffer,
                    pageCount: pdfDoc.numPages,
                    type: 'pdf',
                };
                state.merge.files.push(fileEntry);

                for (let p = 0; p < pdfDoc.numPages; p++) {
                    updateLoading(`${file.name} - 페이지 ${p + 1}/${pdfDoc.numPages}`, 50 + ((i * pdfDoc.numPages + p) / (files.length * pdfDoc.numPages)) * 50);
                    const thumbCanvas = await renderPageThumb(pdfDoc, p, 0);
                    state.merge.pages.push({
                        id: ++pageIdCounter,
                        fileId,
                        fileName: file.name,
                        pageIndex: p,
                        rotation: 0,
                        thumbCanvas,
                    });
                }
                pdfDoc.destroy();
            }
        } catch (err) {
            console.error(err);
            showToast(`"${file.name}" 로드 실패: ${err.message}`, 'error');
        }
    }
    hideLoading();
    renderMergeUI();
    showToast(`${files.length}개 파일이 추가되었습니다.`, 'success');
}

function renderMergeUI() {
    const { files, pages } = state.merge;
    const hasFiles = files.length > 0;

    // Toggle sections
    dom.mergeDropZone.classList.toggle('hidden', hasFiles);
    dom.mergeFileList.classList.toggle('hidden', !hasFiles);
    dom.mergePagesSection.classList.toggle('hidden', !hasFiles);
    dom.mergeBookmarkSection.classList.toggle('hidden', !hasFiles);
    dom.mergeActionBar.classList.toggle('hidden', !hasFiles);

    // File count
    dom.mergeFileCount.textContent = files.length;
    dom.mergePageCount.textContent = pages.length;
    dom.mergeActionInfo.textContent = `${files.length}개 파일, ${pages.length}개 페이지`;

    // Render bookmarks
    renderBookmarkTree();

    // Render file list
    dom.mergeFileItems.innerHTML = '';
    files.forEach((file, index) => {
        const el = document.createElement('div');
        el.className = `file-item${file._selected ? ' file-selected' : ''}`;
        el.draggable = true;
        el.dataset.fileId = file.id;
        el.innerHTML = `
            <div class="file-drag-handle">
                <span></span><span></span><span></span>
            </div>
            <div class="file-icon-sm">${file.type === 'image'
                ? `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <rect x="3" y="1" width="14" height="18" rx="2" fill="#8EC8FF" opacity="0.15" stroke="#8EC8FF" stroke-width="1.2"/>
                    <text x="10" y="13" text-anchor="middle" fill="#8EC8FF" font-size="5" font-weight="700">IMG</text>
                   </svg>`
                : `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <rect x="3" y="1" width="14" height="18" rx="2" fill="#ef4444" opacity="0.15" stroke="#ef4444" stroke-width="1.2"/>
                    <text x="10" y="13" text-anchor="middle" fill="#ef4444" font-size="6" font-weight="700">PDF</text>
                   </svg>`}
            </div>
            <div class="file-details">
                <div class="file-name">${file.name}</div>
                <div class="file-meta">${formatFileSize(file.size)} · ${file.type === 'image' ? '이미지 1장' : file.pageCount + '페이지'}</div>
            </div>
            <div class="file-actions">
                <button class="btn-icon btn-danger" title="삭제" data-action="remove">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3L11 11M11 3L3 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                </button>
            </div>
        `;

        // File item actions
        el.querySelector('[data-action="remove"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFile(file.id);
        });

        // Multi-select on click
        el.addEventListener('click', (e) => {
            if (e.target.closest('[data-action]')) return;
            if (e.shiftKey && fileLastSelectedIdx >= 0) {
                const start = Math.min(fileLastSelectedIdx, index);
                const end = Math.max(fileLastSelectedIdx, index);
                for (let i = start; i <= end; i++) {
                    state.merge.files[i]._selected = true;
                }
            } else if (e.ctrlKey || e.metaKey) {
                file._selected = !file._selected;
            } else {
                const wasSelected = file._selected;
                state.merge.files.forEach(f => f._selected = false);
                file._selected = !wasSelected;
            }
            fileLastSelectedIdx = index;
            updateFileSelections();
        });

        // Multi-drag reorder
        el.addEventListener('dragstart', (e) => {
            if (!file._selected) {
                state.merge.files.forEach(f => f._selected = false);
                file._selected = true;
                updateFileSelections();
            }
            const selectedIds = state.merge.files.filter(f => f._selected).map(f => f.id);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/x-merge-files', JSON.stringify(selectedIds));
            el.classList.add('dragging');

            if (selectedIds.length > 1) {
                const ghost = document.createElement('div');
                ghost.textContent = `${selectedIds.length}개 파일 이동`;
                ghost.style.cssText = 'position:absolute;top:-9999px;padding:6px 14px;background:rgba(124,165,255,0.9);color:#fff;border-radius:6px;font-size:13px;font-weight:600;white-space:nowrap;pointer-events:none;';
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
                setTimeout(() => ghost.remove(), 0);
            }
        });
        el.addEventListener('dragend', () => {
            el.classList.remove('dragging');
            dom.mergeFileItems.querySelectorAll('.drag-target').forEach(x => x.classList.remove('drag-target'));
        });
        el.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('application/x-merge-files')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                el.classList.add('drag-target');
            }
        });
        el.addEventListener('dragleave', () => el.classList.remove('drag-target'));
        el.addEventListener('drop', (e) => {
            el.classList.remove('drag-target');
            if (!e.dataTransfer.types.includes('application/x-merge-files')) return;
            e.preventDefault();
            e.stopPropagation();

            const selectedIds = JSON.parse(e.dataTransfer.getData('application/x-merge-files'));
            const movedFiles = [];
            const remaining = [];
            state.merge.files.forEach(f => {
                if (selectedIds.includes(f.id)) movedFiles.push(f);
                else remaining.push(f);
            });
            let insertIdx = remaining.findIndex(f => f.id === file.id);
            if (insertIdx === -1) insertIdx = remaining.length;
            remaining.splice(insertIdx, 0, ...movedFiles);
            state.merge.files = remaining;

            rebuildMergePages();
            renderMergeUI();
            showToast(`${movedFiles.length}개 파일이 이동되었습니다.`, 'success');
        });

        dom.mergeFileItems.appendChild(el);
    });

    // Render pages grid
    renderMergePagesGrid();
}

function renderMergePagesGrid() {
    dom.mergePagesGrid.innerHTML = '';
    state.merge.pages.forEach((page, idx) => {
        const card = createPageCard(page, idx, 'merge');

        // Multi-select on click
        card.addEventListener('click', (e) => {
            // Don't toggle if clicking on an action button
            if (e.target.closest('[data-action]')) return;
            if (e.shiftKey && mergeLastSelectedIdx >= 0) {
                // Shift+click: range select
                const start = Math.min(mergeLastSelectedIdx, idx);
                const end = Math.max(mergeLastSelectedIdx, idx);
                for (let i = start; i <= end; i++) {
                    state.merge.pages[i]._selected = true;
                }
            } else if (e.ctrlKey || e.metaKey) {
                // Ctrl+click: toggle single
                page._selected = !page._selected;
            } else {
                // Plain click: toggle single, clear others
                const wasSelected = page._selected;
                state.merge.pages.forEach(p => p._selected = false);
                page._selected = !wasSelected;
            }
            mergeLastSelectedIdx = idx;
            updateMergePageSelections();
        });

        // Drag for reorder (supports multi)
        card.draggable = true;
        card.addEventListener('dragstart', (e) => {
            // If the dragged page is not selected, select only it
            if (!page._selected) {
                state.merge.pages.forEach(p => p._selected = false);
                page._selected = true;
                updateMergePageSelections();
            }
            const selectedIds = state.merge.pages.filter(p => p._selected).map(p => p.id);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/x-merge-pages', JSON.stringify(selectedIds));
            card.classList.add('dragging');
            mergeDragSourceIds = selectedIds;

            // Ghost label showing count
            if (selectedIds.length > 1) {
                const ghost = document.createElement('div');
                ghost.textContent = `${selectedIds.length}페이지 이동`;
                ghost.style.cssText = 'position:absolute;top:-9999px;padding:6px 14px;background:rgba(124,165,255,0.9);color:#fff;border-radius:6px;font-size:13px;font-weight:600;white-space:nowrap;pointer-events:none;';
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
                setTimeout(() => ghost.remove(), 0);
            }
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            mergeDragSourceIds = null;
            dom.mergePagesGrid.querySelectorAll('.drag-target').forEach(el => el.classList.remove('drag-target'));
        });
        card.addEventListener('dragover', (e) => {
            // Only accept page reorder drags, not file drops
            if (e.dataTransfer.types.includes('application/x-merge-pages')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                card.classList.add('drag-target');
            }
        });
        card.addEventListener('dragleave', () => card.classList.remove('drag-target'));
        card.addEventListener('drop', (e) => {
            card.classList.remove('drag-target');
            if (!e.dataTransfer.types.includes('application/x-merge-pages')) return;
            e.preventDefault();
            e.stopPropagation();

            const selectedIds = JSON.parse(e.dataTransfer.getData('application/x-merge-pages'));
            const targetIdx = state.merge.pages.findIndex(p => p.id === page.id);
            if (targetIdx === -1) return;

            // Extract selected pages (in order)
            const movedPages = [];
            const remaining = [];
            state.merge.pages.forEach(p => {
                if (selectedIds.includes(p.id)) movedPages.push(p);
                else remaining.push(p);
            });

            // Find insertion point in remaining array
            let insertIdx = remaining.findIndex(p => p.id === page.id);
            if (insertIdx === -1) insertIdx = remaining.length;

            // Insert moved pages at target position
            remaining.splice(insertIdx, 0, ...movedPages);
            state.merge.pages = remaining;

            renderMergePagesGrid();
            showToast(`${movedPages.length}페이지가 이동되었습니다.`, 'success');
        });

        dom.mergePagesGrid.appendChild(card);
    });
}

// Multi-select state for merge pages
let mergeLastSelectedIdx = -1;
let mergeDragSourceIds = null;

function updateMergePageSelections() {
    const cards = dom.mergePagesGrid.querySelectorAll('.page-card');
    cards.forEach((card, idx) => {
        card.classList.toggle('multi-selected', !!state.merge.pages[idx]?._selected);
    });
}

function moveFile(fileId, direction) {
    const idx = state.merge.files.findIndex(f => f.id === fileId);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= state.merge.files.length) return;

    // Swap files
    [state.merge.files[idx], state.merge.files[newIdx]] = [state.merge.files[newIdx], state.merge.files[idx]];

    // Rebuild pages in file order
    rebuildMergePages();
    renderMergeUI();
}

function reorderFiles(draggedId, targetId) {
    const dragIdx = state.merge.files.findIndex(f => f.id === draggedId);
    const targetIdx = state.merge.files.findIndex(f => f.id === targetId);
    if (dragIdx === -1 || targetIdx === -1) return;

    const [file] = state.merge.files.splice(dragIdx, 1);
    state.merge.files.splice(targetIdx, 0, file);
    rebuildMergePages();
    renderMergeUI();
}

// File list multi-select state
let fileLastSelectedIdx = -1;

function updateFileSelections() {
    const items = dom.mergeFileItems.querySelectorAll('.file-item');
    items.forEach((item, idx) => {
        item.classList.toggle('file-selected', !!state.merge.files[idx]?._selected);
    });
}

// Sort files
function sortFiles(direction) {
    state.merge.files.sort((a, b) => {
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();
        return direction === 'asc'
            ? nameA.localeCompare(nameB, 'ko')
            : nameB.localeCompare(nameA, 'ko');
    });
    rebuildMergePages();
    renderMergeUI();
    showToast(direction === 'asc' ? '이름 오름차순으로 정렬되었습니다.' : '이름 내림차순으로 정렬되었습니다.', 'success');
}

function rebuildMergePages() {
    // Keep rotation info by fileId + pageIndex
    const rotationMap = {};
    state.merge.pages.forEach(p => {
        rotationMap[`${p.fileId}-${p.pageIndex}`] = p.rotation;
    });

    const newPages = [];
    state.merge.files.forEach(file => {
        const filePages = state.merge.pages.filter(p => p.fileId === file.id);
        filePages.sort((a, b) => a.pageIndex - b.pageIndex);
        filePages.forEach(p => {
            p.rotation = rotationMap[`${p.fileId}-${p.pageIndex}`] || 0;
            newPages.push(p);
        });
    });
    state.merge.pages = newPages;
}

function removeFile(fileId) {
    state.merge.files = state.merge.files.filter(f => f.id !== fileId);
    state.merge.pages = state.merge.pages.filter(p => p.fileId !== fileId);
    renderMergeUI();
    showToast('파일이 제거되었습니다.', 'info');
}

// ============================================
// Page Card Component
// ============================================
function createPageCard(page, index, mode) {
    const card = document.createElement('div');
    card.className = `page-card${page.selected ? ' selected' : ''}`;
    card.dataset.pageId = page.id;

    const checkSvg = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    card.innerHTML = `
        ${mode === 'split' ? `<div class="select-check">${checkSvg}</div>` : ''}
        <div class="page-thumb-wrap"></div>
        <div class="page-overlay">
            <div class="page-overlay-actions">
                <button class="btn-icon" title="반시계 90° 회전" data-action="rotate-ccw">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 6C4 4 5.8 2.5 8 2.5C10.2 2.5 12 4 12 6C12 8 10.2 9.5 8 9.5H4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M6.5 8L4.5 9.5L6.5 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <button class="btn-icon" title="시계 90° 회전" data-action="rotate-cw">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M10 6C10 4 8.2 2.5 6 2.5C3.8 2.5 2 4 2 6C2 8 3.8 9.5 6 9.5H9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M7.5 8L9.5 9.5L7.5 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <button class="btn-icon" title="미리보기" data-action="preview">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7C1 7 3.5 3 7 3C10.5 3 13 7 13 7C13 7 10.5 11 7 11C3.5 11 1 7 1 7Z" stroke="currentColor" stroke-width="1.3"/><circle cx="7" cy="7" r="2" stroke="currentColor" stroke-width="1.3"/></svg>
                </button>
            </div>
        </div>
        <div class="page-info">
            <span class="page-label">페이지 ${index + 1}</span>
            <span class="page-rotation-badge ${page.rotation !== 0 ? 'visible' : ''}">${page.rotation}°</span>
        </div>
        ${mode === 'merge' ? `<div class="page-source-label" title="${page.fileName}">${page.fileName}</div>` : ''}
    `;

    // Insert thumbnail
    const thumbWrap = card.querySelector('.page-thumb-wrap');
    if (page.thumbCanvas) {
        thumbWrap.appendChild(page.thumbCanvas);
    }

    // Events
    card.querySelector('[data-action="rotate-ccw"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        rotatePage(page, -90, mode);
    });

    card.querySelector('[data-action="rotate-cw"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        rotatePage(page, 90, mode);
    });

    card.querySelector('[data-action="preview"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openPreview(mode, index);
    });

    if (mode === 'split') {
        card.querySelector('.select-check')?.addEventListener('click', (e) => {
            e.stopPropagation();
            page.selected = !page.selected;
            card.classList.toggle('selected', page.selected);
            updateSplitUI();
        });

        card.addEventListener('click', () => {
            page.selected = !page.selected;
            card.classList.toggle('selected', page.selected);
            updateSplitUI();
        });
    }

    return card;
}

async function rotatePage(page, degrees, mode) {
    page.rotation = ((page.rotation + degrees) % 360 + 360) % 360;

    // Re-render thumbnail
    showLoading('회전 중...');
    try {
        if (mode === 'merge') {
            const file = state.merge.files.find(f => f.id === page.fileId);
            if (file.type === 'image') {
                const img = await loadImage(file.arrayBuffer, file.mimeType);
                page.thumbCanvas = renderImageThumb(img, page.rotation);
            } else {
                const pdfDoc = await pdfjsLib.getDocument({ data: file.arrayBuffer.slice(0) }).promise;
                page.thumbCanvas = await renderPageThumb(pdfDoc, page.pageIndex, page.rotation);
                pdfDoc.destroy();
            }
            renderMergePagesGrid();
        } else {
            const pdfDoc = await pdfjsLib.getDocument({ data: state.split.file.arrayBuffer.slice(0) }).promise;
            page.thumbCanvas = await renderPageThumb(pdfDoc, page.pageIndex, page.rotation);
            pdfDoc.destroy();
            renderSplitPagesGrid();
        }
    } catch (err) {
        showToast('회전 실패: ' + err.message, 'error');
    }
    hideLoading();
}

// ============================================
//  BOOKMARK Logic
// ============================================

function addBookmark(title = '새 북마크', pageIndex = 0, level = 0) {
    state.merge.bookmarks.push({
        id: ++bookmarkIdCounter,
        title,
        pageIndex,
        level,
    });
    renderBookmarkTree();
}

function removeBookmark(id) {
    state.merge.bookmarks = state.merge.bookmarks.filter(b => b.id !== id);
    renderBookmarkTree();
}

function moveBookmark(id, direction) {
    const idx = state.merge.bookmarks.findIndex(b => b.id === id);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= state.merge.bookmarks.length) return;
    [state.merge.bookmarks[idx], state.merge.bookmarks[newIdx]] =
        [state.merge.bookmarks[newIdx], state.merge.bookmarks[idx]];
    renderBookmarkTree();
}

function indentBookmark(id, direction) {
    const bm = state.merge.bookmarks.find(b => b.id === id);
    if (!bm) return;
    const newLevel = bm.level + direction;
    if (newLevel < 0 || newLevel > 2) return;

    // Can only indent if there's a parent above
    if (direction > 0) {
        const idx = state.merge.bookmarks.indexOf(bm);
        let hasParent = false;
        for (let i = idx - 1; i >= 0; i--) {
            if (state.merge.bookmarks[i].level < newLevel) { hasParent = true; break; }
        }
        if (!hasParent) return;
    }

    bm.level = newLevel;
    renderBookmarkTree();
}

function autoGenerateBookmarks() {
    state.merge.bookmarks = [];
    let pageOffset = 0;
    state.merge.files.forEach(file => {
        const baseName = file.name.replace(/\.pdf$/i, '');
        addBookmark(baseName, pageOffset, 0);
        pageOffset += file.pageCount;
    });
    showToast('파일별 북마크가 자동 생성되었습니다.', 'success');
}

function renderBookmarkTree() {
    const bookmarks = state.merge.bookmarks;
    const totalPages = state.merge.pages.length;
    dom.mergeBookmarkCount.textContent = bookmarks.length;
    dom.mergeBookmarkHint.classList.toggle('hidden', bookmarks.length > 0);

    dom.mergeBookmarkTree.innerHTML = '';

    if (bookmarks.length === 0) {
        return;
    }

    bookmarks.forEach((bm, idx) => {
        const item = document.createElement('div');
        item.className = `bookmark-item level-${bm.level}`;
        item.dataset.bmId = bm.id;

        // Bookmark icon (different per level)
        const iconSvgs = [
            '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 1.5h8a1 1 0 011 1v12l-5-2.5L3 14.5v-12a1 1 0 011-1z" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>',
            '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M3 8h7M3 12h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
            '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="8" r="1.5" fill="currentColor"/><path d="M8 8h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
        ];

        // Page select options
        let pageOptions = '';
        for (let p = 0; p < totalPages; p++) {
            const sel = p === bm.pageIndex ? ' selected' : '';
            pageOptions += `<option value="${p}"${sel}>p.${p + 1}</option>`;
        }

        item.innerHTML = `
            <div class="bookmark-icon">${iconSvgs[bm.level] || iconSvgs[0]}</div>
            <input class="bookmark-title-input" value="${bm.title.replace(/"/g, '&quot;')}" placeholder="제목 입력" />
            <select class="bookmark-page-select">${pageOptions}</select>
            <div class="bookmark-controls">
                <button class="bm-btn" title="들여쓰기 (하위)" data-action="indent">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2L8 6L4 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <button class="bm-btn" title="내어쓰기 (상위)" data-action="outdent">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6L8 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <button class="bm-btn" title="위로" data-action="up">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 9V3M3 5.5L6 3L9 5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <button class="bm-btn" title="아래로" data-action="down">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 3V9M3 6.5L6 9L9 6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <button class="bm-btn bm-btn-danger" title="삭제" data-action="delete">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3L9 9M9 3L3 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                </button>
            </div>
        `;

        // Event: title change
        item.querySelector('.bookmark-title-input').addEventListener('input', (e) => {
            bm.title = e.target.value;
        });

        // Event: page change
        item.querySelector('.bookmark-page-select').addEventListener('change', (e) => {
            bm.pageIndex = parseInt(e.target.value);
        });

        // Event: controls
        item.querySelector('[data-action="indent"]').addEventListener('click', () => indentBookmark(bm.id, 1));
        item.querySelector('[data-action="outdent"]').addEventListener('click', () => indentBookmark(bm.id, -1));
        item.querySelector('[data-action="up"]').addEventListener('click', () => moveBookmark(bm.id, -1));
        item.querySelector('[data-action="down"]').addEventListener('click', () => moveBookmark(bm.id, 1));
        item.querySelector('[data-action="delete"]').addEventListener('click', () => removeBookmark(bm.id));

        dom.mergeBookmarkTree.appendChild(item);
    });
}

// Convert flat bookmark list to nested tree for PDF outline generation
function bookmarksToTree(bookmarks) {
    const tree = [];
    const stack = [{ children: tree, level: -1 }];

    for (const bm of bookmarks) {
        const node = { title: bm.title, pageIndex: bm.pageIndex, children: [] };
        while (stack.length > 1 && stack[stack.length - 1].level >= bm.level) {
            stack.pop();
        }
        stack[stack.length - 1].children.push(node);
        stack.push({ ...node, level: bm.level });
    }
    return tree;
}

// Embed PDF outlines (bookmarks) into a PDFDocument using pdf-lib low-level API
function embedBookmarks(pdfDoc, bookmarks) {
    if (!bookmarks || bookmarks.length === 0) return;

    const tree = bookmarksToTree(bookmarks);
    const context = pdfDoc.context;

    function countDescendants(nodes) {
        let count = 0;
        for (const n of nodes) {
            count++;
            count += countDescendants(n.children);
        }
        return count;
    }

    function createItems(items, parentRef) {
        const entries = items.map(item => {
            const pageIndex = Math.min(item.pageIndex, pdfDoc.getPageCount() - 1);
            const pageRef = pdfDoc.getPage(pageIndex).ref;

            const dict = context.obj({
                Title: PDFLib.PDFHexString.fromText(item.title),
                Parent: parentRef,
                Dest: [pageRef, PDFLib.PDFName.of('Fit')],
            });
            const ref = context.register(dict);
            return { ref, dict, item };
        });

        // Link siblings
        for (let i = 0; i < entries.length; i++) {
            if (i > 0) entries[i].dict.set(PDFLib.PDFName.of('Prev'), entries[i - 1].ref);
            if (i < entries.length - 1) entries[i].dict.set(PDFLib.PDFName.of('Next'), entries[i + 1].ref);

            // Recurse children
            if (entries[i].item.children.length > 0) {
                const childEntries = createItems(entries[i].item.children, entries[i].ref);
                entries[i].dict.set(PDFLib.PDFName.of('First'), childEntries[0].ref);
                entries[i].dict.set(PDFLib.PDFName.of('Last'), childEntries[childEntries.length - 1].ref);
                // Positive count = open by default
                const desc = countDescendants(entries[i].item.children);
                entries[i].dict.set(PDFLib.PDFName.of('Count'), PDFLib.PDFNumber.of(desc));
            }
        }

        return entries;
    }

    // Create root outline dictionary
    const outlineDict = context.obj({});
    const outlineRef = context.register(outlineDict);

    const topEntries = createItems(tree, outlineRef);

    if (topEntries.length > 0) {
        outlineDict.set(PDFLib.PDFName.of('Type'), PDFLib.PDFName.of('Outlines'));
        outlineDict.set(PDFLib.PDFName.of('First'), topEntries[0].ref);
        outlineDict.set(PDFLib.PDFName.of('Last'), topEntries[topEntries.length - 1].ref);
        const totalCount = countDescendants(tree);
        outlineDict.set(PDFLib.PDFName.of('Count'), PDFLib.PDFNumber.of(totalCount));

        pdfDoc.catalog.set(PDFLib.PDFName.of('Outlines'), outlineRef);
        // Open bookmark panel by default
        pdfDoc.catalog.set(PDFLib.PDFName.of('PageMode'), PDFLib.PDFName.of('UseOutlines'));
    }
}

// ============================================
//  MERGE: Execute
// ============================================
async function executeMerge() {
    if (state.merge.pages.length === 0) return;

    showLoading('PDF 병합 중...');
    try {
        const mergedPdf = await PDFLib.PDFDocument.create();
        const total = state.merge.pages.length;

        // Group pages by file
        const fileBufferMap = {};
        state.merge.files.forEach(f => {
            fileBufferMap[f.id] = f.arrayBuffer;
        });

        // Build file type map
        const fileTypeMap = {};
        state.merge.files.forEach(f => { fileTypeMap[f.id] = f; });

        for (let i = 0; i < total; i++) {
            const page = state.merge.pages[i];
            updateLoading(`페이지 ${i + 1}/${total} 처리 중...`, ((i + 1) / total) * 100);

            const fileInfo = fileTypeMap[page.fileId];

            if (fileInfo.type === 'image') {
                // Embed image as a PDF page
                const imgBytes = new Uint8Array(fileInfo.arrayBuffer);
                let embeddedImg;
                const mime = fileInfo.mimeType;
                if (mime === 'image/png') {
                    embeddedImg = await mergedPdf.embedPng(imgBytes);
                } else if (mime === 'image/jpeg') {
                    embeddedImg = await mergedPdf.embedJpg(imgBytes);
                } else {
                    // For BMP, GIF, TIFF, WebP: convert to PNG via canvas
                    const img = await loadImage(fileInfo.arrayBuffer, mime);
                    const cvs = document.createElement('canvas');
                    cvs.width = img.width; cvs.height = img.height;
                    cvs.getContext('2d').drawImage(img, 0, 0);
                    const pngBlob = await new Promise(r => cvs.toBlob(r, 'image/png'));
                    const pngBuf = await pngBlob.arrayBuffer();
                    embeddedImg = await mergedPdf.embedPng(new Uint8Array(pngBuf));
                }

                // Create page at original image dimensions, draw image, then apply rotation
                const newPage = mergedPdf.addPage([embeddedImg.width, embeddedImg.height]);
                newPage.drawImage(embeddedImg, {
                    x: 0, y: 0,
                    width: embeddedImg.width,
                    height: embeddedImg.height,
                });
                const rot = ((page.rotation % 360) + 360) % 360;
                if (rot !== 0) {
                    newPage.setRotation(PDFLib.degrees(rot));
                }
            } else {
                // PDF page
                const srcPdf = await PDFLib.PDFDocument.load(fileBufferMap[page.fileId]);
                const [copiedPage] = await mergedPdf.copyPages(srcPdf, [page.pageIndex]);

                if (page.rotation !== 0) {
                    const currentRotation = copiedPage.getRotation().angle;
                    copiedPage.setRotation(PDFLib.degrees(currentRotation + page.rotation));
                }

                mergedPdf.addPage(copiedPage);
            }
        }

        // Embed bookmarks/outlines
        if (state.merge.bookmarks.length > 0) {
            updateLoading('북마크 삽입 중...', 100);
            embedBookmarks(mergedPdf, state.merge.bookmarks);
        }

        const pdfBytes = await mergedPdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        saveAs(blob, 'merged.pdf');
        showToast('PDF가 성공적으로 병합되었습니다!', 'success');
    } catch (err) {
        console.error(err);
        showToast('병합 실패: ' + err.message, 'error');
    }
    hideLoading();
}

// ============================================
//  SPLIT Logic
// ============================================

async function handleSplitFile(files) {
    if (files.length === 0) return;
    const file = files[0];

    showLoading('PDF 파일을 읽는 중...');
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;

        state.split.file = {
            name: file.name,
            size: file.size,
            arrayBuffer: arrayBuffer,
            pageCount: pdfDoc.numPages,
        };

        state.split.pages = [];

        for (let p = 0; p < pdfDoc.numPages; p++) {
            updateLoading(`페이지 ${p + 1}/${pdfDoc.numPages} 렌더링 중...`, ((p + 1) / pdfDoc.numPages) * 100);
            const thumbCanvas = await renderPageThumb(pdfDoc, p, 0);
            state.split.pages.push({
                id: ++pageIdCounter,
                pageIndex: p,
                rotation: 0,
                selected: true,
                thumbCanvas,
            });
        }
        pdfDoc.destroy();

        renderSplitUI();
        showToast(`${pdfDoc.numPages}페이지가 로드되었습니다.`, 'success');
    } catch (err) {
        console.error(err);
        showToast(`파일 로드 실패: ${err.message}`, 'error');
    }
    hideLoading();
}

function renderSplitUI() {
    const hasFile = state.split.file !== null;
    dom.splitDropZone.classList.toggle('hidden', hasFile);
    dom.splitFileInfo.classList.toggle('hidden', !hasFile);
    dom.splitPagesSection.classList.toggle('hidden', !hasFile);
    dom.splitActionBar.classList.toggle('hidden', !hasFile);

    if (hasFile) {
        dom.splitFileName.textContent = state.split.file.name;
        dom.splitFileMeta.textContent = `${formatFileSize(state.split.file.size)} · ${state.split.file.pageCount}페이지`;
        dom.splitPageCount.textContent = state.split.pages.length;
    }

    renderSplitPagesGrid();
    updateSplitUI();
}

function renderSplitPagesGrid() {
    dom.splitPagesGrid.innerHTML = '';
    state.split.pages.forEach((page, idx) => {
        const card = createPageCard(page, idx, 'split');
        dom.splitPagesGrid.appendChild(card);
    });
}

function updateSplitUI() {
    const selectedCount = state.split.pages.filter(p => p.selected).length;
    const totalCount = state.split.pages.length;

    // Update merge button label
    dom.splitMergeLabel.textContent =
        selectedCount === totalCount
            ? `전체 ${totalCount}페이지 → 하나의 PDF`
            : `선택한 ${selectedCount}페이지 → 하나의 PDF`;
    dom.splitMergeBtn.disabled = selectedCount === 0;

    // Update split download button label
    dom.splitDownloadLabel.textContent =
        selectedCount === totalCount
            ? `전체 ${totalCount}페이지 개별 분할`
            : `선택한 ${selectedCount}페이지 개별 분할`;
    dom.splitDownloadBtn.disabled = selectedCount === 0;

    // Show/hide format options based on mode
    // (merge always outputs PDF, split can output PDF/PNG/JPEG)

    // Update select all button text
    dom.splitSelectAll.querySelector('span')?.remove();
    const span = document.createElement('span');
    span.textContent = selectedCount === totalCount ? '전체 해제' : '전체 선택';
    dom.splitSelectAll.appendChild(span);
    // Remove old text nodes
    dom.splitSelectAll.childNodes.forEach(n => {
        if (n.nodeType === Node.TEXT_NODE) n.remove();
    });
}

function removeSplitFile() {
    state.split.file = null;
    state.split.pages = [];
    renderSplitUI();
    dom.splitDropZone.classList.remove('hidden');
    dom.splitFileInfo.classList.add('hidden');
    dom.splitPagesSection.classList.add('hidden');
    dom.splitActionBar.classList.add('hidden');
}

// ============================================
//  SPLIT: Execute (individual split)
// ============================================
async function executeSplit() {
    const selectedPages = state.split.pages.filter(p => p.selected);
    if (selectedPages.length === 0) return;

    const format = state.split.format;
    const scale = state.split.scale;
    const totalPages = state.split.file.pageCount;

    showLoading('분할 중...');
    try {
        if (selectedPages.length === 1 && format === 'pdf') {
            // Single page PDF
            const page = selectedPages[0];
            const srcPdf = await PDFLib.PDFDocument.load(state.split.file.arrayBuffer);
            const newPdf = await PDFLib.PDFDocument.create();
            const [copiedPage] = await newPdf.copyPages(srcPdf, [page.pageIndex]);
            if (page.rotation !== 0) {
                const cur = copiedPage.getRotation().angle;
                copiedPage.setRotation(PDFLib.degrees(cur + page.rotation));
            }
            newPdf.addPage(copiedPage);
            const pdfBytes = await newPdf.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const baseName = state.split.file.name.replace(/\.pdf$/i, '');
            saveAs(blob, `${baseName}_page${zeroPad(page.pageIndex + 1, totalPages)}.pdf`);
        } else if (format === 'pdf') {
            // Multiple pages as separate PDFs in a zip
            const zip = new JSZip();
            const srcPdf = await PDFLib.PDFDocument.load(state.split.file.arrayBuffer);
            const baseName = state.split.file.name.replace(/\.pdf$/i, '');

            for (let i = 0; i < selectedPages.length; i++) {
                const page = selectedPages[i];
                updateLoading(`페이지 ${i + 1}/${selectedPages.length}`, ((i + 1) / selectedPages.length) * 100);
                const newPdf = await PDFLib.PDFDocument.create();
                const [copiedPage] = await newPdf.copyPages(srcPdf, [page.pageIndex]);
                if (page.rotation !== 0) {
                    const cur = copiedPage.getRotation().angle;
                    copiedPage.setRotation(PDFLib.degrees(cur + page.rotation));
                }
                newPdf.addPage(copiedPage);
                const pdfBytes = await newPdf.save();
                zip.file(`${baseName}_page${zeroPad(page.pageIndex + 1, totalPages)}.pdf`, pdfBytes);
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            saveAs(zipBlob, `${baseName}_pages.zip`);
        } else {
            // Image format (png / jpeg)
            const pdfDoc = await pdfjsLib.getDocument({ data: state.split.file.arrayBuffer.slice(0) }).promise;
            const baseName = state.split.file.name.replace(/\.pdf$/i, '');

            if (selectedPages.length === 1) {
                const page = selectedPages[0];
                const pdfPage = await pdfDoc.getPage(page.pageIndex + 1);
                const viewport = pdfPage.getViewport({ scale: scale, rotation: page.rotation });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                await pdfPage.render({ canvasContext: ctx, viewport }).promise;

                canvas.toBlob((blob) => {
                    saveAs(blob, `${baseName}_page${zeroPad(page.pageIndex + 1, totalPages)}.${format}`);
                }, format === 'png' ? 'image/png' : 'image/jpeg', 0.92);
            } else {
                const zip = new JSZip();
                for (let i = 0; i < selectedPages.length; i++) {
                    const page = selectedPages[i];
                    updateLoading(`페이지 ${i + 1}/${selectedPages.length}`, ((i + 1) / selectedPages.length) * 100);
                    const pdfPage = await pdfDoc.getPage(page.pageIndex + 1);
                    const viewport = pdfPage.getViewport({ scale: scale, rotation: page.rotation });
                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    const ctx = canvas.getContext('2d');
                    await pdfPage.render({ canvasContext: ctx, viewport }).promise;

                    const blob = await new Promise(resolve => {
                        canvas.toBlob(resolve, format === 'png' ? 'image/png' : 'image/jpeg', 0.92);
                    });
                    zip.file(`${baseName}_page${zeroPad(page.pageIndex + 1, totalPages)}.${format}`, blob);
                }
                const zipBlob = await zip.generateAsync({ type: 'blob' });
                saveAs(zipBlob, `${baseName}_pages.zip`);
            }
            pdfDoc.destroy();
        }
        showToast('다운로드가 완료되었습니다!', 'success');
    } catch (err) {
        console.error(err);
        showToast('분할 실패: ' + err.message, 'error');
    }
    hideLoading();
}

// ============================================
//  SPLIT: Merge selected into single PDF
// ============================================
async function executeSplitMerge() {
    const selectedPages = state.split.pages.filter(p => p.selected);
    if (selectedPages.length === 0) return;

    showLoading('선택 페이지를 하나의 PDF로 추출 중...');
    try {
        const srcPdf = await PDFLib.PDFDocument.load(state.split.file.arrayBuffer);
        const newPdf = await PDFLib.PDFDocument.create();
        const baseName = state.split.file.name.replace(/\.pdf$/i, '');

        for (let i = 0; i < selectedPages.length; i++) {
            const page = selectedPages[i];
            updateLoading(`페이지 ${i + 1}/${selectedPages.length}`, ((i + 1) / selectedPages.length) * 100);
            const [copiedPage] = await newPdf.copyPages(srcPdf, [page.pageIndex]);
            if (page.rotation !== 0) {
                const cur = copiedPage.getRotation().angle;
                copiedPage.setRotation(PDFLib.degrees(cur + page.rotation));
            }
            newPdf.addPage(copiedPage);
        }

        const pdfBytes = await newPdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        saveAs(blob, `${baseName}_extracted_${selectedPages.length}pages.pdf`);
        showToast(`${selectedPages.length}페이지가 하나의 PDF로 추출되었습니다!`, 'success');
    } catch (err) {
        console.error(err);
        showToast('추출 실패: ' + err.message, 'error');
    }
    hideLoading();
}

// ============================================
//  Preview Modal
// ============================================
async function openPreview(mode, pageIndex) {
    const pages = mode === 'merge' ? state.merge.pages : state.split.pages;
    state.preview.pages = pages;
    state.preview.currentIndex = pageIndex;

    dom.previewModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    await renderPreview();
}

function closePreview() {
    dom.previewModal.classList.add('hidden');
    document.body.style.overflow = '';
    if (state.preview.pdfDoc) {
        state.preview.pdfDoc.destroy();
        state.preview.pdfDoc = null;
    }
    state.preview.pdfDocs = null;
}

async function renderPreview() {
    const pages = state.preview.pages;
    const idx = state.preview.currentIndex;
    if (!pages || idx < 0 || idx >= pages.length) return;

    const page = pages[idx];
    dom.previewPageInfo.textContent = `${idx + 1} / ${pages.length}`;
    dom.previewRotationLabel.textContent = `${page.rotation}°`;
    dom.previewTitle.textContent = `페이지 ${idx + 1}${page.fileName ? ' — ' + page.fileName : ''}`;

    // Nav buttons
    dom.previewPrev.style.visibility = idx > 0 ? 'visible' : 'hidden';
    dom.previewNext.style.visibility = idx < pages.length - 1 ? 'visible' : 'hidden';

    try {
        const maxSize = Math.min(window.innerWidth * 0.8, window.innerHeight * 0.7, 900);

        if (state.mode === 'merge') {
            const file = state.merge.files.find(f => f.id === page.fileId);
            if (file.type === 'image') {
                const img = await loadImage(file.arrayBuffer, file.mimeType);
                renderImagePreview(img, page.rotation, maxSize);
            } else {
                const pdfDoc = await pdfjsLib.getDocument({ data: file.arrayBuffer.slice(0) }).promise;
                await renderPagePreview(pdfDoc, page.pageIndex, page.rotation, maxSize);
                pdfDoc.destroy();
            }
        } else {
            const pdfDoc = await pdfjsLib.getDocument({ data: state.split.file.arrayBuffer.slice(0) }).promise;
            await renderPagePreview(pdfDoc, page.pageIndex, page.rotation, maxSize);
            pdfDoc.destroy();
        }
    } catch (err) {
        console.error('Preview render error:', err);
    }
}

async function previewRotate(degrees) {
    const pages = state.preview.pages;
    const idx = state.preview.currentIndex;
    if (!pages || !pages[idx]) return;

    const page = pages[idx];
    page.rotation = ((page.rotation + degrees) % 360 + 360) % 360;

    // Re-render thumb and preview
    try {
        if (state.mode === 'merge') {
            const file = state.merge.files.find(f => f.id === page.fileId);
            if (file.type === 'image') {
                const img = await loadImage(file.arrayBuffer, file.mimeType);
                page.thumbCanvas = renderImageThumb(img, page.rotation);
            } else {
                const pdfDoc = await pdfjsLib.getDocument({ data: file.arrayBuffer.slice(0) }).promise;
                page.thumbCanvas = await renderPageThumb(pdfDoc, page.pageIndex, page.rotation);
                pdfDoc.destroy();
            }
            renderMergePagesGrid();
        } else {
            const pdfDoc = await pdfjsLib.getDocument({ data: state.split.file.arrayBuffer.slice(0) }).promise;
            page.thumbCanvas = await renderPageThumb(pdfDoc, page.pageIndex, page.rotation);
            pdfDoc.destroy();
            renderSplitPagesGrid();
        }
    } catch (err) {
        // silent
    }

    await renderPreview();
}

// ============================================
//  Event Bindings
// ============================================

// Merge
setupDropZone(dom.mergeDropZone, dom.mergeFileInput, handleMergeFiles, true);
dom.mergeSelectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.mergeFileInput.click();
});
dom.mergeAddMore.addEventListener('click', () => dom.mergeFileInput.click());
dom.mergeSortAsc.addEventListener('click', () => sortFiles('asc'));
dom.mergeSortDesc.addEventListener('click', () => sortFiles('desc'));

// --- Section-wide drag & drop for adding more files ---
(function setupMergeSectionDragDrop() {
    const section = dom.mergeSection;
    let dragCounter = 0;

    section.addEventListener('dragenter', (e) => {
        // Only respond to external file drops, not internal reorder
        if (e.dataTransfer.types.includes('application/x-merge-pages')) return;
        if (e.dataTransfer.types.includes('application/x-merge-files')) return;
        if (!e.dataTransfer.types.includes('Files')) return;
        dragCounter++;
        if (dragCounter === 1) {
            section.classList.add('section-drag-active');
        }
    });

    section.addEventListener('dragover', (e) => {
        if (e.dataTransfer.types.includes('application/x-merge-pages')) return;
        if (e.dataTransfer.types.includes('application/x-merge-files')) return;
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    section.addEventListener('dragleave', (e) => {
        if (e.dataTransfer.types.includes('application/x-merge-pages')) return;
        if (e.dataTransfer.types.includes('application/x-merge-files')) return;
        if (!e.dataTransfer.types.includes('Files')) return;
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            section.classList.remove('section-drag-active');
        }
    });

    section.addEventListener('drop', (e) => {
        // Don't intercept internal reorder
        if (e.dataTransfer.types.includes('application/x-merge-pages')) return;
        if (e.dataTransfer.types.includes('application/x-merge-files')) return;

        dragCounter = 0;
        section.classList.remove('section-drag-active');

        // Don't intercept if the initial drop zone handled it
        if (!dom.mergeDropZone.classList.contains('hidden')) return;

        e.preventDefault();
        e.stopPropagation();
        const files = [...e.dataTransfer.files].filter(isSupportedFile);
        if (files.length) {
            handleMergeFiles(files);
        } else {
            showToast('지원되지 않는 파일 형식입니다.', 'error');
        }
    });
})();
dom.mergeClearAll.addEventListener('click', () => {
    state.merge.files = [];
    state.merge.pages = [];
    state.merge.bookmarks = [];
    renderMergeUI();
    dom.mergeDropZone.classList.remove('hidden');
    showToast('전체 파일이 제거되었습니다.', 'info');
});
dom.mergeRotateAll.addEventListener('click', async () => {
    if (state.merge.pages.length === 0) return;
    showLoading('전체 페이지 회전 중...');
    for (let i = 0; i < state.merge.pages.length; i++) {
        const page = state.merge.pages[i];
        page.rotation = (page.rotation + 90) % 360;
        updateLoading(`${i + 1}/${state.merge.pages.length}`, ((i + 1) / state.merge.pages.length) * 100);
        try {
            const file = state.merge.files.find(f => f.id === page.fileId);
            if (file.type === 'image') {
                const img = await loadImage(file.arrayBuffer, file.mimeType);
                page.thumbCanvas = renderImageThumb(img, page.rotation);
            } else {
                const pdfDoc = await pdfjsLib.getDocument({ data: file.arrayBuffer.slice(0) }).promise;
                page.thumbCanvas = await renderPageThumb(pdfDoc, page.pageIndex, page.rotation);
                pdfDoc.destroy();
            }
        } catch (err) { /* skip */ }
    }
    renderMergePagesGrid();
    hideLoading();
    showToast('전체 페이지가 90° 회전되었습니다.', 'success');
});
dom.mergePdfBtn.addEventListener('click', executeMerge);

// Bookmark controls
dom.mergeAddBookmark.addEventListener('click', () => {
    addBookmark('새 북마크', 0, 0);
});
dom.mergeAutoBookmark.addEventListener('click', autoGenerateBookmarks);
dom.mergeClearBookmarks.addEventListener('click', () => {
    state.merge.bookmarks = [];
    renderBookmarkTree();
    showToast('북마크가 전체 삭제되었습니다.', 'info');
});

// Split
setupDropZone(dom.splitDropZone, dom.splitFileInput, handleSplitFile);
dom.splitSelectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.splitFileInput.click();
});
dom.splitRemoveFile.addEventListener('click', removeSplitFile);

dom.splitSelectAll.addEventListener('click', () => {
    const allSelected = state.split.pages.every(p => p.selected);
    state.split.pages.forEach(p => p.selected = !allSelected);
    renderSplitPagesGrid();
    updateSplitUI();
});

dom.splitRotateAll.addEventListener('click', async () => {
    const selectedPages = state.split.pages.filter(p => p.selected);
    if (selectedPages.length === 0) {
        showToast('회전할 페이지를 선택해주세요.', 'error');
        return;
    }
    showLoading('선택 페이지 회전 중...');
    const pdfDoc = await pdfjsLib.getDocument({ data: state.split.file.arrayBuffer.slice(0) }).promise;
    for (let i = 0; i < selectedPages.length; i++) {
        const page = selectedPages[i];
        page.rotation = (page.rotation + 90) % 360;
        updateLoading(`${i + 1}/${selectedPages.length}`, ((i + 1) / selectedPages.length) * 100);
        try {
            page.thumbCanvas = await renderPageThumb(pdfDoc, page.pageIndex, page.rotation);
        } catch (err) { /* skip */ }
    }
    pdfDoc.destroy();
    renderSplitPagesGrid();
    hideLoading();
    showToast(`${selectedPages.length}개 페이지가 90° 회전되었습니다.`, 'success');
});

// Split format buttons
dom.splitFormatSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.format-btn');
    if (!btn) return;
    dom.splitFormatSelector.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.split.format = btn.dataset.format;

    // Show/hide scale options for image formats
    dom.splitScaleGroup.classList.toggle('hidden', state.split.format === 'pdf');
});

dom.splitScale.addEventListener('change', () => {
    state.split.scale = parseInt(dom.splitScale.value);
});

dom.splitMergeBtn.addEventListener('click', executeSplitMerge);
dom.splitDownloadBtn.addEventListener('click', executeSplit);

// Preview modal
dom.previewClose.addEventListener('click', closePreview);
dom.previewModal.addEventListener('click', (e) => {
    if (e.target === dom.previewModal) closePreview();
});
dom.previewPrev.addEventListener('click', () => {
    if (state.preview.currentIndex > 0) {
        state.preview.currentIndex--;
        renderPreview();
    }
});
dom.previewNext.addEventListener('click', () => {
    if (state.preview.currentIndex < state.preview.pages.length - 1) {
        state.preview.currentIndex++;
        renderPreview();
    }
});
dom.previewRotateCCW.addEventListener('click', () => previewRotate(-90));
dom.previewRotateCW.addEventListener('click', () => previewRotate(90));

// Keyboard navigation
document.addEventListener('keydown', (e) => {
    if (!dom.previewModal.classList.contains('hidden')) {
        if (e.key === 'Escape') closePreview();
        if (e.key === 'ArrowLeft') {
            if (state.preview.currentIndex > 0) {
                state.preview.currentIndex--;
                renderPreview();
            }
        }
        if (e.key === 'ArrowRight') {
            if (state.preview.currentIndex < state.preview.pages.length - 1) {
                state.preview.currentIndex++;
                renderPreview();
            }
        }
    }
});

// Window resize => recalculate preview
window.addEventListener('resize', () => {
    if (!dom.previewModal.classList.contains('hidden')) {
        renderPreview();
    }
});

console.log('PDF Toolkit initialized.');

// ============================================
// Watermark Module
// ============================================
(function initWatermark() {
    // State
    const wmState = {
        pdfBytes: null,
        pdfPageCount: 0,
        wmBytes: null,
        wmMime: '',
        wmType: 'image', // 'image' | 'pdf'
        previewPage: 1,
    };

    // DOM refs
    const wmDom = {
        pdfInput: $('#wmPdfInput'),
        wmInput: $('#wmWmInput'),
        pdfZone: $('#wmPdfZone'),
        wmZone: $('#wmWmZone'),
        pdfInfo: $('#wmPdfInfo'),
        wmInfo: $('#wmWmInfo'),
        opacitySlider: $('#wmOpacitySlider'),
        scaleSlider: $('#wmScaleSlider'),
        rotateSlider: $('#wmRotateSlider'),
        marginXSlider: $('#wmMarginXSlider'),
        marginYSlider: $('#wmMarginYSlider'),
        posSelect: $('#wmPosSelect'),
        opacityVal: $('#wmOpacityVal'),
        scaleVal: $('#wmScaleVal'),
        rotateVal: $('#wmRotateVal'),
        marginXVal: $('#wmMarginXVal'),
        marginYVal: $('#wmMarginYVal'),
        processBtn: $('#wmProcessBtn'),
        previewBtn: $('#wmPreviewBtn'),
        previewArea: $('#wmPreviewArea'),
        previewPlaceholder: $('#wmPreviewPlaceholder'),
        progressBar: $('#wmProgressBar'),
        progressFill: $('#wmProgressFill'),
        statusMsg: $('#wmStatusMsg'),
        prevPage: $('#wmPrevPage'),
        nextPage: $('#wmNextPage'),
        pageInfo: $('#wmPageInfo'),
    };

    // Slider labels
    wmDom.opacitySlider.addEventListener('input', () => wmDom.opacityVal.textContent = wmDom.opacitySlider.value + '%');
    wmDom.scaleSlider.addEventListener('input', () => wmDom.scaleVal.textContent = wmDom.scaleSlider.value + '%');
    wmDom.rotateSlider.addEventListener('input', () => wmDom.rotateVal.textContent = wmDom.rotateSlider.value + '°');
    wmDom.marginXSlider.addEventListener('input', () => wmDom.marginXVal.textContent = wmDom.marginXSlider.value + 'px');
    wmDom.marginYSlider.addEventListener('input', () => wmDom.marginYVal.textContent = wmDom.marginYSlider.value + 'px');

    // File reading
    function readFileAsBytes(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(new Uint8Array(e.target.result));
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    // Drag & drop setup
    function setupWmDrop(zone, input) {
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) {
                const dt = new DataTransfer();
                dt.items.add(file);
                input.files = dt.files;
                input.dispatchEvent(new Event('change'));
            }
        });
    }

    setupWmDrop(wmDom.pdfZone, wmDom.pdfInput);
    setupWmDrop(wmDom.wmZone, wmDom.wmInput);

    // PDF file load
    wmDom.pdfInput.addEventListener('change', async () => {
        const file = wmDom.pdfInput.files[0];
        if (!file) return;
        wmState.pdfBytes = await readFileAsBytes(file);
        try {
            const doc = await PDFLib.PDFDocument.load(wmState.pdfBytes, { ignoreEncryption: true });
            wmState.pdfPageCount = doc.getPageCount();
            wmState.previewPage = 1;
        } catch (e) {
            wmState.pdfPageCount = 0;
            setWmStatus('PDF 파일 읽기 오류: ' + e.message, 'error');
            return;
        }
        wmDom.pdfInfo.textContent = `✓ ${file.name}  (${wmState.pdfPageCount}페이지, ${(file.size / 1024).toFixed(1)}KB)`;
        wmDom.pdfInfo.classList.add('show');
        wmDom.pdfZone.classList.add('has-file');
        checkWmReady();
    });

    // Watermark file load
    wmDom.wmInput.addEventListener('change', async () => {
        const file = wmDom.wmInput.files[0];
        if (!file) return;
        wmState.wmBytes = await readFileAsBytes(file);
        wmState.wmMime = file.type || detectMime(file.name);
        wmState.wmType = (wmState.wmMime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
            ? 'pdf' : 'image';
        wmDom.wmInfo.textContent = `✓ ${file.name}  (${wmState.wmType === 'pdf' ? 'PDF' : '이미지'}, ${(file.size / 1024).toFixed(1)}KB)`;
        wmDom.wmInfo.classList.add('show');
        wmDom.wmZone.classList.add('has-file');
        checkWmReady();
    });

    function detectMime(name) {
        const ext = name.split('.').pop().toLowerCase();
        return { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }[ext] || 'image/jpeg';
    }

    function checkWmReady() {
        wmDom.processBtn.disabled = !(wmState.pdfBytes && wmState.wmBytes);
        setWmStatus(wmDom.processBtn.disabled ? '파일을 선택하면 변환을 시작할 수 있습니다' : '준비 완료 — 아래 버튼을 눌러 다운로드');
    }

    // Options
    function getWmOptions() {
        return {
            opacity: parseFloat(wmDom.opacitySlider.value) / 100,
            scale: parseFloat(wmDom.scaleSlider.value) / 100,
            rotate: parseFloat(wmDom.rotateSlider.value) * Math.PI / 180,
            position: wmDom.posSelect.value,
            marginX: parseInt(wmDom.marginXSlider.value),
            marginY: parseInt(wmDom.marginYSlider.value),
        };
    }

    // Core watermark logic
    async function applyWatermark(onProgress) {
        const { PDFDocument, degrees, PDFName, PDFOperator } = PDFLib;
        const opts = getWmOptions();

        const srcDoc = await PDFDocument.load(wmState.pdfBytes, { ignoreEncryption: true });
        const dstDoc = await PDFDocument.create();

        const pageIndices = srcDoc.getPageIndices();
        const embeddedSrcPages = await dstDoc.embedPdf(srcDoc, pageIndices);

        // Prepare watermark embed
        let wmEmbed = null;

        if (wmState.wmType === 'image') {
            let img;
            const mime = wmState.wmMime;
            if (mime === 'image/png') {
                img = await dstDoc.embedPng(wmState.wmBytes);
            } else {
                img = await dstDoc.embedJpg(wmState.wmBytes);
            }
            wmEmbed = { type: 'img', obj: img, width: img.width, height: img.height };
        } else {
            const wmPdf = await PDFDocument.load(wmState.wmBytes, { ignoreEncryption: true });
            const [wmPage] = await dstDoc.embedPdf(wmPdf, [0]);
            const origPage = wmPdf.getPage(0);
            wmEmbed = { type: 'page', obj: wmPage, width: origPage.getWidth(), height: origPage.getHeight() };
        }

        // Multiply blend ExtGState
        const multiplyGs = dstDoc.context.obj({ BM: 'Multiply' });
        const gsMultiplyKey = PDFName.of('GS_Multiply');

        const total = pageIndices.length;

        for (let i = 0; i < total; i++) {
            const srcPage = srcDoc.getPage(i);
            const pw = srcPage.getWidth();
            const ph = srcPage.getHeight();
            const page = dstDoc.addPage([pw, ph]);

            // Scale calc
            const wmAR = wmEmbed.width / wmEmbed.height;
            let drawW, drawH;

            if (opts.position === 'diagonal') {
                const targetW = pw * opts.scale * 0.5;
                drawW = targetW;
                drawH = drawW / wmAR;
            } else {
                if (wmAR >= 1) {
                    drawW = pw * opts.scale;
                    drawH = drawW / wmAR;
                } else {
                    drawH = ph * opts.scale;
                    drawW = drawH * wmAR;
                }
            }

            // Position calc
            let positions = [];
            if (opts.position === 'diagonal') {
                const cols = 3, rows = 3;
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        positions.push({
                            x: (pw / cols) * (c + 0.5) - drawW / 2,
                            y: (ph / rows) * (r + 0.5) - drawH / 2,
                        });
                    }
                }
            } else {
                const margin = 30;
                const posMap = {
                    center: { x: pw / 2 - drawW / 2, y: ph / 2 - drawH / 2 },
                    centerbottom: { x: pw / 2 - drawW / 2, y: margin },
                    topcenter: { x: pw / 2 - drawW / 2, y: ph - drawH - margin },
                    topleft: { x: margin, y: ph - drawH - margin },
                    topright: { x: pw - drawW - margin, y: ph - drawH - margin },
                    bottomleft: { x: margin, y: margin },
                    bottomright: { x: pw - drawW - margin, y: margin },
                };
                const pos = posMap[opts.position] || posMap.center;
                positions.push({ x: pos.x + opts.marginX, y: pos.y - opts.marginY });
            }

            // Step 1: Draw watermark (background layer)
            for (const pos of positions) {
                const drawOpts = {
                    x: pos.x,
                    y: pos.y,
                    width: drawW,
                    height: drawH,
                    rotate: degrees(opts.rotate * 180 / Math.PI),
                    opacity: opts.opacity,
                    xSkew: degrees(0),
                    ySkew: degrees(0),
                };

                if (wmEmbed.type === 'img') {
                    page.drawImage(wmEmbed.obj, drawOpts);
                } else {
                    page.drawPage(wmEmbed.obj, drawOpts);
                }
            }

            // Step 2: Multiply blend mode for original page on top
            const resDict = page.node.get(PDFName.of('Resources'));
            if (resDict) {
                let extGState = resDict.get(PDFName.of('ExtGState'));
                if (!extGState) {
                    extGState = dstDoc.context.obj({});
                    resDict.set(PDFName.of('ExtGState'), extGState);
                }
                extGState.set(gsMultiplyKey, multiplyGs);
            }
            page.pushOperators(PDFOperator.of('gs', [gsMultiplyKey]));

            page.drawPage(embeddedSrcPages[i], {
                x: 0,
                y: 0,
                width: pw,
                height: ph,
            });

            if (onProgress) onProgress((i + 1) / total);
        }

        return await dstDoc.save();
    }

    // Preview
    wmDom.previewBtn.addEventListener('click', () => renderWmPreview(wmState.previewPage));

    wmDom.prevPage.addEventListener('click', () => {
        if (wmState.previewPage > 1) {
            wmState.previewPage--;
            renderWmPreview(wmState.previewPage);
        }
    });

    wmDom.nextPage.addEventListener('click', () => {
        if (wmState.previewPage < wmState.pdfPageCount) {
            wmState.previewPage++;
            renderWmPreview(wmState.previewPage);
        }
    });

    async function renderWmPreview(pageNum) {
        if (!wmState.pdfBytes || !wmState.wmBytes) {
            setWmStatus('미리보기를 생성하려면 두 파일 모두 선택하세요', 'error');
            return;
        }

        wmDom.previewBtn.disabled = true;
        wmDom.previewBtn.textContent = '처리 중...';
        setWmStatus('미리보기 생성 중...');

        try {
            const { PDFDocument } = PDFLib;
            const srcDoc = await PDFDocument.load(wmState.pdfBytes, { ignoreEncryption: true });
            const cnt = srcDoc.getPageCount();
            const idx = Math.min(pageNum - 1, cnt - 1);

            const singleDoc = await PDFDocument.create();
            const [p] = await singleDoc.copyPages(srcDoc, [idx]);
            singleDoc.addPage(p);
            const singleBytes = await singleDoc.save();

            // Temporarily swap state for single page
            const savedPdf = wmState.pdfBytes;
            const savedCnt = wmState.pdfPageCount;
            wmState.pdfBytes = singleBytes;
            wmState.pdfPageCount = 1;

            const resultBytes = await applyWatermark(null);

            wmState.pdfBytes = savedPdf;
            wmState.pdfPageCount = savedCnt;

            // Show via object element
            const blob = new Blob([resultBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            let obj = wmDom.previewArea.querySelector('object');
            if (!obj) {
                obj = document.createElement('object');
                obj.style.cssText = 'width:100%;height:500px;border-radius:6px;border:none;';
                wmDom.previewArea.appendChild(obj);
            }

            obj.data = url + '#toolbar=0&navpanes=0&scrollbar=0';
            obj.type = 'application/pdf';
            wmDom.previewPlaceholder.style.display = 'none';

            updateWmPageNav(pageNum, cnt);
            setWmStatus('미리보기 생성 완료');

            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (e) {
            setWmStatus('미리보기 오류: ' + e.message, 'error');
            console.error(e);
        }

        wmDom.previewBtn.disabled = false;
        wmDom.previewBtn.textContent = '미리보기 생성';
    }

    function updateWmPageNav(current, total) {
        wmDom.pageInfo.textContent = `${current} / ${total}`;
        wmDom.prevPage.disabled = current <= 1;
        wmDom.nextPage.disabled = current >= total;
    }

    // Process & download
    wmDom.processBtn.addEventListener('click', async () => {
        if (!wmState.pdfBytes || !wmState.wmBytes) return;

        wmDom.processBtn.disabled = true;
        wmDom.progressBar.classList.add('show');
        setWmStatus('처리 중...');

        try {
            const resultBytes = await applyWatermark((prog) => {
                wmDom.progressFill.style.width = (prog * 100).toFixed(1) + '%';
                setWmStatus(`처리 중... ${Math.round(prog * wmState.pdfPageCount)} / ${wmState.pdfPageCount} 페이지`);
            });

            wmDom.progressFill.style.width = '100%';
            setWmStatus('다운로드 준비 완료!', 'success');

            const blob = new Blob([resultBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'watermarked_output.pdf';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 5000);

            setTimeout(() => {
                wmDom.progressBar.classList.remove('show');
                wmDom.progressFill.style.width = '0%';
            }, 2000);

        } catch (e) {
            setWmStatus('처리 오류: ' + e.message, 'error');
            console.error(e);
            wmDom.progressBar.classList.remove('show');
        }

        wmDom.processBtn.disabled = !(wmState.pdfBytes && wmState.wmBytes);
    });

    // Status message
    function setWmStatus(msg, type) {
        wmDom.statusMsg.textContent = msg;
        wmDom.statusMsg.className = 'wm-status-msg' + (type ? ' ' + type : '');
    }

    console.log('Watermark module initialized.');
})();

// ============================================
// Print Conversion Module (Long Screenshot → A4 PDF)
// ============================================
(function initPrintConv() {
    // Paper sizes in mm
    const PAPER_SIZES = {
        a4: { w: 210, h: 297 },
        letter: { w: 216, h: 279 },
        legal: { w: 216, h: 356 },
    };
    const MM_TO_PT = 72 / 25.4; // 1mm = ~2.835pt

    // State
    const pcState = {
        imageData: null,   // data URL
        imageEl: null,     // HTMLImageElement
        fileName: '',
        fileSize: 0,
        slices: [],        // canvas elements for preview
    };

    // DOM refs
    const pcDom = {
        dropZone: $('#pcDropZone'),
        fileInput: $('#pcFileInput'),
        selectBtn: $('#pcSelectBtn'),
        fileInfo: $('#pcFileInfo'),
        fileName: $('#pcFileName'),
        fileMeta: $('#pcFileMeta'),
        removeFile: $('#pcRemoveFile'),
        optionsCard: $('#pcOptionsCard'),
        paperSize: $('#pcPaperSize'),
        orientation: $('#pcOrientation'),
        marginSlider: $('#pcMarginSlider'),
        marginVal: $('#pcMarginVal'),
        overlapSlider: $('#pcOverlapSlider'),
        overlapVal: $('#pcOverlapVal'),
        previewCard: $('#pcPreviewCard'),
        pageCount: $('#pcPageCount'),
        previewInfo: $('#pcPreviewInfo'),
        pagesGrid: $('#pcPagesGrid'),
        actionBar: $('#pcActionBar'),
        actionInfo: $('#pcActionInfo'),
        downloadBtn: $('#pcDownloadBtn'),
        downloadLabel: $('#pcDownloadLabel'),
    };

    // Slider labels
    pcDom.marginSlider.addEventListener('input', () => {
        pcDom.marginVal.textContent = pcDom.marginSlider.value + 'mm';
        if (pcState.imageEl) generatePreview();
    });
    pcDom.overlapSlider.addEventListener('input', () => {
        pcDom.overlapVal.textContent = pcDom.overlapSlider.value + 'mm';
        if (pcState.imageEl) generatePreview();
    });
    pcDom.paperSize.addEventListener('change', () => { if (pcState.imageEl) generatePreview(); });
    pcDom.orientation.addEventListener('change', () => { if (pcState.imageEl) generatePreview(); });

    // Drag & drop
    pcDom.dropZone.addEventListener('dragover', e => { e.preventDefault(); pcDom.dropZone.classList.add('drag-over'); });
    pcDom.dropZone.addEventListener('dragleave', () => pcDom.dropZone.classList.remove('drag-over'));
    pcDom.dropZone.addEventListener('drop', e => {
        e.preventDefault();
        pcDom.dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) handlePcFile(file);
    });
    pcDom.dropZone.addEventListener('click', () => pcDom.fileInput.click());
    pcDom.selectBtn.addEventListener('click', e => { e.stopPropagation(); pcDom.fileInput.click(); });
    pcDom.fileInput.addEventListener('change', () => {
        if (pcDom.fileInput.files[0]) handlePcFile(pcDom.fileInput.files[0]);
    });
    pcDom.removeFile.addEventListener('click', removePcFile);

    function handlePcFile(file) {
        pcState.fileName = file.name;
        pcState.fileSize = file.size;

        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                pcState.imageEl = img;
                pcState.imageData = e.target.result;

                // Show UI
                pcDom.dropZone.classList.add('hidden');
                pcDom.fileInfo.classList.remove('hidden');
                pcDom.optionsCard.classList.remove('hidden');
                pcDom.previewCard.classList.remove('hidden');
                pcDom.actionBar.classList.remove('hidden');

                pcDom.fileName.textContent = file.name;
                pcDom.fileMeta.textContent = `${formatFileSize(file.size)} · ${img.naturalWidth} × ${img.naturalHeight}px`;

                generatePreview();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function removePcFile() {
        pcState.imageEl = null;
        pcState.imageData = null;
        pcState.slices = [];
        pcDom.dropZone.classList.remove('hidden');
        pcDom.fileInfo.classList.add('hidden');
        pcDom.optionsCard.classList.add('hidden');
        pcDom.previewCard.classList.add('hidden');
        pcDom.actionBar.classList.add('hidden');
        pcDom.pagesGrid.innerHTML = '';
        pcDom.fileInput.value = '';
    }

    function getOptions() {
        const paperKey = pcDom.paperSize.value;
        const orientation = pcDom.orientation.value;
        const paper = PAPER_SIZES[paperKey];
        const marginMm = parseInt(pcDom.marginSlider.value);
        const overlapMm = parseInt(pcDom.overlapSlider.value);

        let pageWmm, pageHmm;
        if (orientation === 'portrait') {
            pageWmm = paper.w;
            pageHmm = paper.h;
        } else {
            pageWmm = paper.h;
            pageHmm = paper.w;
        }

        return { pageWmm, pageHmm, marginMm, overlapMm };
    }

    function generatePreview() {
        const img = pcState.imageEl;
        if (!img) return;

        const { pageWmm, pageHmm, marginMm, overlapMm } = getOptions();

        // Content area in mm
        const contentWmm = pageWmm - 2 * marginMm;
        const contentHmm = pageHmm - 2 * marginMm;

        if (contentWmm <= 0 || contentHmm <= 0) {
            pcDom.previewInfo.textContent = '여백이 너무 큽니다. 여백을 줄여주세요.';
            pcDom.pagesGrid.innerHTML = '';
            pcDom.pageCount.textContent = '0';
            return;
        }

        // Scale factor: map image width to content area width
        // DPI reference: 72pt = 1inch, we work in mm then convert to pt for pdf-lib
        const scale = contentWmm / img.naturalWidth; // mm per pixel
        const scaledHeightMm = img.naturalHeight * scale; // total image height in mm

        // How much image height fits in one page's content area
        const sliceHeightMm = contentHmm;
        const overlapPx = overlapMm / scale; // overlap in image pixels
        const sliceHeightPx = sliceHeightMm / scale; // content height in image pixels

        // Calculate slices
        const slices = [];
        let srcY = 0;
        while (srcY < img.naturalHeight) {
            const remainingPx = img.naturalHeight - srcY;
            const thisSlicePx = Math.min(sliceHeightPx, remainingPx);
            slices.push({ srcY: Math.round(srcY), srcH: Math.round(thisSlicePx) });
            srcY += thisSlicePx - overlapPx;
            if (thisSlicePx >= remainingPx) break; // last slice
        }

        pcState.slices = slices;

        // Update info
        pcDom.pageCount.textContent = slices.length;
        pcDom.previewInfo.textContent = `원본 ${img.naturalWidth}×${img.naturalHeight}px → ${slices.length}페이지 (${pageWmm}×${pageHmm}mm, 여백 ${marginMm}mm, 겹침 ${overlapMm}mm)`;
        pcDom.actionInfo.textContent = `${slices.length}페이지 PDF 생성 준비 완료`;
        pcDom.downloadLabel.textContent = `${slices.length}페이지 PDF 다운로드`;

        // Render preview thumbnails
        pcDom.pagesGrid.innerHTML = '';
        const thumbScale = 0.3; // preview scale

        slices.forEach((slice, idx) => {
            // Create thumbnail canvas
            const canvas = document.createElement('canvas');
            const aspectW = img.naturalWidth;
            const aspectH = slice.srcH;
            // Fit into page aspect ratio for visual accuracy
            const pageAspect = (pageWmm) / (pageHmm);
            const thumbW = 160;
            const thumbH = thumbW / pageAspect;
            canvas.width = thumbW;
            canvas.height = thumbH;
            const ctx = canvas.getContext('2d');

            // Background (paper)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, thumbW, thumbH);

            // Content area dimensions
            const marginRatio = marginMm / pageWmm;
            const cX = thumbW * marginRatio;
            const cY = thumbH * (marginMm / pageHmm);
            const cW = thumbW * (1 - 2 * marginRatio);
            const cH = thumbH * (1 - 2 * (marginMm / pageHmm));

            // Calculate proportional draw height for this slice (preserve aspect ratio)
            const drawCH = cW * (slice.srcH / img.naturalWidth);
            const actualCH = Math.min(drawCH, cH);

            // Draw the image slice into content area (top-aligned, proportional)
            ctx.drawImage(img, 0, slice.srcY, img.naturalWidth, slice.srcH, cX, cY, cW, actualCH);

            // Draw margin guides (subtle)
            ctx.strokeStyle = 'rgba(124, 165, 255, 0.3)';
            ctx.lineWidth = 0.5;
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(cX, cY, cW, cH);

            // Create card
            const card = document.createElement('div');
            card.className = 'page-card';
            card.style.cursor = 'default';

            const thumbWrap = document.createElement('div');
            thumbWrap.className = 'page-thumb-wrap';
            thumbWrap.style.aspectRatio = `${pageWmm} / ${pageHmm}`;
            thumbWrap.style.background = '#1e293b';
            thumbWrap.appendChild(canvas);
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.objectFit = 'contain';

            const info = document.createElement('div');
            info.className = 'page-info';
            info.innerHTML = `<span class="page-label">페이지 ${idx + 1}</span>`;

            card.appendChild(thumbWrap);
            card.appendChild(info);
            pcDom.pagesGrid.appendChild(card);
        });
    }

    // PDF generation
    pcDom.downloadBtn.addEventListener('click', async () => {
        if (!pcState.imageEl || pcState.slices.length === 0) return;

        showLoading('프린트용 PDF 생성 중...');
        try {
            const { PDFDocument } = PDFLib;
            const img = pcState.imageEl;
            const { pageWmm, pageHmm, marginMm } = getOptions();
            const slices = pcState.slices;

            // Page dimensions in points
            const pageWpt = pageWmm * MM_TO_PT;
            const pageHpt = pageHmm * MM_TO_PT;
            const marginPt = marginMm * MM_TO_PT;
            const contentWpt = pageWpt - 2 * marginPt;
            const contentHpt = pageHpt - 2 * marginPt;

            const pdfDoc = await PDFDocument.create();

            for (let i = 0; i < slices.length; i++) {
                const slice = slices[i];
                updateLoading(`페이지 ${i + 1}/${slices.length}`, ((i + 1) / slices.length) * 100);

                // Render slice to canvas at high resolution
                const renderCanvas = document.createElement('canvas');
                renderCanvas.width = img.naturalWidth;
                renderCanvas.height = slice.srcH;
                const ctx = renderCanvas.getContext('2d');
                ctx.drawImage(img, 0, slice.srcY, img.naturalWidth, slice.srcH, 0, 0, img.naturalWidth, slice.srcH);

                // Convert to PNG bytes
                const pngBlob = await new Promise(resolve => renderCanvas.toBlob(resolve, 'image/png'));
                const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
                const pngImage = await pdfDoc.embedPng(pngBytes);

                // Add page
                const page = pdfDoc.addPage([pageWpt, pageHpt]);

                // Calculate draw dimensions to fit content area width (preserve aspect ratio)
                const drawW = contentWpt;
                const drawH = Math.min((slice.srcH / img.naturalWidth) * contentWpt, contentHpt);

                // Draw image (PDF y-axis is bottom-up)
                page.drawImage(pngImage, {
                    x: marginPt,
                    y: pageHpt - marginPt - drawH,
                    width: drawW,
                    height: drawH,
                });
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const baseName = pcState.fileName.replace(/\.[^.]+$/, '');
            saveAs(blob, `${baseName}_print_${slices.length}pages.pdf`);
            showToast(`${slices.length}페이지 프린트용 PDF가 생성되었습니다!`, 'success');
        } catch (err) {
            console.error(err);
            showToast('PDF 생성 실패: ' + err.message, 'error');
        }
        hideLoading();
    });

    console.log('Print Conversion module initialized.');
})();

// ============================================
// HWP to PDF Module
// ============================================
(() => {
    const hState = {
        files: [],
        lastSelectedIdx: -1
    };
    let hIdCounter = 0;

    const el = {
        dropZone: $('#hwpDropZone'),
        fileInput: $('#hwpFileInput'),
        selectBtn: $('#hwpSelectBtn'),
        fileList: $('#hwpFileList'),
        fileItems: $('#hwpFileItems'),
        fileCount: $('#hwpFileCount'),
        addMore: $('#hwpAddMore'),
        sortAsc: $('#hwpSortAsc'),
        sortDesc: $('#hwpSortDesc'),
        clearAll: $('#hwpClearAll'),
        actionBar: $('#hwpActionBar'),
        actionInfo: $('#hwpActionInfo'),
        mergeBtn: $('#hwpMergeBtn'),
        separateBtn: $('#hwpSeparateBtn'),
    };

    function renderUI() {
        const hasFiles = hState.files.length > 0;
        el.dropZone.classList.toggle('hidden', hasFiles);
        el.fileList.classList.toggle('hidden', !hasFiles);
        el.actionBar.classList.toggle('hidden', !hasFiles);

        el.fileCount.textContent = hState.files.length;
        el.actionInfo.textContent = `${hState.files.length}개 파일 대기 중`;

        el.fileItems.innerHTML = '';
        hState.files.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = `file-item${file._selected ? ' file-selected' : ''}`;
            item.draggable = true;
            item.dataset.id = file.id;
            item.innerHTML = `
                <div class="file-drag-handle">
                    <span></span><span></span><span></span>
                </div>
                <div class="file-icon-sm">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <rect x="3" y="1" width="14" height="18" rx="2" fill="#3b82f6" opacity="0.15" stroke="#3b82f6" stroke-width="1.2"/>
                        <text x="10" y="13" text-anchor="middle" fill="#3b82f6" font-size="6" font-weight="700">HWP</text>
                    </svg>
                </div>
                <div class="file-details">
                    <div class="file-name">${file.name}</div>
                    <div class="file-meta">${formatFileSize(file.size)}</div>
                </div>
                <div class="file-actions">
                    <button class="btn-icon btn-danger" title="삭제" data-action="remove">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3L11 11M11 3L3 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                    </button>
                </div>
            `;

            item.querySelector('[data-action="remove"]').addEventListener('click', (e) => {
                e.stopPropagation();
                hState.files = hState.files.filter(f => f.id !== file.id);
                renderUI();
            });

            item.addEventListener('click', (e) => {
                if (e.target.closest('[data-action]')) return;
                if (e.shiftKey && hState.lastSelectedIdx >= 0) {
                    const start = Math.min(hState.lastSelectedIdx, index);
                    const end = Math.max(hState.lastSelectedIdx, index);
                    for (let i = start; i <= end; i++) hState.files[i]._selected = true;
                } else if (e.ctrlKey || e.metaKey) {
                    file._selected = !file._selected;
                } else {
                    const was = file._selected;
                    hState.files.forEach(f => f._selected = false);
                    file._selected = !was;
                }
                hState.lastSelectedIdx = index;
                renderUI();
            });

            item.addEventListener('dragstart', (e) => {
                if (!file._selected) {
                    hState.files.forEach(f => f._selected = false);
                    file._selected = true;
                    renderUI();
                }
                const selectedIds = hState.files.filter(f => f._selected).map(f => f.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('application/x-hwp-files', JSON.stringify(selectedIds));
                item.classList.add('dragging');
            });
            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                el.fileItems.querySelectorAll('.drag-target').forEach(x => x.classList.remove('drag-target'));
            });
            item.addEventListener('dragover', (e) => {
                if (e.dataTransfer.types.includes('application/x-hwp-files')) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    item.classList.add('drag-target');
                }
            });
            item.addEventListener('dragleave', () => item.classList.remove('drag-target'));
            item.addEventListener('drop', (e) => {
                item.classList.remove('drag-target');
                if (!e.dataTransfer.types.includes('application/x-hwp-files')) return;
                e.preventDefault();
                e.stopPropagation();

                const selectedIds = JSON.parse(e.dataTransfer.getData('application/x-hwp-files'));
                const moved = [];
                const remaining = [];
                hState.files.forEach(f => selectedIds.includes(f.id) ? moved.push(f) : remaining.push(f));
                
                let insertIdx = remaining.findIndex(f => f.id === file.id);
                if (insertIdx === -1) insertIdx = remaining.length;
                remaining.splice(insertIdx, 0, ...moved);
                hState.files = remaining;
                renderUI();
            });

            el.fileItems.appendChild(item);
        });
    }

    function handleFiles(files) {
        fetch('http://localhost:8080/api/keep-alive').catch(() => {});
        files.forEach(f => {
            hState.files.push({
                id: ++hIdCounter,
                name: f.name,
                size: f.size,
                file: f,
                _selected: false
            });
        });
        renderUI();
        showToast(`${files.length}개 파일 추가됨`, 'success');
    }

    setupDropZone(el.dropZone, el.fileInput, handleFiles, false);
    // override setupDropZone filter
    el.dropZone.addEventListener('drop', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        el.dropZone.classList.remove('drag-over');
        const files = [...ev.dataTransfer.files].filter(f => {
            const n = f.name.toLowerCase();
            return n.endsWith('.hwp') || n.endsWith('.hwpx');
        });
        if (files.length) handleFiles(files);
        else showToast('HWP/HWPX 파일만 지원됩니다.', 'error');
    }, { capture: true });
    el.fileInput.addEventListener('change', (ev) => {
        ev.stopPropagation();
        const files = [...el.fileInput.files].filter(f => {
            const n = f.name.toLowerCase();
            return n.endsWith('.hwp') || n.endsWith('.hwpx');
        });
        if (files.length) handleFiles(files);
        el.fileInput.value = '';
    }, { capture: true });

    el.addMore.addEventListener('click', () => el.fileInput.click());
    el.clearAll.addEventListener('click', () => {
        if (!confirm('모든 HWP 파일을 목록에서 삭제하시겠습니까?')) return;
        hState.files = [];
        renderUI();
    });

    el.sortAsc.addEventListener('click', () => {
        hState.files.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        renderUI();
    });
    el.sortDesc.addEventListener('click', () => {
        hState.files.sort((a, b) => b.name.localeCompare(a.name, 'ko'));
        renderUI();
    });

    async function convertHwp(fileObj, idx, total) {
        updateLoading(`(${idx}/${total}) ${fileObj.name} 변환 중...`, (idx / total) * 100);
        try {
            const arrayBuffer = await fileObj.file.arrayBuffer();
            const res = await fetch('http://localhost:8080/api/convert-hwp', {
                method: 'POST',
                headers: { 'X-File-Name': encodeURIComponent(fileObj.name) },
                body: arrayBuffer
            });
            if (!res.ok) throw new Error(`서버 에러: ${res.status}`);
            return await res.arrayBuffer();
        } catch (err) {
            throw new Error(`[${fileObj.name}] 변환 실패: ` + err.message);
        }
    }

    el.separateBtn.addEventListener('click', async () => {
        if (!hState.files.length) return;
        showLoading('HWP 파일 변환 시작...', 0);
        const zip = new JSZip();
        let successCount = 0;
        
        for (let i = 0; i < hState.files.length; i++) {
            const f = hState.files[i];
            try {
                const pdfBuffer = await convertHwp(f, i + 1, hState.files.length);
                const pdfName = f.name.replace(/\.hwpx?$/i, '.pdf');
                zip.file(pdfName, pdfBuffer);
                successCount++;
            } catch (err) {
                console.error(err);
                showToast(err.message, 'error');
            }
        }
        
        if (successCount > 0) {
            updateLoading('ZIP 압축 중...', 100);
            const content = await zip.generateAsync({ type: 'blob' });
            saveAs(content, 'Converted_PDFs.zip');
            showToast(`${successCount}개 파일 변환 완료!`, 'success');
        }
        hideLoading();
    });

    el.mergeBtn.addEventListener('click', async () => {
        if (!hState.files.length) return;
        showLoading('HWP 파일 변환 및 병합 시작...', 0);
        const mergedPdf = await PDFLib.PDFDocument.create();
        let successCount = 0;

        for (let i = 0; i < hState.files.length; i++) {
            const f = hState.files[i];
            try {
                const pdfBuffer = await convertHwp(f, i + 1, hState.files.length);
                const pdfDoc = await PDFLib.PDFDocument.load(pdfBuffer);
                const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
                pages.forEach(p => mergedPdf.addPage(p));
                successCount++;
            } catch (err) {
                console.error(err);
                showToast(err.message, 'error');
            }
        }

        if (successCount > 0) {
            updateLoading('최종 PDF 생성 중...', 100);
            const pdfBytes = await mergedPdf.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            saveAs(blob, 'Merged_HWP_Converted.pdf');
            showToast(`${successCount}개 파일 병합 완료!`, 'success');
        }
        hideLoading();
    });

    // ============================================
    // HWP Background Server Controller & UI Badge
    // ============================================
    const badgeEl = $('#hwpServerBadge');
    const statusTextEl = $('#hwpServerStatusText');
    const noticeEl = $('#hwpServerOffNotice');
    const retryBtn = $('#hwpRetryConnectBtn');
    let isServerOnline = false;
    let toastShownOnce = false;

    function setServerBadge(online, text = null) {
        const wasOffline = !isServerOnline;
        isServerOnline = online;
        if (!badgeEl || !statusTextEl) return;
        badgeEl.classList.remove('status-on', 'status-off');
        if (online) {
            badgeEl.classList.add('status-on');
            statusTextEl.textContent = text || '변환서버 ON';
            if (noticeEl) noticeEl.classList.add('hidden');

            if (wasOffline && !toastShownOnce && state.mode === 'hwp') {
                toastShownOnce = true;
                showToast('🎉 HWP 변환 로컬 엔진 연동 성공! (100% 오프라인 무소음 모드)', 'success');
            }
        } else {
            badgeEl.classList.add('status-off');
            statusTextEl.textContent = text || '변환서버 OFF (안내)';
            if (noticeEl && state.mode === 'hwp') noticeEl.classList.remove('hidden');
            toastShownOnce = false;
        }
    }

    async function checkServerStatus() {
        try {
            const res = await fetch('http://localhost:8080/api/status', { signal: AbortSignal.timeout(1200) });
            if (res.ok) {
                setServerBadge(true, '변환서버 ON');
                return true;
            }
        } catch (e) {}
        setServerBadge(false, '변환서버 OFF (클릭/안내)');
        return false;
    }

    async function wakeServer() {
        const alive = await checkServerStatus();
        if (alive) return;

        setServerBadge(false, '서버 연결 중...');
        // Custom Protocol 호출로 숨겨진 백엔드 자동 가동 시도
        try {
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = 'pdftoolkit://start';
            document.body.appendChild(iframe);
            setTimeout(() => iframe.remove(), 2000);
        } catch(e) {}

        // 최대 5회 주기적 확인 (1초 간격)
        let tries = 0;
        const interval = setInterval(async () => {
            tries++;
            const ok = await checkServerStatus();
            if (ok) {
                clearInterval(interval);
                showToast('🎉 한글 백그라운드 변환 서버가 준비되었습니다!', 'success');
            } else if (tries >= 5) {
                clearInterval(interval);
                setServerBadge(false, '변환서버 OFF (클릭/안내)');
            }
        }, 1000);
    }

    function shutdownServer() {
        if (!isServerOnline) return;
        fetch('http://localhost:8080/api/shutdown', { method: 'POST' }).catch(() => {});
        setServerBadge(false, '변환서버 OFF');
    }

    window.wakeHwpServer = wakeServer;
    window.shutdownHwpServer = shutdownServer;

    if (badgeEl) {
        badgeEl.addEventListener('click', () => {
            if (!isServerOnline) {
                showToast('백그라운드 서버 구동을 시도합니다...', 'info');
                wakeServer();
            } else {
                showToast('변환 서버가 정상 구동 중입니다.', 'success');
                fetch('http://localhost:8080/api/keep-alive').catch(() => {});
            }
        });
    }

    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            showToast('서버 접속 상태를 확인하는 중입니다...', 'info');
            wakeServer();
        });
    }

    // 스마트 감지 타이머 (꺼져있을 때는 2초마다 쾌속 감지, 켜져있을 때는 10초마다 워치독 감지)
    setInterval(() => {
        if (state.mode === 'hwp') {
            checkServerStatus();
        }
    }, isServerOnline ? 10000 : 2000);

    // URL 파라미터나 해시에 hwp가 있으면 초기 탭으로 HWP 선택
    if (window.location.search.includes('tab=hwp') || window.location.hash.includes('hwp')) {
        setTimeout(() => switchTab('hwp'), 50);
    } else if (state.mode === 'hwp') {
        wakeServer();
    }

})();

