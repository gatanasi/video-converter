/**
 * Google Drive Video Converter - Main Application Entry Point
 */
import configManager from './config/config-manager.js';
import apiService from './api/api-service.js';
import { VideoListComponent, ConversionFormComponent, FileListComponent, ActiveConversionsComponent } from './components/ui-components.js';
import { showMessage, clearMessages } from './utils/utils.js';

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

        // Conversion form component (for 'convert' tab)
        this.conversionFormComponent = new ConversionFormComponent({
            container: this.conversionFormContainer,
            messageContainer: this.messageArea,
            onConversionComplete: () => {
                // When conversions *start*, refresh the active list immediately
                this.activeConversionsComponent.loadActiveConversions();
                // Optionally clear video selection after starting conversion
                // this.videoListComponent.deselectAllVideos();
            }
        });

        // Video list component (for 'convert' tab)
        this.videoListComponent = new VideoListComponent({
            container: this.videoListContainer,
            // Pass selected videos array to the conversion form
            onSelectVideo: (selectedVideos) => {
                this.conversionFormComponent.updateSelectedVideos(selectedVideos);
            }
        });
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