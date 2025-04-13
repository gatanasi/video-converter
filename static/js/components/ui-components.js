/**
 * UI Components - Reusable UI components and elements for the application
 */
import { formatBytes, showMessage, clearMessages, createProgressItem } from '../utils/utils.js';
import apiService from '../api/api-service.js';

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
        this.selectedVideo = null;
    }

    /**
     * Display videos in the list container
     * @param {Array} videos - Array of video objects from Google Drive
     */
    displayVideos(videos) {
        this.videoList = videos;
        this.container.innerHTML = '';

        if (!videos || videos.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.textContent = 'No videos found in this folder.';
            this.container.appendChild(emptyMessage);
            return;
        }

        const table = document.createElement('table');
        table.className = 'video-table';
        
        // Create table header
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th class="video-name">Name</th>
                <th class="video-size">Size</th>
                <th class="video-type">Type</th>
            </tr>
        `;
        table.appendChild(thead);
        
        // Create table body
        const tbody = document.createElement('tbody');
        videos.forEach(video => {
            const row = document.createElement('tr');
            row.dataset.id = video.id;
            row.innerHTML = `
                <td class="video-name">${video.name}</td>
                <td class="video-size">${formatBytes(video.size)}</td>
                <td class="video-type">${video.mimeType.split('/')[1]}</td>
            `;
            
            row.addEventListener('click', () => {
                this.selectVideo(video, row);
            });
            
            tbody.appendChild(row);
        });
        
        table.appendChild(tbody);
        this.container.appendChild(table);
    }

    /**
     * Handle video selection
     * @param {Object} video - Selected video object
     * @param {HTMLElement} row - Selected table row
     */
    selectVideo(video, row) {
        // Clear previous selection
        const selectedRows = this.container.querySelectorAll('tr.selected');
        selectedRows.forEach(r => r.classList.remove('selected'));
        
        // Mark this row as selected
        row.classList.add('selected');
        
        // Store selected video and trigger callback
        this.selectedVideo = video;
        if (this.onSelectVideo) {
            this.onSelectVideo(video);
        }
    }

    /**
     * Clear selection
     */
    clearSelection() {
        const selectedRows = this.container.querySelectorAll('tr.selected');
        selectedRows.forEach(r => r.classList.remove('selected'));
        this.selectedVideo = null;
    }

    /**
     * Get selected video
     * @returns {Object|null} - Currently selected video or null
     */
    getSelectedVideo() {
        return this.selectedVideo;
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
     */
    constructor(options) {
        this.container = options.container;
        this.messageContainer = options.messageContainer;
        this.onConversionComplete = options.onConversionComplete;
        this.currentVideo = null;
        this.activeConversions = new Map(); // Track active conversions by ID
        this.progressInterval = null;

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
                <label for="selected-video">Selected Video:</label>
                <input type="text" id="selected-video" readonly class="form-control" placeholder="No video selected">
            </div>
            <div class="form-group">
                <label for="target-format">Target Format:</label>
                <select id="target-format" class="form-control">
                    <option value="mp4">MP4</option>
                    <option value="mov">MOV</option>
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
                    <input type="checkbox" id="remove-sound">
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

        // Set up progress tracking
        this.progressContainer = document.createElement('div');
        this.progressContainer.className = 'multi-progress hidden';
        this.container.appendChild(this.progressContainer);
    }

    /**
     * Set the current video for conversion
     * @param {Object} video - Video object to convert
     */
    setVideo(video) {
        this.currentVideo = video;
        const selectedVideoInput = this.container.querySelector('#selected-video');
        const convertButton = this.container.querySelector('#convert-button');
        
        if (video) {
            selectedVideoInput.value = video.name;
            convertButton.disabled = false;
        } else {
            selectedVideoInput.value = 'No video selected';
            convertButton.disabled = true;
        }
    }

    /**
     * Submit the conversion request
     */
    async submitConversion() {
        if (!this.currentVideo) {
            showMessage(this.messageContainer, 'Please select a video first.', 'error');
            return;
        }
        
        const targetFormat = this.container.querySelector('#target-format').value;
        const reverseVideo = this.container.querySelector('#reverse-video').checked;
        const removeSound = this.container.querySelector('#remove-sound').checked;
        
        const conversionData = {
            fileId: this.currentVideo.id,
            fileName: this.currentVideo.name,
            mimeType: this.currentVideo.mimeType,
            targetFormat: targetFormat,
            reverseVideo: reverseVideo,
            removeSound: removeSound
        };
        
        // Show loading message
        showMessage(this.messageContainer, 'Starting conversion...', 'info');
        
        try {
            // Send conversion request
            const response = await apiService.convertFromDrive(conversionData);
            
            if (response.success) {
                showMessage(
                    this.messageContainer, 
                    'Conversion started successfully! Tracking progress...', 
                    'success'
                );
                
                // Track conversion progress
                this.trackConversionProgress(
                    response.conversionId, 
                    this.currentVideo.name, 
                    targetFormat
                );
            } else {
                showMessage(
                    this.messageContainer, 
                    `Conversion failed: ${response.error || 'Unknown error'}`, 
                    'error'
                );
            }
        } catch (error) {
            showMessage(this.messageContainer, `Error: ${error.message}`, 'error');
            console.error('Conversion error:', error);
        }
    }

    /**
     * Track conversion progress
     * @param {String} conversionId - ID of the conversion to track
     * @param {String} fileName - Name of the file being converted
     * @param {String} format - Target format
     */
    trackConversionProgress(conversionId, fileName, format) {
        if (!this.progressInterval) {
            this.progressInterval = setInterval(() => this.updateAllProgressBars(), 2000);
        }
        
        // Show progress area if hidden
        this.progressContainer.classList.remove('hidden');
        
        // Create progress item and add to tracking
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
        
        this.progressContainer.appendChild(progressItem);
        
        // Add to active conversions
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
            clearInterval(this.progressInterval);
            this.progressInterval = null;
            this.progressContainer.classList.add('hidden');
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
                        if (status.error) {
                            // Show error
                            conversion.element.classList.add('error');
                            const errorMsg = document.createElement('div');
                            errorMsg.className = 'multi-progress-error';
                            errorMsg.textContent = status.error;
                            conversion.element.appendChild(errorMsg);
                            
                            // Clean up after delay
                            setTimeout(() => {
                                this.activeConversions.delete(conversionId);
                                conversion.element.remove();
                            }, 10000);
                        } else {
                            // Success - add download link
                            conversion.element.classList.add('complete');
                            const downloadLink = document.createElement('a');
                            downloadLink.className = 'multi-progress-download';
                            downloadLink.href = status.outputPath;
                            downloadLink.textContent = 'Download';
                            downloadLink.target = '_blank';
                            conversion.element.appendChild(downloadLink);
                            
                            // Add completion message
                            showMessage(
                                this.messageContainer, 
                                `${conversion.fileName} has been converted successfully!`,
                                'success'
                            );
                            
                            // Trigger completion callback
                            if (this.onConversionComplete) {
                                this.onConversionComplete();
                            }
                            
                            // Clean up after delay
                            setTimeout(() => {
                                this.activeConversions.delete(conversionId);
                                conversion.element.remove();
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
                conversion.element.classList.add('aborted');
                const abortMsg = document.createElement('div');
                abortMsg.className = 'multi-progress-error';
                abortMsg.textContent = 'Conversion aborted';
                conversion.element.appendChild(abortMsg);
                
                // Clean up after delay
                setTimeout(() => {
                    this.activeConversions.delete(conversionId);
                    conversion.element.remove();
                }, 5000);
            }
        } catch (error) {
            console.error('Error aborting conversion:', error);
            showMessage(this.messageContainer, `Failed to abort conversion: ${error.message}`, 'error');
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