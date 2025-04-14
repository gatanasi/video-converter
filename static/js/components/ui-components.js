/**
 * UI Components for the Video Converter application.
 */
import { formatBytes, showMessage, clearMessages, createProgressItem } from '../utils/utils.js';
import apiService from '../api/api-service.js';

const REMOVAL_DELAY = 10000; // Delay before removing completed/failed items (ms)
const ABORT_REMOVAL_DELAY = 5000; // Shorter delay for aborted items

/**
 * Active Conversions Component - Displays and manages ongoing conversions.
 */
export class ActiveConversionsComponent {
    constructor(options) {
        this.container = options.container;
        this.messageContainer = options.messageContainer;
        this.onConversionComplete = options.onConversionComplete;
        this.activeConversions = new Map(); // Map<conversionId, { fileName, format, element, aborted?, timeoutId? }>
        this.progressInterval = null;
        this.pollingInterval = null;
        this.isPolling = false; // Flag to prevent multiple simultaneous polls

        this.createElements();
        this.loadActiveConversions(); // Initial load
        this.startPolling();
    }

    startPolling() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        // Poll immediately, then set interval
        this.loadActiveConversions();
        this.pollingInterval = setInterval(() => this.loadActiveConversions(), 5000);
        console.log('Started polling for active conversions every 5 seconds');
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log('Stopped polling for active conversions');
        }
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    createElements() {
        this.container.innerHTML = ''; // Clear previous content

        const header = document.createElement('h2');
        header.className = 'section-title'; // Use class if defined in CSS
        header.textContent = 'Running Conversions';
        this.container.appendChild(header);

        this.progressContainer = document.createElement('div');
        this.progressContainer.className = 'multi-progress';
        this.container.appendChild(this.progressContainer);

        this.container.classList.remove('hidden'); // Ensure section is visible
        this.showEmptyStateMessage(); // Show initially
    }

    showEmptyStateMessage() {
        // Add message only if container is empty and message doesn't exist
        if (this.progressContainer.children.length === 0 && !this.progressContainer.querySelector('.empty-message')) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.id = 'no-conversions-message'; // Keep ID for potential removal
            emptyMessage.textContent = 'No active conversions.';
            this.progressContainer.appendChild(emptyMessage);
        }
    }

    removeEmptyStateMessage() {
        const emptyMessage = this.progressContainer.querySelector('#no-conversions-message');
        if (emptyMessage) {
            emptyMessage.remove();
        }
    }

    async loadActiveConversions() {
        if (this.isPolling) return; // Prevent concurrent polls
        this.isPolling = true;

        try {
            const serverConversions = await apiService.listActiveConversions();
            const serverIds = new Set(serverConversions.map(conv => conv.id));
            const clientIds = new Set(this.activeConversions.keys());

            // Add new conversions not tracked by the client
            serverConversions.forEach(conv => {
                if (!clientIds.has(conv.id)) {
                    this.addConversionItem(conv.id, conv.fileName, conv.format, conv.progress);
                }
            });

            // Remove conversions from client that are no longer active on the server
            clientIds.forEach(id => {
                if (!serverIds.has(id)) {
                    this.removeConversionItem(id);
                }
            });

            // Update UI state (empty message, progress interval)
            if (this.activeConversions.size > 0) {
                this.removeEmptyStateMessage();
                if (!this.progressInterval) {
                    // Start progress updates only if there are active items
                    this.progressInterval = setInterval(() => this.updateAllProgressBars(), 2000);
                }
            } else {
                this.showEmptyStateMessage();
                if (this.progressInterval) {
                    clearInterval(this.progressInterval);
                    this.progressInterval = null;
                }
            }
        } catch (error) {
            console.error('Error loading active conversions:', error);
            // Avoid flooding UI during polling, show error only on initial load failure?
            // Or maybe show a persistent but dismissible error bar? For now, just log.
        } finally {
            this.isPolling = false;
        }
    }

    addConversionItem(conversionId, fileName, format, initialProgress = 0) {
        this.removeEmptyStateMessage(); // Ensure empty message is gone

        const progressItem = createProgressItem(`${fileName} → ${format.toUpperCase()}`);
        progressItem.dataset.id = conversionId;

        const abortButton = document.createElement('button');
        abortButton.className = 'abort-button'; // Use class for styling
        abortButton.innerHTML = '×'; // Use HTML entity for cross
        abortButton.title = 'Abort conversion';
        abortButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.abortConversion(conversionId);
        });
        progressItem.appendChild(abortButton);

        // Set initial progress
        this.updateProgressBar(progressItem, initialProgress);

        this.progressContainer.appendChild(progressItem);

        this.activeConversions.set(conversionId, {
            fileName,
            format,
            element: progressItem
        });
    }

    /** Safely removes a conversion item from the UI and map */
    removeConversionItem(conversionId, delay = 0) {
        const conversion = this.activeConversions.get(conversionId);
        if (!conversion) return;

        // Clear any existing removal timeout
        if (conversion.timeoutId) {
            clearTimeout(conversion.timeoutId);
        }

        const performRemoval = () => {
            if (conversion.element) {
                conversion.element.remove();
            }
            this.activeConversions.delete(conversionId);

            // Check if UI should show empty state after removal
            if (this.activeConversions.size === 0) {
                this.showEmptyStateMessage();
                if (this.progressInterval) {
                    clearInterval(this.progressInterval);
                    this.progressInterval = null;
                }
            }
        };

        if (delay > 0) {
            conversion.timeoutId = setTimeout(performRemoval, delay);
        } else {
            performRemoval();
        }
    }

    updateProgressBar(element, progress) {
        const progressBar = element.querySelector('.multi-progress-bar');
        const percentText = element.querySelector('.multi-progress-percent');
        if (progressBar && percentText) {
            const percent = Math.max(0, Math.min(100, Math.round(progress))); // Clamp between 0-100
            progressBar.style.width = `${percent}%`;
            percentText.textContent = `${percent}%`;
        }
    }

    async updateAllProgressBars() {
        if (this.activeConversions.size === 0) {
            // Should be handled by loadActiveConversions, but as a safeguard:
            if (this.progressInterval) {
                clearInterval(this.progressInterval);
                this.progressInterval = null;
            }
            this.showEmptyStateMessage();
            return;
        }

        // Create promises for all status requests
        const statusPromises = Array.from(this.activeConversions.keys()).map(id =>
            apiService.getConversionStatus(id).catch(error => {
                console.error(`Error fetching status for ${id}:`, error);
                return null; // Return null on error to avoid breaking Promise.all
            })
        );

        const statuses = await Promise.all(statusPromises);

        statuses.forEach(status => {
            if (!status) return; // Skip if fetching status failed

            const conversionId = status.id;
            const conversion = this.activeConversions.get(conversionId);
            if (!conversion || !conversion.element) return; // Skip if conversion was removed

            this.updateProgressBar(conversion.element, status.progress);

            if (status.complete) {
                this.handleCompletion(conversionId, status);
            }
        });
    }

    handleCompletion(conversionId, status) {
        const conversion = this.activeConversions.get(conversionId);
        if (!conversion || !conversion.element) return;

        // Remove abort button on completion
        const abortButton = conversion.element.querySelector('.abort-button');
        if (abortButton) abortButton.remove();

        if (status.error && !conversion.aborted) {
            // Handle error completion
            conversion.element.classList.add('error');
            const errorMsg = document.createElement('div');
            errorMsg.className = 'multi-progress-error'; // Use specific class
            errorMsg.textContent = status.error;
            // Append error message only if not already present
            if (!conversion.element.querySelector('.multi-progress-error')) {
                conversion.element.appendChild(errorMsg);
            }
            this.removeConversionItem(conversionId, REMOVAL_DELAY);
        } else if (!status.error && !conversion.aborted) {
            // Handle successful completion
            conversion.element.classList.add('complete');
            const downloadLink = document.createElement('a');
            downloadLink.className = 'multi-progress-download'; // Use specific class
            downloadLink.href = status.downloadUrl; // Use downloadUrl from status API
            downloadLink.textContent = 'Download';
            downloadLink.target = '_blank'; // Open in new tab
            downloadLink.setAttribute('download', ''); // Suggest download
            // Append download link only if not already present
            if (!conversion.element.querySelector('.multi-progress-download')) {
                conversion.element.appendChild(downloadLink);
            }

            if (this.onConversionComplete) {
                this.onConversionComplete(); // Notify app (e.g., refresh file list)
            }
            this.removeConversionItem(conversionId, REMOVAL_DELAY);
        }
        // If conversion.aborted is true, the abort function handles the UI update and removal.
    }

    async abortConversion(conversionId) {
        const conversion = this.activeConversions.get(conversionId);
        if (!conversion || conversion.aborted) return; // Already aborted or gone

        // Disable button immediately
        const abortButton = conversion.element.querySelector('.abort-button');
        if (abortButton) abortButton.disabled = true;

        try {
            await apiService.abortConversion(conversionId);
            conversion.aborted = true; // Mark as aborted
            conversion.element.classList.add('aborted');

            // Remove abort button and progress bar details, show status message
            if (abortButton) abortButton.remove();
            const info = conversion.element.querySelector('.multi-progress-info');
            const barContainer = conversion.element.querySelector('.multi-progress-bar-container');
            if (info) info.style.opacity = '0.5'; // Dim the info
            if (barContainer) barContainer.remove(); // Remove progress bar

            const abortMsg = document.createElement('div');
            abortMsg.className = 'multi-progress-status aborted'; // Use general status class
            abortMsg.textContent = 'Conversion aborted';
            // Append message only if not already present
            if (!conversion.element.querySelector('.multi-progress-status')) {
                conversion.element.appendChild(abortMsg);
            }

            this.removeConversionItem(conversionId, ABORT_REMOVAL_DELAY);

        } catch (error) {
            console.error('Error aborting conversion:', error);
            showMessage(this.messageContainer, `Failed to abort conversion: ${error.message}`, 'error');
            // Re-enable button if abort failed
            if (abortButton) abortButton.disabled = false;
        }
    }
}

/**
 * Video List Component - Displays videos from Google Drive and handles selection.
 */
export class VideoListComponent {
    constructor(options) {
        this.container = options.container;
        this.onSelectVideos = options.onSelectVideo; // Renamed for clarity
        this.videoList = [];
        this.selectedVideos = new Map(); // Map<videoId, videoObject>
        this.headerCheckbox = null;
        this.selectionCounter = null;
        this.deselectAllBtn = null;
    }

    displayVideos(videos) {
        this.videoList = videos || [];
        this.container.innerHTML = ''; // Clear previous list
        this.selectedVideos.clear();

        if (this.videoList.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.textContent = 'No videos found in this folder.';
            this.container.appendChild(emptyMessage);
            this.updateSelectionUI(); // Ensure controls are hidden/disabled
            return;
        }

        this.createControls();
        this.createTable(this.videoList);
        this.updateSelectionUI(); // Initial UI state
    }

    createControls() {
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'selection-controls';
        controlsDiv.innerHTML = `
            <button id="select-all-btn" class="btn small">Select All</button>
            <button id="deselect-all-btn" class="btn small">Deselect All</button>
            <div class="selection-counter">0 videos selected</div>
        `;
        this.container.appendChild(controlsDiv);

        const selectAllBtn = controlsDiv.querySelector('#select-all-btn');
        this.deselectAllBtn = controlsDiv.querySelector('#deselect-all-btn');
        this.selectionCounter = controlsDiv.querySelector('.selection-counter');

        selectAllBtn.addEventListener('click', () => this.selectAllVideos());
        this.deselectAllBtn.addEventListener('click', () => this.deselectAllVideos());
    }

    createTable(videos) {
        const table = document.createElement('table');
        table.className = 'video-table';

        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th class="video-select"><input type="checkbox" id="header-checkbox" title="Select/Deselect All"></th>
                <th class="video-name">Name</th>
                <th class="video-size">Size</th>
                <th class="video-type">Type</th>
                <th class="video-date">Modified Date</th>
            </tr>
        `;
        this.headerCheckbox = thead.querySelector('#header-checkbox');
        this.headerCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.selectAllVideos();
            } else {
                this.deselectAllVideos();
            }
        });
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        videos.forEach(video => {
            const row = this.createTableRow(video);
            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        this.container.appendChild(table);
    }

    createTableRow(video) {
        const row = document.createElement('tr');
        row.dataset.id = video.id;

        let formattedDate = 'N/A';
        if (video.modifiedTime) {
            try {
                const date = new Date(video.modifiedTime);
                formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            } catch (e) { console.error("Error formatting date:", e); }
        }

        const mimeTypeShort = video.mimeType ? video.mimeType.split('/')[1] || 'unknown' : 'unknown';
        const sizeFormatted = video.size ? formatBytes(video.size) : 'N/A';

        row.innerHTML = `
            <td class="video-select">
                <input type="checkbox" class="video-checkbox" data-id="${video.id}">
            </td>
            <td class="video-name" title="${video.name}">${video.name}</td>
            <td class="video-size">${sizeFormatted}</td>
            <td class="video-type">${mimeTypeShort}</td>
            <td class="video-date">${formattedDate}</td>
        `;

        const checkbox = row.querySelector('.video-checkbox');
        checkbox.addEventListener('change', (e) => {
            this.toggleSelection(video.id, e.target.checked, row);
        });

        // Allow clicking anywhere on the row (except checkbox cell) to toggle
        row.addEventListener('click', (e) => {
            if (e.target.closest('.video-select')) return; // Ignore clicks on the checkbox cell itself
            checkbox.checked = !checkbox.checked;
            this.toggleSelection(video.id, checkbox.checked, row);
        });

        return row;
    }

    toggleSelection(videoId, isSelected, rowElement) {
        const video = this.videoList.find(v => v.id === videoId);
        if (!video) return;

        if (isSelected) {
            this.selectedVideos.set(videoId, video);
            rowElement.classList.add('selected');
        } else {
            this.selectedVideos.delete(videoId);
            rowElement.classList.remove('selected');
        }
        this.updateSelectionUI();
        this.notifySelectionChange();
    }

    selectAllVideos() {
        this.videoList.forEach(video => {
            if (!this.selectedVideos.has(video.id)) {
                this.selectedVideos.set(video.id, video);
                const row = this.container.querySelector(`tr[data-id="${video.id}"]`);
                if (row) {
                    row.classList.add('selected');
                    const checkbox = row.querySelector('.video-checkbox');
                    if (checkbox) checkbox.checked = true;
                }
            }
        });
        this.updateSelectionUI();
        this.notifySelectionChange();
    }

    deselectAllVideos() {
        this.selectedVideos.forEach((video, videoId) => {
            const row = this.container.querySelector(`tr[data-id="${videoId}"]`);
            if (row) {
                row.classList.remove('selected');
                const checkbox = row.querySelector('.video-checkbox');
                if (checkbox) checkbox.checked = false;
            }
        });
        this.selectedVideos.clear();
        this.updateSelectionUI();
        this.notifySelectionChange();
    }

    updateSelectionUI() {
        const count = this.selectedVideos.size;
        const total = this.videoList.length;

        if (this.selectionCounter) {
            this.selectionCounter.textContent = `${count} video${count !== 1 ? 's' : ''} selected`;
        }
        if (this.deselectAllBtn) {
            this.deselectAllBtn.disabled = count === 0;
        }
        if (this.headerCheckbox) {
            this.headerCheckbox.checked = count > 0 && count === total;
            this.headerCheckbox.indeterminate = count > 0 && count < total;
        }
    }

    notifySelectionChange() {
        if (this.onSelectVideos) {
            // Pass an array of the selected video objects
            this.onSelectVideos([...this.selectedVideos.values()]);
        }
    }

    getSelectedVideos() {
        return [...this.selectedVideos.values()];
    }
}

/**
 * Conversion Form Component - Handles conversion options and submission.
 */
export class ConversionFormComponent {
    constructor(options) {
        this.container = options.container;
        this.messageContainer = options.messageContainer;
        this.onConversionComplete = options.onConversionComplete;
        // activeConversionsComponent is passed but not directly used here, maybe remove?
        this.selectedVideos = []; // Store the array of selected videos

        this.createForm();
        this.convertButton = this.container.querySelector('#convert-button');
        this.updateFormState(); // Initial state
    }

    createForm() {
        const form = document.createElement('form');
        form.className = 'conversion-form';
        form.innerHTML = `
            <div class="form-group">
                <label for="target-format">Target Format:</label>
                <select id="target-format" class="form-control">
                    <option value="mov">MOV (H.265)</option>
                    <option value="mp4">MP4 (H.265)</option>
                    <option value="avi">AVI (Xvid)</option>
                </select>
            </div>
            <div class="form-options">
                <label class="checkbox-container">
                    <input type="checkbox" id="reverse-video">
                    Reverse Video
                </label>
                <label class="checkbox-container">
                    <input type="checkbox" id="remove-sound" checked>
                    Remove Sound
                </label>
            </div>
            <div class="form-actions">
                <button type="submit" id="convert-button" class="btn primary">Convert Video</button>
            </div>
        `;

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitConversion();
        });

        this.container.appendChild(form);
    }

    /** Update based on the list of selected videos from VideoListComponent */
    updateSelectedVideos(videos) {
        this.selectedVideos = videos || [];
        this.updateFormState();
    }

    updateFormState() {
        const count = this.selectedVideos.length;
        if (this.convertButton) {
            this.convertButton.disabled = count === 0;
            this.convertButton.textContent = count > 1 ? `Convert ${count} Videos` : 'Convert Video';
        }
        // Hide/show form section based on selection?
        this.container.classList.toggle('hidden', count === 0);
    }

    async submitConversion() {
        if (this.selectedVideos.length === 0) {
            showMessage(this.messageContainer, 'Please select at least one video first.', 'error');
            return;
        }

        const targetFormat = this.container.querySelector('#target-format').value;
        const reverseVideo = this.container.querySelector('#reverse-video').checked;
        const removeSound = this.container.querySelector('#remove-sound').checked;

        // Disable button and show processing state
        this.convertButton.disabled = true;
        this.convertButton.classList.add('button-pulse');
        const originalButtonText = this.convertButton.textContent;
        this.convertButton.textContent = 'Processing...';

        const videoCount = this.selectedVideos.length;
        showMessage(
            this.messageContainer,
            `Starting conversion of ${videoCount} video${videoCount !== 1 ? 's' : ''}...`,
            'info',
            0 // Don't auto-hide this initial message
        );

        let successCount = 0;
        let failCount = 0;
        const conversionPromises = this.selectedVideos.map(video => {
            const conversionData = {
                fileId: video.id,
                fileName: video.name,
                mimeType: video.mimeType,
                targetFormat: targetFormat,
                reverseVideo: reverseVideo,
                removeSound: removeSound
            };
            return apiService.convertFromDrive(conversionData)
                .then(response => {
                    if (response.success) {
                        successCount++;
                    } else {
                        failCount++;
                        // Show individual failure message immediately
                        showMessage(
                            this.messageContainer, // Or a dedicated error area?
                            `Conversion failed for ${video.name}: ${response.error || 'Unknown error'}`,
                            'error'
                        );
                    }
                })
                .catch(error => {
                    failCount++;
                    showMessage(
                        this.messageContainer,
                        `Error starting conversion for ${video.name}: ${error.message}`,
                        'error'
                    );
                    console.error(`Conversion start error for ${video.name}:`, error);
                });
        });

        // Wait for all conversion requests to be sent
        await Promise.all(conversionPromises);

        // Restore button state
        this.convertButton.disabled = false; // Re-enable based on selection after completion
        this.convertButton.classList.remove('button-pulse');
        this.convertButton.textContent = originalButtonText; // Restore original text or update based on selection
        this.updateFormState(); // Update button based on current selection state

        // Show summary message
        if (failCount === 0 && successCount > 0) {
            showMessage(
                this.messageContainer,
                `Successfully started ${successCount} conversion${successCount > 1 ? 's' : ''}. See progress above.`,
                'success'
            );
        } else if (successCount > 0) {
            showMessage(
                this.messageContainer,
                `Started ${successCount} conversion${successCount > 1 ? 's' : ''}, but ${failCount} failed to start. See progress/errors above.`,
                'warning'
            );
        } else {
            // All failed to start, specific errors shown above
            showMessage(
                this.messageContainer,
                `Failed to start any conversions. See errors above.`,
                'error'
            );
        }

        // Trigger callback (e.g., to refresh active conversions list)
        if (this.onConversionComplete) {
            this.onConversionComplete();
        }

        // Optionally scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}


/**
 * File List Component - Displays previously converted files.
 */
export class FileListComponent {
    constructor(options) {
        this.container = options.container;
        this.messageContainer = options.messageContainer;
        this.fileList = [];
    }

    async loadFiles() {
        try {
            const files = await apiService.listFiles();
            // Data is now pre-sorted by the backend
            this.fileList = files || [];
            this.displayFiles();
        } catch (error) {
            console.error('Error loading files:', error);
            // Show error in the file list container itself if it's empty
            if (this.fileList.length === 0) {
                this.container.innerHTML = `<div class="empty-message error">Failed to load files: ${error.message}</div>`;
            } else {
                // Show error in the main message area if list already has content
                showMessage(this.messageContainer, `Failed to load files: ${error.message}`, 'error');
            }
        }
    }

    displayFiles() {
        this.container.innerHTML = ''; // Clear previous list

        if (this.fileList.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.textContent = 'No converted files found.';
            this.container.appendChild(emptyMessage);
            return;
        }

        const table = document.createElement('table');
        table.className = 'file-table';

        table.innerHTML = `
            <thead>
                <tr>
                    <th class="file-name">Name</th>
                    <th class="file-size">Size</th>
                    <th class="file-date">Date Created</th>
                    <th class="file-actions">Actions</th>
                </tr>
            </thead>
        `;

        const tbody = document.createElement('tbody');
        this.fileList.forEach(file => {
            const row = this.createFileRow(file);
            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        this.container.appendChild(table);
    }

    createFileRow(file) {
        const row = document.createElement('tr');

        let formattedDate = 'N/A';
        if (file.modTime) {
            try {
                const date = new Date(file.modTime);
                formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            } catch (e) { console.error("Error formatting date:", e); }
        }
        const sizeFormatted = file.size ? formatBytes(file.size) : 'N/A';

        row.innerHTML = `
            <td class="file-name" title="${file.name}">${file.name}</td>
            <td class="file-size">${sizeFormatted}</td>
            <td class="file-date">${formattedDate}</td>
            <td class="file-actions">
                <a href="${file.url}" class="btn small success" download title="Download file">↓</a>
                <button class="btn small danger delete" title="Delete file">×</button>
            </td>
        `;

        const deleteButton = row.querySelector('button.delete');
        deleteButton.addEventListener('click', () => this.deleteFile(file.name, row)); // Pass row for potential UI feedback

        return row;
    }

    async deleteFile(fileName, rowElement) {
        // Optional: Add visual cue that deletion is in progress
        rowElement.style.opacity = '0.5';
        const deleteButton = rowElement.querySelector('button.delete');
        if (deleteButton) deleteButton.disabled = true;

        if (!confirm(`Are you sure you want to delete "${fileName}"? This cannot be undone.`)) {
            rowElement.style.opacity = '1'; // Restore appearance
            if (deleteButton) deleteButton.disabled = false;
            return;
        }

        try {
            await apiService.deleteFile(fileName);
            showMessage(this.messageContainer, `File "${fileName}" deleted successfully.`, 'success');
            // Animate removal before reloading
            rowElement.style.transition = 'opacity 0.3s ease-out';
            rowElement.style.opacity = '0';
            setTimeout(() => {
                this.loadFiles(); // Refresh the list after animation
            }, 300);
        } catch (error) {
            console.error('Error deleting file:', error);
            showMessage(this.messageContainer, `Failed to delete file "${fileName}": ${error.message}`, 'error');
            rowElement.style.opacity = '1'; // Restore appearance on error
            if (deleteButton) deleteButton.disabled = false;
        }
    }
}