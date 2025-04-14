/**
 * Google Drive Video Converter - Main Application Entry Point
 */
import configManager from './config/config-manager.js';
import apiService from './api/api-service.js';
import { VideoListComponent, ConversionFormComponent, FileListComponent, ActiveConversionsComponent } from './components/ui-components.js';
import { showMessage, clearMessages } from './utils/utils.js';
import { formatBytes } from './utils/utils.js'; // Import formatBytes

class App {
    constructor() {
        // DOM Element References
        this.folderIdInput = document.getElementById('folder-id');
        this.loadVideosBtn = document.getElementById('load-videos-btn');
        this.messageArea = document.getElementById('message-area');
        this.videoListContainer = document.getElementById('video-list');
        this.conversionFormContainer = document.getElementById('conversion-form');
        this.fileListContainer = document.getElementById('file-list');
        this.activeConversionsContainer = document.getElementById('active-conversions');
        this.tabButtons = document.querySelectorAll('.tab-button');
        this.tabPanels = document.querySelectorAll('.tab-panel');

        // Upload elements
        this.fileUploadInput = document.getElementById('file-upload');
        this.uploadConvertBtn = document.getElementById('upload-convert-btn');
        this.uploadFileInfo = document.getElementById('upload-file-info');
        this.uploadFileName = document.getElementById('upload-file-name');
        this.uploadFileSize = document.getElementById('upload-file-size');

        // Drive conversion button (needs to be added back, maybe near video list?)
        // Let's add a dedicated button for Drive conversions near the video list controls
        // We'll create it dynamically in setupEventListeners or initComponents

        this.selectedDriveVideos = []; // Keep track of selected Drive videos
        this.selectedUploadFile = null; // Keep track of the selected file for upload

        this.initComponents();
        this.setupEventListeners();
        this.loadConfigAndInitialData();
        this.activateTab('convert'); // Start on the convert tab
    }

    initComponents() {
        // Active conversions component (visible across tabs)
        this.activeConversionsComponent = new ActiveConversionsComponent({
            container: this.activeConversionsContainer,
            messageContainer: this.messageArea,
            onConversionComplete: () => {
                // Refresh file list when a conversion finishes successfully
                if (this.currentTab === 'files') {
                    this.fileListComponent.loadFiles();
                }
            }
        });

        // File list component (for 'files' tab)
        this.fileListComponent = new FileListComponent({
            container: this.fileListContainer,
            messageContainer: this.messageArea
        });

        // Conversion form component (for 'convert' tab) - Now just displays options
        this.conversionFormComponent = new ConversionFormComponent({
            container: this.conversionFormContainer,
            messageContainer: this.messageArea,
            // onConversionComplete is handled by submit handlers below
        });

        // Video list component (for 'convert' tab)
        this.videoListComponent = new VideoListComponent({
            container: this.videoListContainer,
            // Pass selected videos array to the app
            onSelectVideo: (selectedVideos) => {
                this.selectedDriveVideos = selectedVideos;
                this.updateDriveConvertButtonState(); // Update the Drive convert button
            }
        });

        // Create Drive Convert Button dynamically
        this.driveConvertBtn = document.createElement('button');
        this.driveConvertBtn.id = 'drive-convert-btn';
        this.driveConvertBtn.className = 'btn primary';
        this.driveConvertBtn.textContent = 'Convert Selected Drive Videos';
        this.driveConvertBtn.disabled = true;
        // Insert it after the video list container (or adjust placement as needed)
        this.videoListContainer.parentNode.insertBefore(this.driveConvertBtn, this.videoListContainer.nextSibling);

    }

    setupEventListeners() {
        this.loadVideosBtn.addEventListener('click', () => this.loadVideosFromDrive());

        this.folderIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevent form submission if inside a form
                this.loadVideosFromDrive();
            }
        });

        this.tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.dataset.tab;
                this.activateTab(tabId);
            });
        });

        // Upload listeners
        this.fileUploadInput.addEventListener('change', (e) => this.handleFileSelection(e));
        this.uploadConvertBtn.addEventListener('click', () => this.submitUploadConversion());

        // Drive conversion listener
        this.driveConvertBtn.addEventListener('click', () => this.submitDriveConversion());
    }

    // Update Drive Convert Button based on selection
    updateDriveConvertButtonState() {
        const count = this.selectedDriveVideos.length;
        this.driveConvertBtn.disabled = count === 0;
        this.driveConvertBtn.textContent = count > 1 ? `Convert ${count} Selected Drive Videos` : 'Convert Selected Drive Video';
    }

    // Handle file selection for upload
    handleFileSelection(event) {
        const file = event.target.files[0];
        if (file) {
            this.selectedUploadFile = file;
            this.uploadFileName.textContent = file.name;
            this.uploadFileSize.textContent = formatBytes(file.size);
            this.uploadFileInfo.classList.remove('hidden');
            this.uploadConvertBtn.disabled = false;
        } else {
            this.selectedUploadFile = null;
            this.uploadFileInfo.classList.add('hidden');
            this.uploadConvertBtn.disabled = true;
        }
    }

    async loadConfigAndInitialData() {
        try {
            // Load local config (folder ID)
            const localConfig = configManager.loadConfig();
            if (localConfig.googleDriveFolderId) {
                this.folderIdInput.value = localConfig.googleDriveFolderId;
            }

            // Load server config (e.g., default folder ID)
            const serverConfig = await apiService.getServerConfig();
            // Use server default only if local config is empty and server provides one
            if (serverConfig.defaultDriveFolderId && !this.folderIdInput.value) {
                this.folderIdInput.value = serverConfig.defaultDriveFolderId;
                // Optionally save this default back to local config?
                // configManager.set('googleDriveFolderId', serverConfig.defaultDriveFolderId);
            }

            // Pre-load files for the files tab (will be displayed when tab is activated)
            // this.fileListComponent.loadFiles(); // Moved to activateTab for efficiency
        } catch (error) {
            console.error('Error loading configuration:', error);
            showMessage(this.messageArea, error.message || 'Failed to load configuration.', 'error');
        }
    }

    async loadVideosFromDrive() {
        const folderInputValue = this.folderIdInput.value;
        const folderId = configManager.extractFolderId(folderInputValue);

        if (!folderId) {
            showMessage(this.messageArea, 'Please enter a valid Google Drive folder ID or URL.', 'error');
            this.folderIdInput.focus(); // Focus input for correction
            return;
        }

        // Save the extracted ID back to config and potentially update input field
        if (folderId !== folderInputValue) {
             // Optionally update the input field to show just the ID?
             // this.folderIdInput.value = folderId;
        }
        configManager.set('googleDriveFolderId', folderId);

        // Show loading state
        this.loadVideosBtn.disabled = true;
        this.loadVideosBtn.textContent = 'Loading...';
        showMessage(this.messageArea, 'Loading videos from Google Drive...', 'info', 0); // Don't auto-hide

        try {
            const videos = await apiService.listVideos(folderId);
            this.videoListComponent.displayVideos(videos); // Display videos
            this.selectedDriveVideos = []; // Reset selection when loading new videos
            this.updateDriveConvertButtonState(); // Update button state
            clearMessages(this.messageArea); // Clear loading message on success
        } catch (error) {
            console.error('Error loading videos:', error);
            showMessage(this.messageArea, `Failed to load videos: ${error.message}`, 'error');
        } finally {
            // Restore button state
            this.loadVideosBtn.disabled = false;
            this.loadVideosBtn.textContent = 'Load Videos';
        }
    }

    // Renamed from submitConversion in ConversionFormComponent
    async submitDriveConversion() {
        if (this.selectedDriveVideos.length === 0) {
            showMessage(this.messageArea, 'Please select at least one video from Google Drive first.', 'error');
            return;
        }

        const options = this.conversionFormComponent.getConversionOptions();

        // Disable button and show processing state
        this.driveConvertBtn.disabled = true;
        this.driveConvertBtn.classList.add('button-pulse');
        const originalButtonText = this.driveConvertBtn.textContent;
        this.driveConvertBtn.textContent = 'Processing...';

        const videoCount = this.selectedDriveVideos.length;
        showMessage(
            this.messageArea,
            `Starting conversion of ${videoCount} video${videoCount !== 1 ? 's' : ''} from Drive...`,
            'info',
            0 // Don't auto-hide this initial message
        );

        let successCount = 0;
        let failCount = 0;
        const conversionPromises = this.selectedDriveVideos.map(video => {
            const conversionData = {
                fileId: video.id,
                fileName: video.name,
                mimeType: video.mimeType,
                targetFormat: options.targetFormat,
                reverseVideo: options.reverseVideo,
                removeSound: options.removeSound
            };
            return apiService.convertFromDrive(conversionData)
                .then(response => {
                    if (response.success) {
                        successCount++;
                    } else {
                        failCount++;
                        showMessage(
                            this.messageArea,
                            `Drive conversion failed for ${video.name}: ${response.error || 'Unknown error'}`,
                            'error'
                        );
                    }
                })
                .catch(error => {
                    failCount++;
                    showMessage(
                        this.messageArea,
                        `Error starting Drive conversion for ${video.name}: ${error.message}`,
                        'error'
                    );
                    console.error(`Drive conversion start error for ${video.name}:`, error);
                });
        });

        // Wait for all conversion requests to be sent
        await Promise.all(conversionPromises);

        // Restore button state
        this.driveConvertBtn.classList.remove('button-pulse');
        // Re-enable based on selection after completion
        this.updateDriveConvertButtonState();

        // Show summary message
        if (failCount === 0 && successCount > 0) {
            showMessage(
                this.messageArea,
                `Successfully started ${successCount} Drive conversion${successCount > 1 ? 's' : ''}. See progress above.`,
                'success'
            );
        } else if (successCount > 0) {
            showMessage(
                this.messageArea,
                `Started ${successCount} Drive conversion${successCount > 1 ? 's' : ''}, but ${failCount} failed to start. See progress/errors above.`,
                'warning'
            );
        } else {
            showMessage(
                this.messageArea,
                `Failed to start any Drive conversions. See errors above.`,
                'error'
            );
        }

        // Trigger active conversions refresh
        this.activeConversionsComponent.loadActiveConversions();

        // Optionally clear selection and scroll
        this.videoListComponent.deselectAllVideos();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // New method for handling upload conversion submission
    async submitUploadConversion() {
        if (!this.selectedUploadFile) {
            showMessage(this.messageArea, 'Please select a file to upload first.', 'error');
            return;
        }

        const options = this.conversionFormComponent.getConversionOptions();
        const file = this.selectedUploadFile;

        // Disable button and show processing state
        this.uploadConvertBtn.disabled = true;
        this.uploadConvertBtn.classList.add('button-pulse');
        this.uploadConvertBtn.textContent = 'Uploading...'; // Indicate upload phase

        showMessage(
            this.messageArea,
            `Uploading and starting conversion for ${file.name}...`,
            'info',
            0 // Don't auto-hide
        );

        try {
            const response = await apiService.uploadAndConvert(file, options);

            if (response.success) {
                showMessage(
                    this.messageArea,
                    `Successfully started conversion for ${file.name}. See progress above.`,
                    'success'
                );
                // Trigger active conversions refresh
                this.activeConversionsComponent.loadActiveConversions();
                // Clear file input after successful start
                this.fileUploadInput.value = ''; // Reset file input
                this.handleFileSelection({ target: { files: [] } }); // Update UI state
            } else {
                showMessage(
                    this.messageArea,
                    `Upload/conversion failed for ${file.name}: ${response.error || 'Unknown error'}`,
                    'error'
                );
            }
        } catch (error) {
            showMessage(
                this.messageArea,
                `Error starting upload/conversion for ${file.name}: ${error.message}`,
                'error'
            );
            console.error(`Upload/conversion start error for ${file.name}:`, error);
        } finally {
            // Restore button state
            this.uploadConvertBtn.classList.remove('button-pulse');
            this.uploadConvertBtn.textContent = 'Upload & Convert';
            // Button disable state is handled by handleFileSelection
            this.uploadConvertBtn.disabled = !this.selectedUploadFile;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    activateTab(tabId) {
        this.currentTab = tabId; // Store current tab

        this.tabButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.tab === tabId);
        });

        this.tabPanels.forEach(panel => {
            panel.classList.toggle('hidden', panel.id !== `${tabId}-panel`);
        });

        // Load data specific to the activated tab
        if (tabId === 'files') {
            this.fileListComponent.loadFiles();
        } else if (tabId === 'convert') {
            // Optionally reload videos if needed, or rely on initial load/button click
            // this.loadVideosFromDrive();
        }

        // Clear general messages when switching tabs?
        // clearMessages(this.messageArea);
    }
}

// Initialize the application once the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
});