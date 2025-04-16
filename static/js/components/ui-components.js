/**
 * UI Components for the Video Converter application.
 */
import { formatBytes, showMessage, createProgressItem } from '../utils/utils.js';


/**
 * Video List Component - Displays videos (e.g., from Google Drive) and handles selection.
 */
export class VideoListComponent {
    constructor(selector, onVideoSelectionChange) {
        const container = document.querySelector(selector);
        if (!container) {
            throw new Error(`VideoListComponent container not found: ${selector}`);
        }
        this.container = container;
        this.onVideoSelectionChange = onVideoSelectionChange; // Callback when selection changes
        this.videoList = [];
        // References to controls (will be created in displayVideos)
        this.headerCheckbox = null;
        this.selectionCounter = null;
        this.deselectAllBtn = null;
        this.selectAllBtn = null; // Added reference
        this.tbody = null; // Reference to table body for updates
    }

    displayVideos(videos = [], source = 'drive') {
        this.videoList = videos;
        this.container.innerHTML = ''; // Clear previous list

        if (this.videoList.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.textContent = source === 'drive' ? 'No videos found or Drive access might be needed.' : 'No videos to display.';
            this.container.appendChild(emptyMessage);
            return;
        }

        this.createControls();
        this.createTable(this.videoList);
        // Initial selection state will be set by updateSelection called from App.js
    }

    createControls() {
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'selection-controls';
        // Use consistent IDs/classes if needed elsewhere
        controlsDiv.innerHTML = `
            <button id="select-all-btn" class="btn small">Select All</button>
            <button id="deselect-all-btn" class="btn small" disabled>Deselect All</button>
            <span class="selection-counter">0 videos selected</span>
        `;
        this.container.appendChild(controlsDiv);

        this.selectAllBtn = controlsDiv.querySelector('#select-all-btn');
        this.deselectAllBtn = controlsDiv.querySelector('#deselect-all-btn');
        this.selectionCounter = controlsDiv.querySelector('.selection-counter');

        this.selectAllBtn.addEventListener('click', () => this.handleSelectAll());
        this.deselectAllBtn.addEventListener('click', () => this.handleDeselectAll());
    }

    createTable(videos) {
        const table = document.createElement('table');
        table.className = 'video-table'; // Ensure CSS targets this

        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th class="video-select"><input type="checkbox" id="header-checkbox" title="Select/Deselect All Visible"></th>
                <th class="video-name">Name</th>
                <th class="video-size">Size</th>
                <th class="video-type">Type</th>
                <th class="video-date">Modified Date</th>
            </tr>
        `;
        this.headerCheckbox = thead.querySelector('#header-checkbox');
        this.headerCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.handleSelectAll();
            } else {
                this.handleDeselectAll();
            }
        });
        table.appendChild(thead);

        this.tbody = document.createElement('tbody'); // Store tbody reference
        videos.forEach(video => {
            const row = this.createTableRow(video);
            this.tbody.appendChild(row);
        });
        table.appendChild(this.tbody);
        this.container.appendChild(table);
    }

    createTableRow(video) {
        const row = document.createElement('tr');
        row.dataset.id = video.id; // Use data-id for easy selection

        let formattedDate = 'N/A';
        if (video.modifiedTime) {
            try {
                const date = new Date(video.modifiedTime);
                // Consistent date formatting
                formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            } catch (e) { console.error("Error formatting date:", e); }
        }

        const mimeTypeShort = video.mimeType ? video.mimeType.split('/')[1] || 'unknown' : 'unknown';
        const sizeFormatted = video.size ? formatBytes(parseInt(video.size, 10)) : 'N/A'; // Ensure size is number

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
        // Event listener for individual checkbox change
        checkbox.addEventListener('change', (e) => {
            this.handleCheckboxChange(video.id, e.target.checked);
        });

        // Allow clicking anywhere on the row (except checkbox cell) to toggle
        row.addEventListener('click', (e) => {
            // Prevent interference if clicking directly on checkbox or its cell
            if (e.target.closest('.video-select')) return;
            checkbox.checked = !checkbox.checked;
            // Manually trigger the change handler
            this.handleCheckboxChange(video.id, checkbox.checked);
        });

        return row;
    }

    // Called when an individual checkbox state changes (user interaction)
    handleCheckboxChange(videoId, isSelected) {
        if (this.onVideoSelectionChange) {
            this.onVideoSelectionChange(videoId, isSelected); // Notify App.js
        }
        // UI update (row style, counts) will be handled by updateSelection when state changes
    }

    // Called when user clicks "Select All" button or header checkbox (checked)
    handleSelectAll() {
        const allVisibleIds = this.videoList.map(v => v.id);
        if (this.onVideoSelectionChange) {
            // Notify App.js to select all *these* specific videos
            this.onVideoSelectionChange(allVisibleIds, true);
        }
    }

    // Called when user clicks "Deselect All" button or header checkbox (unchecked)
    handleDeselectAll() {
        const allVisibleIds = this.videoList.map(v => v.id);
        if (this.onVideoSelectionChange) {
            // Notify App.js to deselect all *these* specific videos
            this.onVideoSelectionChange(allVisibleIds, false);
        }
    }

    /**
     * Updates the visual state of checkboxes and controls based on the provided list of selected IDs.
     * Called by App.js when the central state's selectedDriveVideos changes.
     * @param {string[]} selectedIds - Array of IDs of currently selected videos.
     */
    updateSelection(selectedIds = []) {
        if (!this.tbody) return; // Not initialized yet

        const selectedSet = new Set(selectedIds);
        let visibleSelectedCount = 0;
        const totalVisible = this.videoList.length;

        // Update individual rows and checkboxes
        this.videoList.forEach(video => {
            const row = this.tbody.querySelector(`tr[data-id="${video.id}"]`);
            if (!row) return;
            const checkbox = row.querySelector('.video-checkbox');
            if (!checkbox) return;

            const isSelected = selectedSet.has(video.id);
            row.classList.toggle('selected', isSelected);
            checkbox.checked = isSelected;
            if (isSelected) {
                visibleSelectedCount++;
            }
        });

        // Update controls
        if (this.selectionCounter) {
            this.selectionCounter.textContent = `${visibleSelectedCount} video${visibleSelectedCount !== 1 ? 's' : ''} selected`;
        }
        if (this.deselectAllBtn) {
            this.deselectAllBtn.disabled = visibleSelectedCount === 0;
        }
        if (this.selectAllBtn) {
            this.selectAllBtn.disabled = visibleSelectedCount === totalVisible; // Disable if all are already selected
        }
        if (this.headerCheckbox) {
            this.headerCheckbox.checked = totalVisible > 0 && visibleSelectedCount === totalVisible;
            this.headerCheckbox.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < totalVisible;
            this.headerCheckbox.disabled = totalVisible === 0; // Disable if no videos
        }
    }
}


/**
 * Conversion Form Component - Handles conversion options display.
 * Submission logic is handled by App.js.
 */
export class ConversionFormComponent {
    constructor(selector, onFormatChange) {
        const container = document.querySelector(selector);
        if (!container) {
            throw new Error(`ConversionFormComponent container not found: ${selector}`);
        }
        this.container = container;
        this.onFormatChange = onFormatChange; // Callback when format dropdown changes

        // References to form elements within this component's container
        this.formatSelect = null;
        // Remove reference to the external submit button
        // this.submitButton = null;

        this.createForm(); // Create the basic form structure
        this.setupEventListeners();
    }

    createForm() {
        // Form content focuses only on options within its container
        this.container.innerHTML = `
            <h3>Conversion Options</h3>
            <div class="form-group">
                <label for="target-format">Target Format:</label>
                <select id="target-format" name="targetFormat" class="form-control" required>
                    <!-- Options will be populated dynamically -->
                    <option value="" disabled>Loading formats...</option>
                </select>
            </div>
            <!-- Add other options like reverse, remove sound if needed -->
        `;
        this.formatSelect = this.container.querySelector('#target-format');
        // Remove finding the external submit button
        // this.submitButton = document.getElementById('drive-convert-button');
    }

    setupEventListeners() {
        if (this.formatSelect) {
            this.formatSelect.addEventListener('change', (e) => {
                if (this.onFormatChange) {
                    this.onFormatChange(e.target.value); // Notify App.js of format change
                }
            });
        }
        // Add listeners for other options if they exist
    }

    /**
     * Populates the target format dropdown.
     * Called by App.js when available formats are loaded or change.
     * @param {string[]} formats - Array of available format strings (e.g., ['mp4', 'mov']).
     */
    populateFormatOptions(formats = []) {
        if (!this.formatSelect) return;

        const previouslySelected = this.formatSelect.value;
        this.formatSelect.innerHTML = ''; // Clear existing options

        if (formats.length === 0) {
            this.formatSelect.innerHTML = '<option value="" disabled>No formats available</option>';
            this.formatSelect.disabled = true;
            return;
        }

        this.formatSelect.disabled = false;
        formats.forEach(format => {
            const option = document.createElement('option');
            option.value = format;
            option.textContent = format.toUpperCase(); // Display format nicely
            this.formatSelect.appendChild(option);
        });

        // Try to re-select the previous format, or select the first one
        if (formats.includes(previouslySelected)) {
            this.formatSelect.value = previouslySelected;
        } else {
            this.formatSelect.value = formats[0]; // Default to first format
            // Trigger change event if default selection is made and callback exists
            if (this.onFormatChange && this.formatSelect.value) {
                this.onFormatChange(this.formatSelect.value);
            }
        }
    }

    /**
    * Sets the selected value of the format dropdown.
    * Called by App.js if the selected format state changes externally.
    * @param {string} format - The format string to select.
    */
    setSelectedFormat(format) {
        if (this.formatSelect && format) {
            // Check if the format exists as an option
            const optionExists = Array.from(this.formatSelect.options).some(opt => opt.value === format);
            if (optionExists) {
                this.formatSelect.value = format;
            } else {
                console.warn(`Format "${format}" not found in dropdown options.`);
            }
        }
    }

    /** Helper method for App.js to get current options */
    getConversionOptions() {
        const targetFormat = this.formatSelect ? this.formatSelect.value : '';
        // Add logic to get other options if they exist
        // const reverseVideo = this.reverseCheckbox ? this.reverseCheckbox.checked : false;
        // const removeSound = this.soundCheckbox ? this.soundCheckbox.checked : false;
        // return { targetFormat, reverseVideo, removeSound };
        return { targetFormat }; // Simplified example
    }
}


/**
 * Upload Component - Handles file selection and upload initiation.
 */
export class UploadComponent {
    // constructor(selector, onFileSelect, onUploadSubmit) { // Original signature
    constructor(selector, onFileSelect, onUploadSubmit, onFormatChange) { // Added onFormatChange
        const container = document.querySelector(selector);
        if (!container) {
            throw new Error(`UploadComponent container not found: ${selector}`);
        }
        this.container = container;
        this.onFileSelect = onFileSelect;
        this.onUploadSubmit = onUploadSubmit;
        this.onFormatChange = onFormatChange; // Callback for format change

        // References to elements within the component's container
        this.form = this.container.querySelector('#upload-form');
        this.fileInput = this.container.querySelector('#file-input');
        this.fileNameDisplay = this.container.querySelector('#file-name');
        this.uploadButton = this.container.querySelector('#upload-button');
        this.formatSelect = this.container.querySelector('#upload-target-format'); // Assuming a format select exists here

        if (!this.form || !this.fileInput || !this.fileNameDisplay || !this.uploadButton || !this.formatSelect) {
            console.error("UploadComponent is missing required elements within:", selector);
            // Optionally throw an error or handle gracefully
        }

        this.setupEventListeners();
        this.updateUploadButton(false); // Initially disabled
    }

    setupEventListeners() {
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0] || null;
                this.displaySelectedFile(file);
                if (this.onFileSelect) {
                    this.onFileSelect(file); // Notify App.js
                }
            });
        }

        if (this.form) {
            // Prevent default form submission, notify App.js via callback
            this.form.addEventListener('submit', (e) => {
                e.preventDefault();
                if (this.onUploadSubmit) {
                    this.onUploadSubmit(e); // Pass the event if needed, App.js handles API call
                }
            });
        }

        if (this.formatSelect) {
            this.formatSelect.addEventListener('change', (e) => {
                if (this.onFormatChange) {
                    this.onFormatChange(e.target.value); // Notify App.js of format change
                }
            });
        }
    }

    displaySelectedFile(file) {
        if (this.fileNameDisplay) {
            this.fileNameDisplay.textContent = file ? file.name : 'No file selected';
        }
    }

    /**
     * Updates the enabled/disabled state of the upload button.
     * Called by App.js based on whether a file is selected.
     * @param {boolean} isEnabled - Whether the button should be enabled.
     */
    updateUploadButton(isEnabled) {
        if (this.uploadButton) {
            this.uploadButton.disabled = !isEnabled;
        }
    }

    /**
    * Populates the target format dropdown for uploads.
    * @param {string[]} formats - Array of available format strings.
    */
    populateFormatOptions(formats = []) {
        if (!this.formatSelect) return;

        const previouslySelected = this.formatSelect.value;
        this.formatSelect.innerHTML = ''; // Clear existing

        if (formats.length === 0) {
            this.formatSelect.innerHTML = '<option value="" disabled>No formats</option>';
            this.formatSelect.disabled = true;
            return;
        }

        this.formatSelect.disabled = false;
        formats.forEach(format => {
            const option = document.createElement('option');
            option.value = format;
            option.textContent = format.toUpperCase();
            this.formatSelect.appendChild(option);
        });

        if (formats.includes(previouslySelected)) {
            this.formatSelect.value = previouslySelected;
        } else {
            this.formatSelect.value = formats[0]; // Default to first
            // Trigger change if default selected and callback exists
            if (this.onFormatChange && this.formatSelect.value) {
                this.onFormatChange(this.formatSelect.value);
            }
        }
    }

    /**
    * Sets the selected value of the format dropdown for uploads.
    * @param {string} format - The format string to select.
    */
    setSelectedFormat(format) {
        if (this.formatSelect && format) {
            const optionExists = Array.from(this.formatSelect.options).some(opt => opt.value === format);
            if (optionExists) {
                this.formatSelect.value = format;
            }
        }
    }

    /** Helper method for App.js to get current options */
    getConversionOptions() {
        const targetFormat = this.formatSelect ? this.formatSelect.value : '';
        // Add other upload-specific options if needed
        return { targetFormat };
    }

    /** Resets the file input and display. Called by App.js after successful upload. */
    resetForm() {
        if (this.form) {
            this.form.reset(); // Resets file input
        }
        this.displaySelectedFile(null); // Clear file name display
        // App.js will disable the button via updateUploadButton based on state
    }
}


/**
 * Conversion Progress Component - Displays ongoing conversions based on state data.
 */
export class ConversionProgressComponent {
    // constructor(selector, onAbortConversion) { // New signature
    constructor(selector, onAbortConversion, onDownloadReady) { // Added onDownloadReady
        const container = document.querySelector(selector);
        if (!container) {
            throw new Error(`ConversionProgressComponent container not found: ${selector}`);
        }
        this.container = container;
        this.onAbortConversion = onAbortConversion; // Callback to notify App.js to abort
        this.onDownloadReady = onDownloadReady; // Callback when a download is ready (optional)
        this.renderedConversions = new Map(); // Map<conversionId, { element: HTMLElement, timeoutId?: number }>

        this.container.innerHTML = ''; // Clear initial content
        this.showEmptyStateMessage(); // Show initially
    }

    /**
     * Displays the progress of active conversions based on data from the state manager.
     * @param {Array<object>} conversions - Array of conversion objects from the state.
     * Expected object structure: { id, fileName, format, progress, complete, error, downloadUrl, aborted }
     */
    displayProgress(conversions = []) {
        const currentIds = new Set(conversions.map(c => c.id));
        const renderedIds = new Set(this.renderedConversions.keys());

        // Remove items from UI that are no longer in the state data
        renderedIds.forEach(id => {
            if (!currentIds.has(id)) {
                this.removeRenderedItem(id);
            }
        });

        // Add or update items
        conversions.forEach(conv => {
            this.addOrUpdateItem(conv);
        });

        // Update empty state message
        if (this.renderedConversions.size === 0) {
            this.showEmptyStateMessage();
        } else {
            this.removeEmptyStateMessage();
        }
    }

    addOrUpdateItem(conversion) {
        let item = this.renderedConversions.get(conversion.id);
        let element = item ? item.element : null;

        // --- Create Element if it doesn't exist ---
        if (!element) {
            this.removeEmptyStateMessage(); // Ensure empty message is gone
            element = createProgressItem(`${conversion.fileName} → ${conversion.format.toUpperCase()}`);
            element.dataset.id = conversion.id;

            // Add abort button (conditionally)
            if (!conversion.complete && !conversion.error && !conversion.aborted) {
                const abortButton = this.createAbortButton(conversion.id);
                element.appendChild(abortButton);
            }

            this.container.appendChild(element);
            item = { element }; // Create new item entry
            this.renderedConversions.set(conversion.id, item);
        }

        // --- Update Element based on conversion state ---
        this.updateProgressBar(element, conversion.progress);

        // Clear previous status classes/elements
        element.classList.remove('complete', 'error', 'aborted');
        const existingStatus = element.querySelector('.multi-progress-status, .multi-progress-download, .multi-progress-error');
        if (existingStatus) existingStatus.remove();
        const abortButton = element.querySelector('.abort-button');


        // Handle different states
        if (conversion.aborted) {
            element.classList.add('aborted');
            if (abortButton) abortButton.remove(); // Remove abort button if present
            this.appendStatusMessage(element, 'Conversion aborted', 'aborted');
            this.scheduleRemoval(conversion.id, 5000); // Shorter delay for aborted
        } else if (conversion.error) {
            element.classList.add('error');
            if (abortButton) abortButton.remove();
            this.appendErrorMessage(element, conversion.error);
            this.scheduleRemoval(conversion.id, 10000); // Longer delay for errors
        } else if (conversion.complete) {
            element.classList.add('complete');
            if (abortButton) abortButton.remove();
            this.appendDownloadLink(element, conversion.downloadUrl, conversion.fileName); // Use appropriate filename
            if (this.onDownloadReady) {
                this.onDownloadReady(conversion); // Notify app
            }
            this.scheduleRemoval(conversion.id, 30000); // Longer delay for completed items
        } else {
            // Still in progress - ensure abort button exists if needed
            if (!abortButton) {
                const newAbortButton = this.createAbortButton(conversion.id);
                element.appendChild(newAbortButton);
            }
            // Clear any removal timeout if it somehow became active again
            if (item.timeoutId) {
                clearTimeout(item.timeoutId);
                item.timeoutId = undefined;
            }
        }
    }

    createAbortButton(conversionId) {
        const abortButton = document.createElement('button');
        abortButton.className = 'abort-button';
        abortButton.innerHTML = '&times;'; // Use HTML entity
        abortButton.title = 'Abort conversion';
        abortButton.addEventListener('click', (e) => {
            e.stopPropagation();
            abortButton.disabled = true; // Disable immediately
            if (this.onAbortConversion) {
                this.onAbortConversion(conversionId); // Notify App.js
            }
        });
        return abortButton;
    }

    updateProgressBar(element, progress) {
        const progressBar = element.querySelector('.multi-progress-bar');
        const percentText = element.querySelector('.multi-progress-percent');
        if (progressBar && percentText) {
            const percent = Math.max(0, Math.min(100, Math.round(progress || 0))); // Default progress to 0
            progressBar.style.width = `${percent}%`;
            percentText.textContent = `${percent}%`;
        }
    }

    appendStatusMessage(element, message, className) {
        if (!element.querySelector('.multi-progress-status')) { // Append only once
            const msgDiv = document.createElement('div');
            msgDiv.className = `multi-progress-status ${className}`;
            msgDiv.textContent = message;
            element.appendChild(msgDiv);
        }
    }

    appendErrorMessage(element, errorMsg) {
        if (!element.querySelector('.multi-progress-error')) { // Append only once
            const errorDiv = document.createElement('div');
            errorDiv.className = 'multi-progress-error';
            errorDiv.textContent = `Error: ${errorMsg}`;
            element.appendChild(errorDiv);
        }
    }

    appendDownloadLink(element, downloadUrl, originalFileName) {
        if (!element.querySelector('.multi-progress-download')) { // Append only once
            const downloadLink = document.createElement('a');
            downloadLink.className = 'multi-progress-download btn small success'; // Style as button
            downloadLink.href = downloadUrl;
            downloadLink.textContent = 'Download';
            downloadLink.title = `Download converted file (${originalFileName})`;
            downloadLink.target = '_blank'; // Open in new tab/window
            downloadLink.setAttribute('download', ''); // Suggest download with original name (browser might override)
            element.appendChild(downloadLink);
        }
    }

    scheduleRemoval(conversionId, delay) {
        const item = this.renderedConversions.get(conversionId);
        if (!item) return;

        // Clear existing timeout if rescheduling
        if (item.timeoutId) {
            clearTimeout(item.timeoutId);
        }

        item.timeoutId = setTimeout(() => {
            this.removeRenderedItem(conversionId);
            // Check empty state after removal
            if (this.renderedConversions.size === 0) {
                this.showEmptyStateMessage();
            }
        }, delay);
    }

    removeRenderedItem(conversionId) {
        const item = this.renderedConversions.get(conversionId);
        if (item) {
            if (item.timeoutId) {
                clearTimeout(item.timeoutId); // Clear timeout if removed manually/early
            }
            if (item.element) {
                item.element.remove(); // Remove from DOM
            }
            this.renderedConversions.delete(conversionId); // Remove from map
        }
    }

    showEmptyStateMessage() {
        // Add message only if container is empty and message doesn't exist
        if (this.container.children.length === 0 && !this.container.querySelector('.empty-message')) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.id = 'no-conversions-message'; // Keep ID if needed
            emptyMessage.textContent = 'No active conversions.';
            this.container.appendChild(emptyMessage);
        }
    }

    removeEmptyStateMessage() {
        const emptyMessage = this.container.querySelector('#no-conversions-message');
        if (emptyMessage) {
            emptyMessage.remove();
        }
    }
}


// Removed FileListComponent as it wasn't part of the core conversion flow refactoring focus
// If needed, it would be refactored similarly: App.js loads files into state,
// FileListComponent subscribes to state changes and renders, notifying App.js about delete actions.