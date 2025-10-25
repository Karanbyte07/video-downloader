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

function renderProgressBar() {
    statusDiv.className = '';
    statusDiv.innerHTML = `
        <div class="progress-container">
            <div class="progress-label">
                <span>Fetching video information...</span>
                <span class="progress-percentage" id="progress-percentage">0%</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" id="progress-fill"></div>
            </div>
        </div>
    `;
    
    // Start progress animation
    let progress = 0;
    const progressFill = document.getElementById('progress-fill');
    const progressPercentage = document.getElementById('progress-percentage');
    
    const progressInterval = setInterval(() => {
        progress += Math.random() * 15 + 5; // Random increment between 5-20%
        if (progress > 90) progress = 90; // Cap at 90% until completion
        
        progressFill.style.width = progress + '%';
        progressPercentage.textContent = Math.round(progress) + '%';
    }, 200);
    
    // Store interval ID for cleanup
    statusDiv.dataset.progressInterval = progressInterval;
}

function completeProgressBar() {
    const progressFill = document.getElementById('progress-fill');
    const progressPercentage = document.getElementById('progress-percentage');
    const progressInterval = statusDiv.dataset.progressInterval;
    
    if (progressInterval) {
        clearInterval(progressInterval);
    }
    
    if (progressFill && progressPercentage) {
        progressFill.style.width = '100%';
        progressPercentage.textContent = '100%';
        
        // Clear progress bar after a short delay
        setTimeout(() => {
            if (statusDiv.querySelector('.progress-container')) {
                statusDiv.innerHTML = '';
            }
        }, 500);
    }
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

    // Add professional info panel above download button
    const downloadMessage = document.createElement('div');
    downloadMessage.className = 'download-message';
    downloadMessage.innerHTML = `
        <div class="download-section info-panel" role="group" aria-label="Download information">
            <div class="info-left">
                <div class="icon-circle" aria-hidden="true">
                    <svg viewBox="0 0 24 24" class="icon-download"><path fill="currentColor" d="M12 3a1 1 0 0 1 1 1v9.586l2.293-2.293a1 1 0 1 1 1.414 1.414l-4.007 4.007a1.5 1.5 0 0 1-2.121 0L6.572 12.707a1 1 0 1 1 1.414-1.414L10.28 13.59V4a1 1 0 0 1 1-1Zm-7 15a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1Z"/></svg>
                </div>
                <div class="info-text">
                    <div class="info-title">Ready to download</div>
                    <div class="info-subtitle">Best available quality</div>
                </div>
            </div>
            <div class="info-right">
                <span class="badge" title="Format">MP4</span>
                <span class="badge" title="Quality">8K</span>
            </div>
        </div>
    `;
    wrapper.appendChild(downloadMessage);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const dlBtn = document.createElement('button');
    dlBtn.className = 'btn-primary';
    dlBtn.innerHTML = '<div class="btn-progress"></div><div class="btn-progress-secondary"></div><span class="btn-text">Download</span><span class="btn-spinner" aria-hidden="true"></span>';
    actions.appendChild(dlBtn);
    wrapper.appendChild(actions);

    previewDiv.appendChild(wrapper);

    dlBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        dlBtn.disabled = true;
        
        // Start progress bar animations
        const progressBar = dlBtn.querySelector('.btn-progress');
        const progressBarSecondary = dlBtn.querySelector('.btn-progress-secondary');
        let progress = 0;
        let progressSecondary = 0;
        
        const progressInterval = setInterval(() => {
            progress += Math.random() * 20 + 10; // Random increment between 10-30%
            if (progress > 85) progress = 85; // Cap at 85% until completion
            progressBar.style.width = progress + '%';
        }, 300);
        
        const progressIntervalSecondary = setInterval(() => {
            progressSecondary += Math.random() * 15 + 5; // Slower secondary bar
            if (progressSecondary > 70) progressSecondary = 70; // Cap at 70%
            progressBarSecondary.style.width = progressSecondary + '%';
        }, 400);
        
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
            
            // Complete progress bars to 100%
            clearInterval(progressInterval);
            clearInterval(progressIntervalSecondary);
            progressBar.style.width = '100%';
            progressBarSecondary.style.width = '100%';
            
            // Show download success message + any warnings from server
            const warn = result.warning ? `\n<span class="muted">${result.warning}</span>` : '';
            renderStatus(`Download started: ${result.title || result.filename}${warn}`, 'success');
            
            // Reset progress bars after a short delay
            setTimeout(() => {
                progressBar.style.width = '0%';
                progressBarSecondary.style.width = '0%';
                dlBtn.disabled = false;
            }, 1000);
        } catch (err) {
            // Clear progress on error
            clearInterval(progressInterval);
            clearInterval(progressIntervalSecondary);
            progressBar.style.width = '0%';
            progressBarSecondary.style.width = '0%';
            renderStatus(`❌ ${err.message}`, 'error');
            dlBtn.disabled = false;
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
    renderProgressBar();
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
        completeProgressBar();
        renderStatus('Info ready.', 'success');
        renderPreview(data);
    } catch (err) {
        completeProgressBar();
        renderStatus(`❌ ${err.message}`, 'error');
    } finally {
        setLoading(false);
    }
});