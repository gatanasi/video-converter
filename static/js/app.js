/**
 * Google Drive Video Converter - Main Application
 * 
 * This is the main entry point for the application that coordinates all components.
 */
import configManager from './config/config-manager.js';
import apiService from './api/api-service.js';
import { VideoListComponent, ConversionFormComponent, FileListComponent, ActiveConversionsComponent } from './components/ui-components.js';
import { showMessage, clearMessages } from './utils/utils.js';

class App {
    /**
     * Initialize the application
     */
    constructor() {
        // DOM Elements
        this.folderIdInput = document.getElementById('folder-id');
        this.loadVideosBtn = document.getElementById('load-videos-btn');
        this.messageArea = document.getElementById('message-area');
        this.videoListContainer = document.getElementById('video-list');
        this.conversionFormContainer = document.getElementById('conversion-form');
        this.fileListContainer = document.getElementById('file-list');
        this.activeConversionsContainer = document.getElementById('active-conversions');
        this.tabButtons = document.querySelectorAll('.tab-button');
        this.tabPanels = document.querySelectorAll('.tab-panel');
        
        // Initialize components
        this.initComponents();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Load saved configuration
        this.loadConfig();
        
        // Initial UI setup
        this.activateTab('convert'); // Default tab
    }

    /**
     * Initialize application components
     */
    initComponents() {
        // Active conversions component - Visible across all tabs
        this.activeConversionsComponent = new ActiveConversionsComponent({
            container: this.activeConversionsContainer,
            messageContainer: this.messageArea,
            onConversionComplete: () => this.fileListComponent.loadFiles()
        });
        
        // Video list component
        this.videoListComponent = new VideoListComponent({
            container: this.videoListContainer,
            onSelectVideo: (video) => {
                // Get all selected videos and pass to conversion component
                const allSelectedVideos = this.videoListComponent.getSelectedVideos();
                this.conversionFormComponent.updateSelectedVideos(allSelectedVideos);
            }
        });
        
        // Conversion form component
        this.conversionFormComponent = new ConversionFormComponent({
            container: this.conversionFormContainer,
            messageContainer: this.messageArea,
            onConversionComplete: () => {
                this.fileListComponent.loadFiles();
                this.activeConversionsComponent.loadActiveConversions();
            },
            activeConversionsComponent: this.activeConversionsComponent
        });
        
        // File list component
        this.fileListComponent = new FileListComponent({
            container: this.fileListContainer,
            messageContainer: this.messageArea
        });
    }

    /**
     * Set up event listeners for UI elements
     */
    setupEventListeners() {
        // Load videos button
        this.loadVideosBtn.addEventListener('click', () => this.loadVideosFromDrive());
        
        // Folder ID input - Enter key
        this.folderIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.loadVideosFromDrive();
            }
        });
        
        // Tab navigation
        this.tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.dataset.tab;
                this.activateTab(tabId);
            });
        });
    }

    /**
     * Load configuration from storage and fetch server config
     */
    async loadConfig() {
        try {
            // Load local config
            const config = configManager.loadConfig();
            if (config.googleDriveFolderId) {
                this.folderIdInput.value = config.googleDriveFolderId;
            }
            
            // Load server config
            const serverConfig = await apiService.getServerConfig();
            if (serverConfig.defaultDriveFolderId && !this.folderIdInput.value) {
                this.folderIdInput.value = serverConfig.defaultDriveFolderId;
            }
            
            // Load files for the files tab
            this.fileListComponent.loadFiles();
        } catch (error) {
            console.error('Error loading configuration:', error);
        }
    }

    /**
     * Load videos from Google Drive based on folder ID
     */
    async loadVideosFromDrive() {
        const folderId = configManager.extractFolderId(this.folderIdInput.value);
        
        if (!folderId) {
            showMessage(this.messageArea, 'Please enter a valid Google Drive folder ID or URL.', 'error');
            return;
        }
        
        // Save folder ID to config
        configManager.set('googleDriveFolderId', folderId);
        
        // Show loading message
        showMessage(this.messageArea, 'Loading videos from Google Drive...', 'info');
        
        try {
            // Fetch videos from Google Drive
            const videos = await apiService.listVideos(folderId);
            
            // Display videos
            this.videoListComponent.displayVideos(videos);
            clearMessages(this.messageArea);
        } catch (error) {
            console.error('Error loading videos:', error);
            showMessage(this.messageArea, `Failed to load videos: ${error.message}`, 'error');
        }
    }

    /**
     * Switch between tabs
     * @param {String} tabId - ID of the tab to activate
     */
    activateTab(tabId) {
        // Update tab buttons
        this.tabButtons.forEach(button => {
            if (button.dataset.tab === tabId) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
        
        // Update tab panels
        this.tabPanels.forEach(panel => {
            if (panel.id === `${tabId}-panel`) {
                panel.classList.remove('hidden');
                
                // Special handling for files tab
                if (tabId === 'files') {
                    this.fileListComponent.loadFiles();
                }
            } else {
                panel.classList.add('hidden');
            }
        });
    }
}

// Initialize the application when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
});