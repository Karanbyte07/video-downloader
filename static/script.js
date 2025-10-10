const form = document.getElementById('download-form');
const urlInput = document.getElementById('video-url');
const statusDiv = document.getElementById('status');
const previewDiv = document.getElementById('preview');
const downloadButton = document.getElementById('download-button');
const btnWrapper = downloadButton.closest('button') || downloadButton;

function setLoading(isLoading) {
    if (isLoading) {
        downloadButton.disabled = true;
        downloadButton.classList.add('btn-loading');
    } else {
        downloadButton.disabled = false;
        downloadButton.classList.remove('btn-loading');
    }
}

function renderStatus(message, type = 'info') {
    statusDiv.className = '';
    if (type === 'success') statusDiv.classList.add('status-success');
    if (type === 'error') statusDiv.classList.add('status-error');
    statusDiv.innerHTML = message;
}

function clearPreview() {
    previewDiv.innerHTML = '';
}

function renderPreview(data) {
    clearPreview();

    const title = data.title || 'Untitled';
    const wrapper = document.createElement('div');
    wrapper.className = 'preview';

    // Media element: prefer preview_url (video) else show thumbnail image
    let mediaEl;
    if (data.preview_url) {
        mediaEl = document.createElement('video');
        mediaEl.className = 'media';
        mediaEl.src = data.preview_url;
        mediaEl.controls = true;
        mediaEl.playsInline = true;
    } else if (data.thumbnail) {
        mediaEl = document.createElement('img');
        mediaEl.className = 'media';
        mediaEl.src = data.thumbnail;
        mediaEl.alt = title;
    }

    if (mediaEl) wrapper.appendChild(mediaEl);

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = title;
    wrapper.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const dlBtn = document.createElement('button');
    dlBtn.className = 'btn-primary';
    dlBtn.innerHTML = '<span class="btn-text">Download</span><span class="btn-spinner" aria-hidden="true"></span>';
    actions.appendChild(dlBtn);
    wrapper.appendChild(actions);

    previewDiv.appendChild(wrapper);

    dlBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        dlBtn.disabled = true;
        dlBtn.classList.add('btn-loading');
        try {
            const resp = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: urlInput.value.trim() })
            });
            const result = await resp.json();
            if (!resp.ok) throw new Error(result.error || 'Download failed');

            // Get the download path
            const downloadPath = result.download_url;
            
            // Trigger download immediately using the download URL
            const link = document.createElement('a');
            link.href = downloadPath;
            link.download = result.filename || 'video.mp4'; // Force download
            document.body.appendChild(link);
            
            // Trigger the download
            link.click();
            
            // Clean up
            setTimeout(() => {
                document.body.removeChild(link);
            }, 100);
            
            // Show download success message + any warnings from server
            const warn = result.warning ? `\n<span class="muted">${result.warning}</span>` : '';
            renderStatus(`Download started: ${result.title || result.filename}${warn}`, 'success');
        } catch (err) {
            renderStatus(`❌ ${err.message}`, 'error');
        } finally {
            dlBtn.disabled = false;
            dlBtn.classList.remove('btn-loading');
        }
    });
}

function isValidUrl(value) {
    try {
        const u = new URL(value);
        return ['http:', 'https:'].includes(u.protocol);
    } catch (e) {
        return false;
    }
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const videoUrl = urlInput.value.trim();

    if (!videoUrl) {
        renderStatus('Please enter a video URL.', 'error');
        urlInput.focus();
        return;
    }

    if (!isValidUrl(videoUrl)) {
        renderStatus('That does not look like a valid URL. Please check and try again.', 'error');
        urlInput.focus();
        return;
    }

    setLoading(true);
    renderStatus('Fetching info…', 'info');
    clearPreview();

    try {
        const resp = await fetch('/api/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: videoUrl }),
        });

        const data = await resp.json();

        if (!resp.ok) {
            throw new Error(data.error || 'Info fetch failed on server');
        }
        renderStatus('Info ready.', 'success');
        renderPreview(data);
    } catch (err) {
        renderStatus(`❌ ${err.message}`, 'error');
    } finally {
        setLoading(false);
    }
});