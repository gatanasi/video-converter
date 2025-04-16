import { ApiService } from './api/api-service.js';
import { ConfigManager } from './config/config-manager.js';
import { VideoListComponent, ConversionFormComponent, UploadComponent, ConversionProgressComponent } from './components/ui-components.js';
import { showMessage, debounce, clearMessages } from './utils/utils.js';
import { StateManager } from './state/state-manager.js';

const CONVERSION_POLLING_INTERVAL = 5000; // ms

class App {
    constructor() {
        this.configManager = new ConfigManager();
        this.apiService = new ApiService(this.configManager.getApiBaseUrl());

        // Define initial state
        const initialState = {
            currentVideoSource: 'drive', // 'drive' or 'upload'
            videosList: [], // Drive videos list
            selectedDriveVideoIds: [], // IDs of selected Drive videos
            selectedUploadFile: null,
            activeConversions: [], // { id, fileName, format, progress, complete, error, downloadUrl, aborted }
            isLoadingDriveVideos: false,
            isLoadingUpload: false,
            isStartingConversion: false,
            errorMessage: null,
            infoMessage: null,
            successMessage: null,
            availableFormats: [],
            selectedFormat: '', // Shared selected format
            driveSearchTerm: '',
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
        this.driveSearchInput = document.getElementById('drive-search');
        this.driveConvertButton = document.getElementById('drive-convert-button'); // Specific button for Drive
        // Tab buttons
        this.convertTabButton = document.querySelector('button[data-tab="convert"]');
        this.convertPanel = document.getElementById('convert-panel');

        // Debounced search
        this.debouncedDriveSearch = debounce(this.setDriveSearchTerm.bind(this), 500);

        this.conversionPollingTimer = null;

        console.log("App constructed");
    }

    async initialize() {
        console.log("App initializing...");
        this.setupEventListeners();
        this.setupStateSubscriptions(); // Setup listeners for state changes

        try {
            this.stateManager.setState({ isLoading: true });
            const formats = await this.apiService.fetchAvailableFormats();
            // Set formats and default selected format
            const initialFormat = formats.length > 0 ? formats[0] : '';
            this.stateManager.setState({ availableFormats: formats, selectedFormat: initialFormat });
        } catch (error) {
            console.error("Failed to fetch available formats:", error);
            this.stateManager.setState({ errorMessage: 'Failed to load conversion options. Please try refreshing.' });
        } finally {
             this.stateManager.setState({ isLoading: false });
        }

        // Initial UI setup based on default state
        this.updateSourceView(this.stateManager.getState().currentVideoSource);
        this.updateActiveTab(this.getActiveTab()); // Set initial tab view
        this.loadDataForCurrentSource(); // Load initial data (Drive videos)
        this.startConversionPolling(); // Start polling for active conversions

        console.log("App initialization complete.");
    }

    setupEventListeners() {
        console.log("Setting up event listeners...");
        this.driveSourceButton.addEventListener('click', () => this.handleSourceChange('drive'));
        this.uploadSourceButton.addEventListener('click', () => this.handleSourceChange('upload'));

        if (this.driveSearchInput) {
            this.driveSearchInput.addEventListener('input', (event) => {
                this.debouncedDriveSearch(event.target.value);
            });
        }

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

        // --- Data Loading & Display ---
        this.stateManager.subscribe('driveSearchTermChanged', this.loadDriveVideos.bind(this));
        this.stateManager.subscribe('videosListChanged', (videos) => {
            this.videoListComponent.displayVideos(videos, this.stateManager.getState().currentVideoSource);
            // Ensure selection UI is updated after list redraws
            this.videoListComponent.updateSelection(this.stateManager.getState().selectedDriveVideoIds);
        });
        this.stateManager.subscribe('activeConversionsChanged', (conversions) => {
            this.conversionProgressComponent.displayProgress(conversions);
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
                driveSearchTerm: '', // Reset search term
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
        const { selectedDriveVideoIds, selectedFormat } = this.stateManager.getState();

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

        try {
            // Use the updated ApiService method
            const result = await this.apiService.requestConversion(selectedDriveVideoIds, selectedFormat);
            this.stateManager.setState({
                successMessage: result.message || "Conversion started successfully!",
                selectedDriveVideoIds: [] // Clear selection on success
            });
            this.fetchActiveConversions(); // Immediately refresh progress list
        } catch (error) {
            console.error("Drive conversion request failed:", error);
            // Use error.message which apiRequest now standardizes
            this.stateManager.setState({ errorMessage: `Conversion failed: ${error.message}` });
        } finally {
            this.stateManager.setState({ isStartingConversion: false });
        }
    }

    /** Handles submission from the UploadComponent form */
    async handleUploadSubmit() {
        console.log("Handling upload submit...");
        const { selectedUploadFile, selectedFormat } = this.stateManager.getState();

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
            // Use the updated ApiService method
            const result = await this.apiService.uploadAndConvert(selectedUploadFile, selectedFormat);
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
        this.stateManager.setState({ errorMessage: null, infoMessage: null, successMessage: null });
        try {
            // Use the updated ApiService method
            await this.apiService.abortConversion(conversionId);
            this.stateManager.setState({ infoMessage: "Abort request sent." });
            // The poller will eventually update the status to aborted
            this.fetchActiveConversions(); // Fetch immediately for faster UI update
        } catch (error) {
            console.error("Failed to send abort request:", error);
             // Use error.message which apiRequest now standardizes
            this.stateManager.setState({ errorMessage: `Failed to abort conversion: ${error.message}` });
        }
    }

    /** Handles notification that a download is ready (optional) */
    handleDownloadReady(conversion) {
        console.log(`Download ready for: ${conversion.fileName}`);
        // Could show a temporary success message or trigger another action
        // this.stateManager.setState({ successMessage: `"${conversion.fileName}" is ready for download.` });
    }

    // --- Data Loading Methods ---

    setDriveSearchTerm(term) {
        this.stateManager.setState({ driveSearchTerm: term });
    }

    loadDataForCurrentSource() {
        const { currentVideoSource } = this.stateManager.getState();
        console.log(`Loading data for source: ${currentVideoSource}`);
        if (currentVideoSource === 'drive') {
            this.loadDriveVideos(); // Will use current searchTerm from state
        } else {
            // Clear Drive list if switching away
            if (this.stateManager.getState().videosList.length > 0) {
                 this.stateManager.setState({ videosList: [] });
            }
        }
    }

    async loadDriveVideos() {
        // This is triggered by searchTerm change or initial load for 'drive' source
        const { driveSearchTerm } = this.stateManager.getState();
        console.log(`Loading Drive videos (search: "${driveSearchTerm}")...`);
        // Consolidate state updates
        this.stateManager.setState({ isLoadingDriveVideos: true, errorMessage: null, infoMessage: null, successMessage: null });
        try {
            // Use the updated ApiService method
            const videos = await this.apiService.fetchVideos(driveSearchTerm);
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
        try {
            // Use the updated ApiService method
            const conversions = await this.apiService.fetchActiveConversions();
            const currentState = this.stateManager.getState();
            // Only update state if the data has actually changed to avoid unnecessary re-renders
            if (JSON.stringify(conversions) !== JSON.stringify(currentState.activeConversions)) {
                 console.log("Active conversions updated:", conversions);
                this.stateManager.setState({ activeConversions: conversions });
            }
        } catch (error) {
            console.error("Failed to poll active conversions:", error);
            // Avoid setting a persistent error message for polling failures unless needed
            // Consider showing a temporary warning if polling fails repeatedly
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
    app.initialize().catch(error => {
        console.error("Critical error during app initialization:", error);
        const messageArea = document.getElementById('message-area');
        const loadingIndicator = document.getElementById('loading-indicator');
        if(loadingIndicator) loadingIndicator.classList.add('hidden'); // Hide loading on error
        if(messageArea) {
            showMessage('Critical error during application startup. Please refresh the page.', 'error', messageArea);
        }
    });

    // Optional: Clean up polling on page unload
    window.addEventListener('beforeunload', () => {
        // Accessing app instance might be tricky here if not global
        // Consider a static method or alternative cleanup approach if needed.
        // app.stopConversionPolling();
    });
});