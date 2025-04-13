/**
 * UI Components - Reusable UI components and elements for the application
 */
import { formatBytes, showMessage, clearMessages, createProgressItem } from '../utils/utils.js';
import apiService from '../api/api-service.js';

/**
 * Active Conversions Component - Shows running conversions even after page reload
 */
export class ActiveConversionsComponent {
    /**
     * Initialize the active conversions component
     * @param {Object} options - Configuration options
     * @param {HTMLElement} options.container - Container element for active conversions
     * @param {HTMLElement} options.messageContainer - Container for status messages
     * @param {Function} options.onConversionComplete - Callback when a conversion completes
     */
    constructor(options) {
        this.container = options.container;
        this.messageContainer = options.messageContainer;
        this.onConversionComplete = options.onConversionComplete;
        this.activeConversions = new Map(); // Track active conversions by ID
        this.progressInterval = null;
        this.pollingInterval = null; // New interval for polling active conversions
        
        // Create UI elements
        this.createElements();
        
        // Load active conversions on initialization
        this.loadActiveConversions();
        
        // Start polling for active conversions every 5 seconds
        this.startPolling();
    }
    
    /**
     * Start polling for active conversions
     */
    startPolling() {
        // Clear existing polling interval if any
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        
        // Set up a new polling interval that runs every 3 seconds
        this.pollingInterval = setInterval(() => this.loadActiveConversions(), 5000);
        console.log('Started polling for active conversions every 5 seconds');
    }
    
    /**
     * Stop polling for active conversions
     */
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log('Stopped polling for active conversions');
        }
    }
    
    /**
     * Create the UI elements
     */
    createElements() {
        // Clear container
        this.container.innerHTML = '';
        
        // Create header
        const header = document.createElement('h2');
        header.className = 'section-title';
        header.textContent = 'Running Conversions';
        this.container.appendChild(header);
        
        // Create progress container
        this.progressContainer = document.createElement('div');
        this.progressContainer.className = 'multi-progress';
        this.container.appendChild(this.progressContainer);
        
        // Always show the container, even when empty
        this.container.classList.remove('hidden');
    }
    
    /**
     * Show empty state message if no conversions are active
     */
    showEmptyStateMessage() {
        // Only add empty message if it doesn't already exist
        if (!this.progressContainer.querySelector('#no-conversions-message')) {
            this.progressContainer.innerHTML = '';
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.id = 'no-conversions-message';
            emptyMessage.textContent = 'No active conversions.';
            this.progressContainer.appendChild(emptyMessage);
        }
    }
    
    /**
     * Load active conversions from the server
     */
    async loadActiveConversions() {
        try {
            const activeConversions = await apiService.listActiveConversions();
            
            // New way to track conversions that need to be added or removed
            const currentIds = new Set([...this.activeConversions.keys()]);
            const newIds = new Set(activeConversions.map(conv => conv.id));
            
            // Handle newly added conversions
            activeConversions.forEach(conversion => {
                const conversionId = conversion.id;
                
                // Only add new conversions that aren't already tracked
                if (!this.activeConversions.has(conversionId)) {
                    this.trackConversionProgress(
                        conversionId,
                        conversion.fileName,
                        conversion.format,
                        conversion.progress
                    );
                }
            });
            
            // Find and remove conversions that no longer exist
            currentIds.forEach(id => {
                if (!newIds.has(id)) {
                    const conversion = this.activeConversions.get(id);
                    if (conversion && conversion.element) {
                        conversion.element.remove();
                    }
                    this.activeConversions.delete(id);
                }
            });
            
            // Start or maintain progress tracking
            if (this.activeConversions.size > 0) {
                if (!this.progressInterval) {
                    this.progressInterval = setInterval(() => this.updateAllProgressBars(), 2000);
                }
            } else {
                // Show empty state message if there are no active conversions
                this.showEmptyStateMessage();
            }
        } catch (error) {
            console.error('Error loading active conversions:', error);
            // Don't show error message during regular polling to avoid flooding the UI
            if (!this.pollingInterval) {
                showMessage(this.messageContainer, `Error loading active conversions: ${error.message}`, 'error');
            }
        }
    }
    
    /**
     * Track conversion progress
     * @param {String} conversionId - ID of the conversion to track
     * @param {String} fileName - Name of the file being converted
     * @param {String} format - Target format
     * @param {Number} initialProgress - Initial progress percentage
     */
    trackConversionProgress(conversionId, fileName, format, initialProgress = 0) {
        // Create progress item
        const progressItem = createProgressItem(`${fileName} → ${format.toUpperCase()}`);
        progressItem.dataset.id = conversionId;
        
        // Add abort button
        const abortButton = document.createElement('button');
        abortButton.className = 'abort-button';
        abortButton.innerHTML = '×';
        abortButton.title = 'Abort conversion';
        abortButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.abortConversion(conversionId);
        });
        progressItem.appendChild(abortButton);
        
        // Set initial progress
        const progressBar = progressItem.querySelector('.multi-progress-bar');
        const percentText = progressItem.querySelector('.multi-progress-percent');
        if (progressBar && percentText) {
            progressBar.style.width = `${initialProgress}%`;
            percentText.textContent = `${Math.round(initialProgress)}%`;
        }
        
        this.progressContainer.appendChild(progressItem);
        
        // Add to active conversions map
        this.activeConversions.set(conversionId, {
            fileName,
            format,
            element: progressItem
        });
    }
    
    /**
     * Update all progress bars for active conversions
     */
    async updateAllProgressBars() {
        if (this.activeConversions.size === 0) {
            // Only clear the progress update interval, not the polling interval
            if (this.progressInterval) {
                clearInterval(this.progressInterval);
                this.progressInterval = null;
            }
            this.showEmptyStateMessage();
            return;
        }
        
        // Check each active conversion
        for (const [conversionId, conversion] of this.activeConversions.entries()) {
            try {
                const status = await apiService.getConversionStatus(conversionId);
                const progressBar = conversion.element.querySelector('.multi-progress-bar');
                const percentText = conversion.element.querySelector('.multi-progress-percent');
                
                if (progressBar && percentText) {
                    const percent = Math.round(status.progress);
                    progressBar.style.width = `${percent}%`;
                    percentText.textContent = `${percent}%`;
                    
                    // If complete, update the UI
                    if (status.complete) {
                        if (status.error && !conversion.aborted) {
                            // Only show error if this wasn't already handled by the abort function
                            conversion.element.classList.add('error');
                            const errorMsg = document.createElement('div');
                            errorMsg.className = 'multi-progress-error';
                            errorMsg.textContent = status.error;
                            conversion.element.appendChild(errorMsg);
                            
                            // Clean up after delay
                            setTimeout(() => {
                                this.activeConversions.delete(conversionId);
                                conversion.element.remove();
                                
                                // Check if we need to show empty state
                                if (this.activeConversions.size === 0) {
                                    this.showEmptyStateMessage();
                                }
                            }, 10000);
                        } else if (!status.error) {
                            // Success - add download link
                            conversion.element.classList.add('complete');
                            const downloadLink = document.createElement('a');
                            downloadLink.className = 'multi-progress-download';
                            downloadLink.href = status.outputPath;
                            downloadLink.textContent = 'Download';
                            downloadLink.target = '_blank';
                            conversion.element.appendChild(downloadLink);
                            
                            // Trigger completion callback
                            if (this.onConversionComplete) {
                                this.onConversionComplete();
                            }
                            
                            // Clean up after delay
                            setTimeout(() => {
                                this.activeConversions.delete(conversionId);
                                conversion.element.remove();
                                
                                // Check if we need to show empty state
                                if (this.activeConversions.size === 0) {
                                    this.showEmptyStateMessage();
                                }
                            }, 10000);
                        }
                    }
                }
            } catch (error) {
                console.error(`Error updating progress for ${conversionId}:`, error);
            }
        }
    }
    
    /**
     * Abort an active conversion
     * @param {String} conversionId - ID of the conversion to abort
     */
    async abortConversion(conversionId) {
        const conversion = this.activeConversions.get(conversionId);
        if (!conversion) return;
        
        try {
            const response = await apiService.abortConversion(conversionId);
            if (response.success) {
                // Mark this conversion as already aborted to prevent duplicate messages
                conversion.aborted = true;
                conversion.element.classList.add('aborted');
                const abortMsg = document.createElement('div');
                abortMsg.className = 'multi-progress-error';
                abortMsg.textContent = 'Conversion aborted';
                conversion.element.appendChild(abortMsg);
                
                // Clean up after delay
                setTimeout(() => {
                    this.activeConversions.delete(conversionId);
                    conversion.element.remove();
                    
                    if (this.activeConversions.size === 0) {
                        this.showEmptyStateMessage();
                    }
                }, 5000);
            }
        } catch (error) {
            console.error('Error aborting conversion:', error);
            showMessage(this.messageContainer, `Failed to abort conversion: ${error.message}`, 'error');
        }
    }
}

/**
 * Video List Component - Manages the video list display and interaction
 */
export class VideoListComponent {
    /**
     * Initialize the video list component
     * @param {Object} options - Configuration options
     * @param {HTMLElement} options.container - Container element for the video list
     * @param {Function} options.onSelectVideo - Callback when a video is selected
     */
    constructor(options) {
        this.container = options.container;
        this.onSelectVideo = options.onSelectVideo;
        this.videoList = [];
        this.selectedVideos = new Map(); // Changed to Map for multi-selection
    }

    /**
     * Display videos in the list container
     * @param {Array} videos - Array of video objects from Google Drive
     */
    displayVideos(videos) {
        this.videoList = videos;
        this.container.innerHTML = '';
        this.selectedVideos.clear(); // Clear selection when loading new videos

        if (!videos || videos.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.textContent = 'No videos found in this folder.';
            this.container.appendChild(emptyMessage);
            return;
        }

        // Add multi-selection controls
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'selection-controls';
        controlsDiv.innerHTML = `
            <button id="select-all-btn" class="btn small">Select All</button>
            <button id="deselect-all-btn" class="btn small" disabled>Deselect All</button>
            <div class="selection-counter">0 videos selected</div>
        `;
        this.container.appendChild(controlsDiv);

        // Add event listeners to selection control buttons
        const selectAllBtn = controlsDiv.querySelector('#select-all-btn');
        const deselectAllBtn = controlsDiv.querySelector('#deselect-all-btn');
        
        selectAllBtn.addEventListener('click', () => this.selectAllVideos());
        deselectAllBtn.addEventListener('click', () => this.deselectAllVideos());
        
        // Store reference to selection counter for later updates
        this.selectionCounter = controlsDiv.querySelector('.selection-counter');

        const table = document.createElement('table');
        table.className = 'video-table';
        
        // Create table header with date column
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th class="video-select"><input type="checkbox" id="header-checkbox"></th>
                <th class="video-name">Name</th>
                <th class="video-size">Size</th>
                <th class="video-type">Type</th>
                <th class="video-date">Modified Date</th>
            </tr>
        `;
        
        // Add event listener to header checkbox for select/deselect all
        const headerCheckbox = thead.querySelector('#header-checkbox');
        headerCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.selectAllVideos();
            } else {
                this.deselectAllVideos();
            }
        });
        
        table.appendChild(thead);
        
        // Create table body
        const tbody = document.createElement('tbody');
        videos.forEach(video => {
            const row = document.createElement('tr');
            row.dataset.id = video.id;
            
            // Format the date if available
            let formattedDate = 'Unknown';
            if (video.modifiedTime) {
                const date = new Date(video.modifiedTime);
                formattedDate = date.toLocaleDateString() + ' ' + 
                               date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            
            row.innerHTML = `
                <td class="video-select">
                    <input type="checkbox" class="video-checkbox" data-id="${video.id}">
                </td>
                <td class="video-name">${video.name}</td>
                <td class="video-size">${formatBytes(video.size)}</td>
                <td class="video-type">${video.mimeType.split('/')[1]}</td>
                <td class="video-date">${formattedDate}</td>
            `;
            
            // Add event listener to checkbox for individual selection
            const checkbox = row.querySelector('.video-checkbox');
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.addToSelection(video, row);
                } else {
                    this.removeFromSelection(video.id, row);
                }
            });
            
            // Add event listener for clicking on row
            row.addEventListener('click', (e) => {
                // Ignore if the checkbox was clicked directly
                if (e.target.type === 'checkbox') return;
                
                const checkbox = row.querySelector('.video-checkbox');
                checkbox.checked = !checkbox.checked;
                
                if (checkbox.checked) {
                    this.addToSelection(video, row);
                } else {
                    this.removeFromSelection(video.id, row);
                }
            });
            
            tbody.appendChild(row);
        });
        
        table.appendChild(tbody);
        this.container.appendChild(table);
    }

    /**
     * Add a video to the selection
     * @param {Object} video - Video object to add
     * @param {HTMLElement} row - The table row element
     */
    addToSelection(video, row) {
        this.selectedVideos.set(video.id, video);
        row.classList.add('selected');
        this.updateSelectionCounters();
        this.updateSelectedFilesList();
        
        // Call the onSelectVideo callback with all selected videos
        if (this.onSelectVideo) {
            this.onSelectVideo(video); // This will trigger the callback in App.js that calls updateSelectedVideos
        }
    }

    /**
     * Remove a video from the selection
     * @param {String} videoId - ID of the video to remove
     * @param {HTMLElement} row - The table row element
     */
    removeFromSelection(videoId, row) {
        this.selectedVideos.delete(videoId);
        row.classList.remove('selected');
        this.updateSelectionCounters();
        this.updateSelectedFilesList();
        
        // Call the onSelectVideo callback with the first remaining selected video or null
        if (this.onSelectVideo) {
            const nextVideo = this.selectedVideos.size > 0 ? 
                [...this.selectedVideos.values()][0] : null;
            this.onSelectVideo(nextVideo); // This will trigger the callback in App.js that calls updateSelectedVideos
        }
    }

    /**
     * Select all videos in the list
     */
    selectAllVideos() {
        // Update all checkboxes
        const checkboxes = this.container.querySelectorAll('.video-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
            const row = checkbox.closest('tr');
            const videoId = checkbox.dataset.id;
            const video = this.videoList.find(v => v.id === videoId);
            if (video) {
                this.selectedVideos.set(videoId, video);
                row.classList.add('selected');
            }
        });
        
        // Update header checkbox
        const headerCheckbox = this.container.querySelector('#header-checkbox');
        if (headerCheckbox) {
            headerCheckbox.checked = true;
        }
        
        this.updateSelectionCounters();
        this.updateSelectedFilesList();
        
        // Call the onSelectVideo callback with all selected videos
        if (this.onSelectVideo && this.selectedVideos.size > 0) {
            this.onSelectVideo([...this.selectedVideos.values()][0]); // This will trigger the callback in App.js
        }
    }

    /**
     * Deselect all videos
     */
    deselectAllVideos() {
        // Update all checkboxes
        const checkboxes = this.container.querySelectorAll('.video-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
            const row = checkbox.closest('tr');
            row.classList.remove('selected');
        });
        
        // Update header checkbox
        const headerCheckbox = this.container.querySelector('#header-checkbox');
        if (headerCheckbox) {
            headerCheckbox.checked = false;
        }
        
        this.selectedVideos.clear();
        this.updateSelectionCounters();
        this.updateSelectedFilesList();
        
        // Call the onSelectVideo callback with null
        if (this.onSelectVideo) {
            this.onSelectVideo(null);
        }
    }

    /**
     * Update selection counters and button states
     */
    updateSelectionCounters() {
        const count = this.selectedVideos.size;
        
        // Update the selection counter
        if (this.selectionCounter) {
            this.selectionCounter.textContent = `${count} video${count !== 1 ? 's' : ''} selected`;
        }
        
        // Update selected count in the selected files area
        const selectedCount = this.container.querySelector('#selected-count');
        if (selectedCount) {
            selectedCount.textContent = `(${count})`;
        }
        
        // Update the deselect all button state
        const deselectAllBtn = this.container.querySelector('#deselect-all-btn');
        if (deselectAllBtn) {
            deselectAllBtn.disabled = count === 0;
        }
        
        // Update visibility of selected files area
        if (this.selectedFilesArea) {
            this.selectedFilesArea.classList.toggle('hidden', count === 0);
        }
    }

    /**
     * Update the list of selected files
     */
    updateSelectedFilesList() {
        const selectedFilesList = this.container.querySelector('#selectedFilesList');
        if (!selectedFilesList) return;
        
        selectedFilesList.innerHTML = '';
        
        for (const video of this.selectedVideos.values()) {
            const item = document.createElement('div');
            item.className = 'selected-file-item';
            item.innerHTML = `
                <span class="selected-file-name">${video.name}</span>
                <button class="remove-selected" data-id="${video.id}">Remove</button>
            `;
            
            // Add click handler for the remove button
            const removeBtn = item.querySelector('.remove-selected');
            removeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Find the corresponding checkbox and uncheck it
                const checkbox = this.container.querySelector(`.video-checkbox[data-id="${video.id}"]`);
                if (checkbox) {
                    checkbox.checked = false;
                    const row = checkbox.closest('tr');
                    this.removeFromSelection(video.id, row);
                }
            });
            
            selectedFilesList.appendChild(item);
        }
    }

    /**
     * Get all selected videos
     * @returns {Array} - Array of selected videos
     */
    getSelectedVideos() {
        return [...this.selectedVideos.values()];
    }

    /**
     * Get the first selected video or null if nothing selected
     * @returns {Object|null} - First selected video or null
     */
    getSelectedVideo() {
        return this.selectedVideos.size > 0 ? 
            [...this.selectedVideos.values()][0] : null;
    }

    /**
     * Clear all selections
     */
    clearSelection() {
        this.deselectAllVideos();
    }
}

/**
 * Conversion Form Component - Handles the conversion form display and submission
 */
export class ConversionFormComponent {
    /**
     * Initialize the conversion form component
     * @param {Object} options - Configuration options
     * @param {HTMLElement} options.container - Container element for the form
     * @param {HTMLElement} options.messageContainer - Container for status messages
     * @param {Function} options.onConversionComplete - Callback when conversion completes
     * @param {ActiveConversionsComponent} options.activeConversionsComponent - Reference to active conversions component
     */
    constructor(options) {
        this.container = options.container;
        this.messageContainer = options.messageContainer;
        this.onConversionComplete = options.onConversionComplete;
        this.activeConversionsComponent = options.activeConversionsComponent;
        this.currentVideo = null;
        this.selectedVideos = new Map(); // Track all selected videos
        
        // Create the form element
        this.createForm();
    }

    /**
     * Create the conversion form
     */
    createForm() {
        // Create form elements
        const form = document.createElement('form');
        form.className = 'conversion-form';
        form.innerHTML = `
            <div class="form-group">
                <label for="target-format">Target Format:</label>
                <select id="target-format" class="form-control">
                    <option value="mov">MOV</option>
                    <option value="mp4">MP4</option>
                    <option value="avi">AVI</option>
                </select>
            </div>
            <div class="form-options">
                <label class="checkbox-container">
                    <input type="checkbox" id="reverse-video">
                    <span class="checkmark"></span>
                    Reverse Video
                </label>
                <label class="checkbox-container">
                    <input type="checkbox" id="remove-sound" checked>
                    <span class="checkmark"></span>
                    Remove Sound
                </label>
            </div>
            <div class="form-actions">
                <button type="submit" id="convert-button" disabled class="btn primary">Convert Video</button>
            </div>
        `;

        // Add event listeners
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitConversion();
        });

        this.container.appendChild(form);
    }

    /**
     * Set the current video for conversion
     * @param {Object} video - Video object to convert
     */
    setVideo(video) {
        this.currentVideo = video;
        
        // Clear previous selected videos when selecting a new primary video
        if (video === null) {
            this.selectedVideos.clear();
        } else {
            // Add to selected videos map
            this.selectedVideos.set(video.id, video);
        }
        
        const convertButton = this.container.querySelector('#convert-button');
        
        // Update button text based on number of selected videos
        if (this.selectedVideos.size > 1) {
            convertButton.textContent = `Convert ${this.selectedVideos.size} Videos`;
        } else {
            convertButton.textContent = 'Convert Video';
        }
        
        // Enable or disable the convert button based on whether a video is selected
        convertButton.disabled = !video;
    }
    
    /**
     * Update the selected videos from VideoListComponent
     * @param {Array} videos - Array of selected video objects
     */
    updateSelectedVideos(videos) {
        this.selectedVideos.clear();
        
        if (videos && videos.length > 0) {
            // Add all videos to the map
            videos.forEach(video => {
                this.selectedVideos.set(video.id, video);
            });
            
            // Update the primary video (used for form validation)
            this.currentVideo = videos[0];
        } else {
            this.currentVideo = null;
        }
        
        const convertButton = this.container.querySelector('#convert-button');
        
        // Update button text based on number of selected videos
        if (this.selectedVideos.size > 1) {
            convertButton.textContent = `Convert ${this.selectedVideos.size} Videos`;
        } else {
            convertButton.textContent = 'Convert Video';
        }
        
        // Enable or disable the convert button
        convertButton.disabled = this.selectedVideos.size === 0;
    }

    /**
     * Submit the conversion request
     */
    async submitConversion() {
        if (this.selectedVideos.size === 0) {
            showMessage(this.messageContainer, 'Please select at least one video first.', 'error');
            return;
        }
        
        const targetFormat = this.container.querySelector('#target-format').value;
        const reverseVideo = this.container.querySelector('#reverse-video').checked;
        const removeSound = this.container.querySelector('#remove-sound').checked;
        
        // Get and disable the convert button to prevent multiple submissions
        const convertButton = this.container.querySelector('#convert-button');
        const originalButtonText = convertButton.textContent;
        
        // Add immediate visual feedback - pulsing effect when button is clicked
        convertButton.classList.add('button-pulse');
        convertButton.textContent = 'Processing...';
        convertButton.disabled = true;
        
        // Show loading message immediately
        const videoCount = this.selectedVideos.size;
        showMessage(
            this.messageContainer, 
            `Starting conversion of ${videoCount} video${videoCount !== 1 ? 's' : ''}...`, 
            'info'
        );
        
        // Prepare for batch conversion
        let allStarted = true;
        let conversionCount = 0;
        
        // Convert each selected video
        for (const video of this.selectedVideos.values()) {
            const conversionData = {
                fileId: video.id,
                fileName: video.name,
                mimeType: video.mimeType,
                targetFormat: targetFormat,
                reverseVideo: reverseVideo,
                removeSound: removeSound
            };
            
            try {
                // Send conversion request
                const response = await apiService.convertFromDrive(conversionData);
                
                if (response.success) {
                    // No need to track conversion progress here
                    // The ActiveConversionsComponent will handle this when loadActiveConversions is called
                    conversionCount++;
                } else {
                    showMessage(
                        this.messageContainer, 
                        `Conversion failed for ${video.name}: ${response.error || 'Unknown error'}`, 
                        'error'
                    );
                    allStarted = false;
                }
            } catch (error) {
                showMessage(
                    this.messageContainer, 
                    `Error converting ${video.name}: ${error.message}`, 
                    'error'
                );
                console.error('Conversion error:', error);
                allStarted = false;
            }
        }
        
        // Show success message after starting all conversions
        if (allStarted && conversionCount > 0) {
            showMessage(
                this.messageContainer,
                `Successfully started conversion${conversionCount > 1 ? 's' : ''}. See active conversions section for progress.`,
                'success'
            );
        } else if (conversionCount > 0) {
            showMessage(
                this.messageContainer,
                `Started ${conversionCount} conversion${conversionCount > 1 ? 's' : ''}, but some failed. See active conversions for progress.`,
                'warning'
            );
        }
        
        setTimeout(() => {
            convertButton.classList.remove('button-pulse');
            convertButton.textContent = originalButtonText;
            convertButton.disabled = false;
        }, 3000);
        
        // If callback provided, call it
        if (this.onConversionComplete) {
            this.onConversionComplete();
        }
    }
}

/**
 * File List Component - Manages the converted files list
 */
export class FileListComponent {
    /**
     * Initialize the file list component
     * @param {Object} options - Configuration options
     * @param {HTMLElement} options.container - Container element for the list
     * @param {HTMLElement} options.messageContainer - Container for status messages
     */
    constructor(options) {
        this.container = options.container;
        this.messageContainer = options.messageContainer;
        this.fileList = [];
    }

    /**
     * Load and display converted files
     */
    async loadFiles() {
        try {
            const files = await apiService.listFiles();
            this.fileList = files;
            this.displayFiles();
        } catch (error) {
            console.error('Error loading files:', error);
            showMessage(this.messageContainer, `Failed to load files: ${error.message}`, 'error');
        }
    }

    /**
     * Display files in the list container
     */
    displayFiles() {
        this.container.innerHTML = '';
        
        if (!this.fileList || this.fileList.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.textContent = 'No converted files found.';
            this.container.appendChild(emptyMessage);
            return;
        }
        
        const table = document.createElement('table');
        table.className = 'file-table';
        
        // Create table header
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th class="file-name">Name</th>
                <th class="file-size">Size</th>
                <th class="file-date">Date</th>
                <th class="file-actions">Actions</th>
            </tr>
        `;
        table.appendChild(thead);
        
        // Create table body
        const tbody = document.createElement('tbody');
        this.fileList.forEach(file => {
            const row = document.createElement('tr');
            // Format the date
            const date = new Date(file.modTime);
            const formattedDate = date.toLocaleDateString() + ' ' + 
                                 date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            row.innerHTML = `
                <td class="file-name">${file.name}</td>
                <td class="file-size">${formatBytes(file.size)}</td>
                <td class="file-date">${formattedDate}</td>
                <td class="file-actions">
                    <a href="${file.url}" class="btn small" download title="Download file">↓</a>
                    <button class="btn small delete" title="Delete file">×</button>
                </td>
            `;
            
            // Add delete button event listener
            const deleteButton = row.querySelector('button.delete');
            deleteButton.addEventListener('click', () => this.deleteFile(file.name));
            
            tbody.appendChild(row);
        });
        
        table.appendChild(tbody);
        this.container.appendChild(table);
    }

    /**
     * Delete a converted file
     * @param {String} fileName - Name of the file to delete
     */
    async deleteFile(fileName) {
        if (!confirm(`Are you sure you want to delete "${fileName}"?`)) {
            return;
        }
        
        try {
            const response = await apiService.deleteFile(fileName);
            if (response.success) {
                showMessage(this.messageContainer, `File "${fileName}" deleted successfully.`, 'success');
                await this.loadFiles(); // Refresh file list
            } else {
                showMessage(this.messageContainer, `Failed to delete file: ${response.error || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            console.error('Error deleting file:', error);
            showMessage(this.messageContainer, `Error deleting file: ${error.message}`, 'error');
        }
    }
}