import { ApiService } from './api/api-service.js';
import configManager from './config/config-manager.js';
import { VideoListComponent, ConversionFormComponent, UploadComponent, ConversionProgressComponent } from './components/ui-components.js';
// Removed debounce import as it's no longer needed
import { showMessage, clearMessages } from './utils/utils.js';
import { StateManager } from './state/state-manager.js';

const CONVERSION_POLLING_INTERVAL = 5000; // ms

class App {
    constructor() {
        this.configManager = configManager; // Use the imported instance directly
        // Pass empty string or let the default handle it in ApiService
        this.apiService = new ApiService(); 

        // Define initial state
        const initialState = {
            currentVideoSource: 'upload', // 'drive' or 'upload'
            videosList: [], // Drive videos list
            selectedDriveVideoIds: [], // IDs of selected Drive videos
            selectedUploadFile: null,
            activeConversions: [], // { id, fileName, format, progress, complete, error, downloadUrl, aborted }
            isLoadingDriveVideos: false,
            isLoadingUpload: false,
            isStartingConversion: false,
            abortingConversionId: null, // Added for abort loading state
            errorMessage: null,
            infoMessage: null,
            successMessage: null,
            availableFormats: [],
            selectedFormat: '',
            defaultDriveFolderId: null, // Added default folder ID
            pollingFailureCount: 0, // Added for polling failure warning
        };
        this.stateManager = new StateManager(initialState);

        // --- Component Initialization ---
        // Pass selectors and callbacks to notify App of user actions
        this.videoListComponent = new VideoListComponent(
            '#drive-video-list', // Selector for the container
            this.handleVideoSelection.bind(this) // Callback for selection changes
        );
        this.conversionFormComponent = new ConversionFormComponent(
            '#conversion-form', // Selector for the Drive conversion options container
            this.handleFormatChange.bind(this) // Callback for format dropdown change
        );
        this.uploadComponent = new UploadComponent(
            '#upload-source-section', // Selector for the entire upload section
            this.handleFileSelect.bind(this), // Callback for file input change
            this.handleUploadSubmit.bind(this), // Callback for upload form submission
            this.handleFormatChange.bind(this) // Callback for format dropdown change
        );
        this.conversionProgressComponent = new ConversionProgressComponent(
            '#conversion-progress-list', // Selector for the progress list container
            this.handleAbortConversion.bind(this), // Callback for abort button click
            this.handleDownloadReady.bind(this) // Callback when a download link is ready
        );

        // --- DOM Element References ---
        this.driveSourceButton = document.getElementById('drive-source-btn');
        this.uploadSourceButton = document.getElementById('upload-source-btn');
        this.driveSourceSection = document.getElementById('drive-source-section');
        this.uploadSourceSection = document.getElementById('upload-source-section');
        this.messageArea = document.getElementById('message-area');
        this.loadingIndicator = document.getElementById('loading-indicator');
        this.driveConvertButton = document.getElementById('drive-convert-button'); // Specific button for Drive
        // Tab buttons
        this.convertTabButton = document.querySelector('button[data-tab="convert"]');
        this.convertPanel = document.getElementById('convert-panel');

        this.conversionPollingTimer = null;

        console.log("App constructed");
    }

    async initialize() {
        console.log("App initializing...");
        this.setupEventListeners();
        this.setupStateSubscriptions(); // Setup listeners for state changes

        // Fetch config and formats concurrently
        this.stateManager.setState({ isLoading: true }); // Use a general loading state
        try {
            const [config, formats] = await Promise.all([
                this.apiService.fetchConfig(),
                this.apiService.fetchAvailableFormats()
            ]);

            console.log("Fetched config:", config);
            const initialFormat = formats.length > 0 ? formats[0] : '';
            this.stateManager.setState({
                availableFormats: formats,
                selectedFormat: initialFormat,
                defaultDriveFolderId: config.defaultDriveFolderId || null
            });

            if (!config.defaultDriveFolderId) {
                 console.warn("No default Google Drive Folder ID configured on the backend.");
                 if (this.stateManager.getState().currentVideoSource === 'drive') {
                     this.stateManager.setState({ infoMessage: "No default Google Drive folder is configured. Please switch to Upload or configure the backend." });
                 }
            }

        } catch (error) {
            console.error("Failed during initial data fetch:", error);
            this.stateManager.setState({ errorMessage: 'Failed to load initial configuration or formats. Please try refreshing.' });
        } finally {
             this.stateManager.setState({ isLoading: false });
        }


        // Initial UI setup based on default state
        this.updateSourceView(this.stateManager.getState().currentVideoSource);
        this.updateActiveTab(this.getActiveTab());
        this.loadDataForCurrentSource();
        this.startConversionPolling(); // Start polling for active conversions

        console.log("App initialization complete.");
    }

    setupEventListeners() {
        console.log("Setting up event listeners...");
        this.driveSourceButton.addEventListener('click', () => this.handleSourceChange('drive'));
        this.uploadSourceButton.addEventListener('click', () => this.handleSourceChange('upload'));


        // Listener for the Drive conversion button (outside the component)
        if (this.driveConvertButton) {
            this.driveConvertButton.addEventListener('click', this.handleDriveConversionSubmit.bind(this));
        }

        // Tab switching listeners
        this.convertTabButton.addEventListener('click', () => this.setActiveTab('convert'));
    }

    // Centralized place to react to state changes
    setupStateSubscriptions() {
        console.log("Setting up state subscriptions...");

        // --- UI Visibility & Loading --- 
        this.stateManager.subscribe('currentVideoSourceChanged', this.updateSourceView.bind(this));
        this.stateManager.subscribe('isLoadingDriveVideosChanged', this.updateLoadingIndicator.bind(this));
        this.stateManager.subscribe('isLoadingUploadChanged', this.updateLoadingIndicator.bind(this));
        this.stateManager.subscribe('isStartingConversionChanged', this.updateLoadingIndicator.bind(this));
        this.stateManager.subscribe('abortingConversionIdChanged', (id) => { // Added subscription
             // Pass the aborting ID to the progress component for UI updates
             this.conversionProgressComponent.displayProgress(
                 this.stateManager.getState().activeConversions,
                 id // Pass the aborting ID
             );
        });


        // --- Data Loading & Display ---
        this.stateManager.subscribe('videosListChanged', (videos) => {
            this.videoListComponent.displayVideos(videos, this.stateManager.getState().currentVideoSource);
            // Ensure selection UI is updated after list redraws
            this.videoListComponent.updateSelection(this.stateManager.getState().selectedDriveVideoIds);
        });
        this.stateManager.subscribe('activeConversionsChanged', (conversions) => {
            // Pass aborting ID when conversions change as well
            this.conversionProgressComponent.displayProgress(
                conversions,
                this.stateManager.getState().abortingConversionId // Pass current aborting ID
            );
        });

        // --- Selections & Form State ---
        this.stateManager.subscribe('selectedDriveVideoIdsChanged', (selectedIds) => {
            this.videoListComponent.updateSelection(selectedIds);
            // App.js now directly controls the Drive convert button state
            if (this.driveConvertButton) {
                this.driveConvertButton.disabled = selectedIds.length === 0;
            }
        });
        this.stateManager.subscribe('selectedUploadFileChanged', (file) => {
            this.uploadComponent.updateUploadButton(!!file);
        });
        this.stateManager.subscribe('availableFormatsChanged', (formats) => {
            // Populate format dropdowns in both components
            this.conversionFormComponent.populateFormatOptions(formats);
            this.uploadComponent.populateFormatOptions(formats);
        });
        this.stateManager.subscribe('selectedFormatChanged', (format) => {
            // Keep format dropdowns synchronized if needed (optional)
            this.conversionFormComponent.setSelectedFormat(format);
            this.uploadComponent.setSelectedFormat(format);
        });

        // --- User Feedback ---
        this.stateManager.subscribe('errorMessageChanged', (message) => {
            if (message) showMessage(message, 'error', this.messageArea);
        });
        this.stateManager.subscribe('infoMessageChanged', (message) => {
            if (message) showMessage(message, 'info', this.messageArea);
        });
        this.stateManager.subscribe('successMessageChanged', (message) => {
            if (message) showMessage(message, 'success', this.messageArea);
        });
    }

    // --- Handlers for User Actions & Component Callbacks ---

    handleSourceChange(newSource) {
        console.log(`Handling source change to: ${newSource}`);
        if (newSource !== this.stateManager.getState().currentVideoSource) {
            this.stateManager.setState({
                currentVideoSource: newSource,
                selectedDriveVideoIds: [], // Reset Drive selection
                selectedUploadFile: null, // Reset Upload selection
                videosList: [], // Clear Drive video list
                errorMessage: null, // Clear errors
                infoMessage: null,
                successMessage: null
            });
            this.loadDataForCurrentSource(); // Load data for the new source
        }
    }

    /** Handles selection changes from VideoListComponent */
    handleVideoSelection(videoIdOrIds, isSelected) {
        const currentSelection = new Set(this.stateManager.getState().selectedDriveVideoIds);
        const idsToUpdate = Array.isArray(videoIdOrIds) ? videoIdOrIds : [videoIdOrIds];

        idsToUpdate.forEach(id => {
            if (isSelected) {
                currentSelection.add(id);
            } else {
                currentSelection.delete(id);
            }
        });

        this.stateManager.setState({ selectedDriveVideoIds: Array.from(currentSelection) });
    }

    /** Handles file selection from UploadComponent */
    handleFileSelect(file) {
        console.log(`Handling file select: ${file ? file.name : 'null'}`);
        this.stateManager.setState({ selectedUploadFile: file, errorMessage: null, successMessage: null }); // Clear messages on new selection
    }

    /** Handles format selection change from either component */
    handleFormatChange(newFormat) {
        console.log(`Handling format change: ${newFormat}`);
        this.stateManager.setState({ selectedFormat: newFormat });
    }

    /** Handles submission from the Drive conversion section */
    async handleDriveConversionSubmit() {
        console.log("Handling Drive conversion submit...");
        const { selectedDriveVideoIds, selectedFormat, videosList } = this.stateManager.getState(); // Get videosList
        const conversionOptions = this.conversionFormComponent.getConversionOptions(); // Get all options

        if (selectedDriveVideoIds.length === 0 || !selectedFormat) {
            this.stateManager.setState({ errorMessage: "Please select at least one video and a target format." });
            return;
        }

        // Consolidate state updates
        this.stateManager.setState({
            isStartingConversion: true,
            errorMessage: null,
            successMessage: null,
            infoMessage: null // Clear info messages too
        });

        let successCount = 0;
        let errorCount = 0;
        const totalRequests = selectedDriveVideoIds.length;
        const errorMessages = [];

        // Iterate over selected videos and send individual requests
        for (const videoId of selectedDriveVideoIds) {
            // Find the video details from the videosList
            const video = videosList.find(v => v.id === videoId);
            if (!video) {
                console.warn(`Video details not found for ID: ${videoId}. Skipping.`);
                errorCount++;
                errorMessages.push(`Details not found for a selected video.`);
                continue; // Skip if video details aren't available
            }

            try {
                // Use the updated ApiService method, passing individual details and options
                const result = await this.apiService.requestConversion(
                    videoId,
                    video.name, // Pass fileName
                    video.mimeType, // Pass mimeType
                    selectedFormat,
                    { // Pass options object
                        reverseVideo: conversionOptions.reverseVideo,
                        removeSound: conversionOptions.removeSound
                    }
                );
                console.log(`Conversion started for ${video.name}:`, result);
                successCount++;
            } catch (error) {
                console.error(`Drive conversion request failed for ${video.name}:`, error);
                errorCount++;
                // Use error.message which apiRequest now standardizes
                errorMessages.push(`Conversion failed for \"${video.name}\": ${error.message}`);
            }
        } // End loop

        // Update state after all requests are attempted
        const finalState = { isStartingConversion: false };
        if (successCount > 0) {
            finalState.successMessage = `${successCount} of ${totalRequests} conversion(s) started successfully.`;
            finalState.selectedDriveVideoIds = []; // Clear selection only if at least one succeeded
            this.fetchActiveConversions(); // Refresh progress list if any started
        }
        if (errorCount > 0) {
            // Combine error messages or show a general one
            finalState.errorMessage = `Failed to start ${errorCount} of ${totalRequests} conversion(s). ${errorMessages.slice(0, 2).join(' ')}`; // Show first few errors
        }

        this.stateManager.setState(finalState);
    }

    /** Handles submission from the UploadComponent form */
    async handleUploadSubmit() {
        console.log("Handling upload submit...");
        const { selectedUploadFile, selectedFormat } = this.stateManager.getState();
        const conversionOptions = this.uploadComponent.getConversionOptions(); // Get all options

        if (!selectedUploadFile || !selectedFormat) {
            this.stateManager.setState({ errorMessage: "Please select a file and a target format." });
            return;
        }

        // Consolidate state updates
        this.stateManager.setState({
            isLoadingUpload: true,
            errorMessage: null,
            successMessage: null,
            infoMessage: null
        });

        try {
            // Use the updated ApiService method, passing options
            const result = await this.apiService.uploadAndConvert(
                selectedUploadFile,
                selectedFormat,
                { // Pass options object
                    reverseVideo: conversionOptions.reverseVideo,
                    removeSound: conversionOptions.removeSound
                }
            );
            this.stateManager.setState({
                successMessage: result.message || "Upload and conversion started successfully!",
                selectedUploadFile: null // Clear selection on success
            });
            this.uploadComponent.resetForm(); // Reset the form in the component
            this.fetchActiveConversions(); // Immediately refresh progress list
        } catch (error) {
            console.error("Upload/Conversion failed:", error);
             // Use error.message which apiRequest now standardizes
            this.stateManager.setState({ errorMessage: `Upload failed: ${error.message}` });
        } finally {
            this.stateManager.setState({ isLoadingUpload: false });
        }
    }

    /** Handles abort request from ConversionProgressComponent */
    async handleAbortConversion(conversionId) {
        console.log(`Handling abort request for conversion: ${conversionId}`);
        // Optionally add a specific loading state for aborting
        // Clear messages before attempting
        this.stateManager.setState({
             errorMessage: null,
             infoMessage: null,
             successMessage: null,
             abortingConversionId: conversionId // Set aborting state
        });
        try {
            // Use the updated ApiService method
            await this.apiService.abortConversion(conversionId);
            // Don't set info message here, let the poller update the status visually
            // this.stateManager.setState({ infoMessage: "Abort request sent." });
            // The poller will eventually update the status to aborted
            this.fetchActiveConversions(); // Fetch immediately for faster UI update
        } catch (error) {
            console.error("Failed to send abort request:", error);
             // Use error.message which apiRequest now standardizes
            this.stateManager.setState({ errorMessage: `Failed to abort conversion: ${error.message}` });
        } finally {
             this.stateManager.setState({ abortingConversionId: null }); // Clear aborting state
        }
    }

    /** Handles notification that a download is ready (optional) */
    handleDownloadReady(conversion) {
        console.log(`Download ready for: ${conversion.fileName}`);
        // Could show a temporary success message or trigger another action
        this.stateManager.setState({ successMessage: `"${conversion.fileName}" is ready for download.` }); // Uncommented
    }

    // --- Data Loading Methods ---
    loadDataForCurrentSource() {
        const { currentVideoSource, defaultDriveFolderId } = this.stateManager.getState();
        console.log(`Loading data for source: ${currentVideoSource}`);
        if (currentVideoSource === 'drive') {
            // Only load if folder ID is available
            if (defaultDriveFolderId) {
                this.loadDriveVideos(); // Will load all videos now
            } else {
                console.warn("Cannot load Drive videos: Default folder ID not available.");
                // Clear list and potentially show message (already handled in initialize)
                 this.stateManager.setState({ videosList: [], isLoadingDriveVideos: false });
            }
        } else {
            // Clear Drive list if switching away
            if (this.stateManager.getState().videosList.length > 0) {
                 this.stateManager.setState({ videosList: [] });
            }
        }
    }

    async loadDriveVideos() {
        // This is triggered by source change or initial load for 'drive' source
        const { defaultDriveFolderId } = this.stateManager.getState(); // Removed driveSearchTerm

        // Prevent loading if folder ID is missing
        if (!defaultDriveFolderId) {
            console.warn("Attempted to load Drive videos, but defaultDriveFolderId is missing.");
             this.stateManager.setState({
                videosList: [],
                isLoadingDriveVideos: false,
                // Keep any existing error/info message from initialization
             });
            return;
        }

        console.log(`Loading Drive videos (folder: ${defaultDriveFolderId})...`); // Removed search term from log
        // Consolidate state updates
        this.stateManager.setState({ isLoadingDriveVideos: true, errorMessage: null, infoMessage: null, successMessage: null });
        try {
            // Use the updated ApiService method
            const videos = await this.apiService.fetchVideos(defaultDriveFolderId);
            this.stateManager.setState({ videosList: videos });
        } catch (error) {
            console.error("Failed to load Drive videos:", error);
            // Use error.message
            this.stateManager.setState({ videosList: [], errorMessage: `Could not load videos from Google Drive: ${error.message}` });
        } finally {
            this.stateManager.setState({ isLoadingDriveVideos: false });
        }
    }

    async fetchActiveConversions() {
        // console.log("Polling for active conversions..."); // Reduce log noise
        const POLLING_FAILURE_THRESHOLD = 3; // Number of consecutive failures before showing warning
        try {
            // Use the updated ApiService method
            const conversions = await this.apiService.fetchActiveConversions();
            const currentState = this.stateManager.getState();
            // Only update state if the data has actually changed to avoid unnecessary re-renders
            if (JSON.stringify(conversions) !== JSON.stringify(currentState.activeConversions)) {
                 console.log("Active conversions updated:", conversions);
                this.stateManager.setState({
                    activeConversions: conversions,
                    pollingFailureCount: 0, // Reset failure count on success
                    // Clear potential previous polling error message if needed
                    // infoMessage: currentState.infoMessage === 'Failed to update conversion status.' ? null : currentState.infoMessage
                 });
            } else {
                 // Reset failure count even if data hasn't changed, as the poll succeeded
                 if (currentState.pollingFailureCount > 0) {
                     this.stateManager.setState({ pollingFailureCount: 0 });
                 }
            }
        } catch (error) {
            console.error("Failed to poll active conversions:", error);
            const currentFailCount = this.stateManager.getState().pollingFailureCount;
            const newFailCount = currentFailCount + 1;
            this.stateManager.setState({ pollingFailureCount: newFailCount });

            // Avoid setting a persistent error message for polling failures unless needed
            // Consider showing a temporary warning if polling fails repeatedly
            if (newFailCount >= POLLING_FAILURE_THRESHOLD) {
                 this.stateManager.setState({ infoMessage: "Having trouble updating conversion status. Will keep trying." });
            }
            // this.stateManager.setState({ infoMessage: "Could not update conversion status." });
        }
    }

    startConversionPolling() {
        if (this.conversionPollingTimer) {
            clearInterval(this.conversionPollingTimer);
        }
        console.log(`Starting conversion polling every ${CONVERSION_POLLING_INTERVAL}ms`);
        // Poll immediately first
        this.fetchActiveConversions();
        this.conversionPollingTimer = setInterval(
            () => this.fetchActiveConversions(),
            CONVERSION_POLLING_INTERVAL
        );
    }

    // Add method to stop polling
    stopConversionPolling() {
        if (this.conversionPollingTimer) {
            console.log("Stopping conversion polling.");
            clearInterval(this.conversionPollingTimer);
            this.conversionPollingTimer = null;
        }
    }

    // --- UI Update Methods (Driven by State) ---

    updateSourceView(currentSource) {
        // const { currentVideoSource } = this.stateManager.getState(); // Get from argument
        console.log(`Updating source view to: ${currentSource}`);
        const isDrive = currentSource === 'drive';
        this.driveSourceSection.classList.toggle('hidden', !isDrive);
        this.uploadSourceSection.classList.toggle('hidden', isDrive);

        this.driveSourceButton.classList.toggle('active', isDrive);
        this.uploadSourceButton.classList.toggle('active', !isDrive);

        // Clear messages when switching views
        showMessage('', 'info', this.messageArea, true); // Clear previous messages
    }

    updateLoadingIndicator() {
        const { isLoadingDriveVideos, isLoadingUpload, isStartingConversion } = this.stateManager.getState();
        const isLoading = isLoadingDriveVideos || isLoadingUpload || isStartingConversion;
        // console.log(`Updating loading indicator: ${isLoading}`); // Reduce noise
        if (this.loadingIndicator) {
            this.loadingIndicator.classList.toggle('hidden', !isLoading);
        }
    }

    // --- Tab Management ---
    getActiveTab() {
        // Could use localStorage or default
        return 'convert'; // Default to convert tab
    }

    setActiveTab(tabId) {
        console.log(`Setting active tab: ${tabId}`);
        const isConvert = tabId === 'convert';

        this.convertPanel.classList.toggle('hidden', !isConvert);

        this.convertTabButton.classList.toggle('active', isConvert);

        // Potentially save to localStorage if persistence is desired
        // localStorage.setItem('activeTab', tabId);

        // Load data if switching to a tab that needs it (e.g., files tab)
        if (tabId === 'files') {
            // this.loadConvertedFiles(); // If FileListComponent is re-added
        }
    }

    updateActiveTab(tabId) {
        this.setActiveTab(tabId);
    }

}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed");
    const app = new App();
    app.initialize().then(() => {
        // Add cleanup listener *after* successful initialization
        window.addEventListener('beforeunload', () => {
            app.stopConversionPolling(); // Call the instance method
        });
    }).catch(error => {
        console.error("Critical error during app initialization:", error);
        const messageArea = document.getElementById('message-area');
        const loadingIndicator = document.getElementById('loading-indicator');
        if(loadingIndicator) loadingIndicator.classList.add('hidden'); // Hide loading on error
        if(messageArea) {
            showMessage('Critical error during application startup. Please refresh the page.', 'error', messageArea);
        }
    });

});