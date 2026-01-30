/**
 * Video Converter - Main Application Entry Point
 */
// CSS is processed separately via Tailwind CLI - see package.json build:css
import apiService from './api/apiService.js';
// Import components from their individual files
import { ActiveConversionsComponent } from './components/activeConversionsComponent.js';
import { ConversionFormComponent } from './components/conversionFormComponent.js';
import { FileListComponent } from './components/fileListComponent.js';
import { VideoListComponent } from './components/videoListComponent.js';
import { showMessage, clearMessages, formatBytes } from './utils/utils.js';
import { Video, ConversionOptions } from './types';

class App {
    private static readonly THEME_STORAGE_KEY = 'vc-theme';
    // DOM Element References
    private messageArea: HTMLElement;
    private activeConversionsContainer: HTMLElement;
    private tabButtons: NodeListOf<HTMLButtonElement>;
    private tabPanels: NodeListOf<HTMLElement>;
    private fileListContainer: HTMLElement;

    // Source Selection
    private sourceRadioButtons: NodeListOf<HTMLInputElement>;
    private driveSourceSection: HTMLElement;
    private uploadSourceSection: HTMLElement;
    private driveVideoListSection: HTMLElement;

    // Drive elements
    private folderIdInput: HTMLInputElement;
    private loadVideosBtn: HTMLButtonElement;
    private resetFolderIdBtn: HTMLButtonElement;
    private videoListContainer: HTMLElement;

    // Upload elements
    private fileUploadInput: HTMLInputElement;
    private uploadConvertBtn: HTMLButtonElement;
    private uploadFileInfo: HTMLElement;
    private uploadFileName: HTMLElement;
    private uploadFileSize: HTMLElement;
    // Add references for progress bar elements
    private uploadProgressContainer: HTMLElement;
    private uploadProgressBar: HTMLElement;
    private uploadProgressPercent: HTMLElement;

    // Conversion Options
    private conversionFormContainer: HTMLElement;

    // Drive conversion button (created dynamically)
    private driveConvertBtn: HTMLButtonElement | null;

    // Theme toggle
    private themeToggleButton: HTMLButtonElement | null;
    private currentTheme: 'light' | 'dark' = 'dark';

    // Component Instances
    private activeConversionsComponent!: ActiveConversionsComponent;
    private fileListComponent!: FileListComponent;
    private conversionFormComponent!: ConversionFormComponent;
    private videoListComponent!: VideoListComponent;

    // State
    private selectedDriveVideos: Video[];
    private selectedUploadFile: File | null;
    private currentVideoSource: 'drive' | 'upload';
    private currentTab: string | null = null;
    private themeAbortController: AbortController = new AbortController();

    constructor() {
        // DOM Element References - Use type assertions for non-null elements
        this.messageArea = document.getElementById('message-area')!;
        this.activeConversionsContainer = document.getElementById('active-conversions')!;
        this.tabButtons = document.querySelectorAll('.tab-button');
        this.tabPanels = document.querySelectorAll('.tab-panel');
        this.fileListContainer = document.getElementById('file-list')!;

        // Source Selection
        this.sourceRadioButtons = document.querySelectorAll('input[name="videoSource"]');
        this.driveSourceSection = document.getElementById('drive-source-section')!;
        this.uploadSourceSection = document.getElementById('upload-source-section')!;
        this.driveVideoListSection = document.getElementById('drive-video-list-section')!; // Includes the list and button

        // Drive elements
        this.folderIdInput = document.getElementById('folder-id') as HTMLInputElement;
        this.loadVideosBtn = document.getElementById('load-videos-btn') as HTMLButtonElement;
        this.resetFolderIdBtn = document.getElementById('reset-folder-id-btn') as HTMLButtonElement;
        this.videoListContainer = document.getElementById('video-list')!; // The actual list inside the section

        // Upload elements
        this.fileUploadInput = document.getElementById('file-upload') as HTMLInputElement;
        this.uploadConvertBtn = document.getElementById('upload-convert-btn') as HTMLButtonElement;
        this.uploadFileInfo = document.getElementById('upload-file-info')!;
        this.uploadFileName = document.getElementById('upload-file-name')!;
        this.uploadFileSize = document.getElementById('upload-file-size')!;
        // Initialize progress bar elements
        this.uploadProgressContainer = document.getElementById('upload-progress-container')!;
        this.uploadProgressBar = document.getElementById('upload-progress-bar')!;
        this.uploadProgressPercent = document.getElementById('upload-progress-percent')!;

        // Conversion Options
        this.conversionFormContainer = document.getElementById('conversion-options-section')!; // Use section ID

        // Drive conversion button (created dynamically)
        this.driveConvertBtn = null;

        // Theme toggle button
        this.themeToggleButton = document.getElementById('theme-toggle') as HTMLButtonElement | null;

        this.selectedDriveVideos = []; // Keep track of selected Drive videos
        this.selectedUploadFile = null; // Keep track of the selected file for upload
        this.currentVideoSource = 'upload'; // Default source

        this.initComponents();
        this.setupEventListeners();
        this.loadConfigAndInitialData();
        this.activateTab('convert'); // Start on the convert tab
        this.updateSourceVisibility(); // Set initial visibility based on default source
        this.initializeTheme();
    }

    initComponents(): void {
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
            container: this.conversionFormContainer, // Pass the section container
            messageContainer: this.messageArea,
        });

        // Video list component (for 'convert' tab)
        this.videoListComponent = new VideoListComponent({
            container: this.videoListContainer, // Pass the inner list container
            messageContainer: this.messageArea, // Add missing messageContainer
            // Pass selected videos array to the app using the correct property name
            onSelectVideos: (selectedVideos: Video[]) => { // Renamed from onSelectVideo
                this.selectedDriveVideos = selectedVideos;
                this.updateDriveConvertButtonState();
            }
        });

        // Create Drive Convert Button dynamically and append to its section
        this.driveConvertBtn = document.createElement('button');
        this.driveConvertBtn.id = 'drive-convert-btn';
        this.driveConvertBtn.className = 'btn primary';
        this.driveConvertBtn.textContent = 'Convert selected videos';
        this.driveConvertBtn.disabled = true;
        this.driveConvertBtn.style.marginTop = '15px'; // Add some space above the button
        // Append button inside the drive video list *section*
        this.driveVideoListSection.appendChild(this.driveConvertBtn);
    }

    setupEventListeners(): void {
        this.loadVideosBtn.addEventListener('click', () => this.loadVideosFromDrive());
        this.resetFolderIdBtn.addEventListener('click', () => this.handleResetFolderId()); // Added listener for reset button

        this.folderIdInput.addEventListener('keypress', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevent form submission if inside a form
                this.loadVideosFromDrive();
            }
        });

        this.tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.dataset.tab;
                if (tabId) {
                    this.activateTab(tabId);
                }
            });
        });

        // Source selection listener
        this.sourceRadioButtons.forEach(radio => {
            radio.addEventListener('change', (e: Event) => this.handleSourceChange(e)); // Use Event type directly
        });

        // Upload listeners
        this.fileUploadInput.addEventListener('change', (e: Event) => this.handleFileSelection(e)); // Use Event type directly
        this.uploadConvertBtn.addEventListener('click', () => this.submitUploadConversion());

        // Drive conversion listener
        this.driveConvertBtn?.addEventListener('click', () => this.submitDriveConversion());

        if (this.themeToggleButton) {
            this.themeToggleButton.addEventListener('click', () => this.toggleTheme());
        }

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event: MediaQueryListEvent) => {
            // Only apply system theme if no theme is explicitly set by the user
            if (!localStorage.getItem(App.THEME_STORAGE_KEY)) {
                const updatedTheme: 'light' | 'dark' = event.matches ? 'dark' : 'light';
                this.applyTheme(updatedTheme);
            }
        }, { signal: this.themeAbortController.signal });
    }

    private initializeTheme(): void {
        const storedTheme = localStorage.getItem(App.THEME_STORAGE_KEY);
        if (storedTheme === 'light' || storedTheme === 'dark') {
            this.applyTheme(storedTheme);
            return;
        }

        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.applyTheme(prefersDark ? 'dark' : 'light');
    }

    private toggleTheme(): void {
        const nextTheme: 'light' | 'dark' = this.currentTheme === 'light' ? 'dark' : 'light';
        localStorage.setItem(App.THEME_STORAGE_KEY, nextTheme);
        this.applyTheme(nextTheme);
    }

    private applyTheme(theme: 'light' | 'dark'): void {
        this.currentTheme = theme;
        document.body.dataset.theme = theme;
        if (this.themeToggleButton) {
            const label = theme === 'dark' ? 'Light mode' : 'Dark mode';
            const labelNode = this.themeToggleButton.querySelector('.theme-toggle-text');
            if (labelNode) {
                labelNode.textContent = label;
            }
            this.themeToggleButton.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
        }
    }

    // Handle change in video source selection
    handleSourceChange(event: Event): void { // Use Event type directly
        const target = event.target as HTMLInputElement; // Cast here is okay
        this.currentVideoSource = target.value as 'drive' | 'upload';
        this.updateSourceVisibility();
        // Optionally clear messages or reset states when switching sources
        clearMessages(this.messageArea);
        if (this.currentVideoSource === 'drive') {
            // Reset upload state if switching to drive
            this.fileUploadInput.value = '';
            // Simulate empty event for handleFileSelection
            // Create a simple object mimicking the necessary structure
            const emptyFileEvent = { target: this.fileUploadInput } as unknown as Event;
            this.handleFileSelection(emptyFileEvent);
        } else {
            // Reset drive state if switching to upload
            this.videoListComponent.displayVideos([]); // Clear video list
            this.selectedDriveVideos = [];
            this.updateDriveConvertButtonState();
        }
    }

    // Show/hide sections based on the selected source
    updateSourceVisibility(): void {
        const isDrive = this.currentVideoSource === 'drive';
        this.driveSourceSection.classList.toggle('hidden', !isDrive);
        this.driveVideoListSection.classList.toggle('hidden', !isDrive); // Hide list+button section
        this.uploadSourceSection.classList.toggle('hidden', isDrive);

        // Ensure conversion options are always visible on this tab
        this.conversionFormContainer.classList.remove('hidden');
    }

    // Update Drive Convert Button based on selection
    updateDriveConvertButtonState(): void {
        if (!this.driveConvertBtn) return;
        const count = this.selectedDriveVideos.length;
        this.driveConvertBtn.disabled = count === 0;
        this.driveConvertBtn.textContent = count > 1 ? `Convert ${count} selected videos` : 'Convert selected video';
    }

    // Handle file selection for upload
    handleFileSelection(event: Event): void { // Use Event type directly
        const target = event.target as HTMLInputElement; // Cast here is okay
        const file = target.files?.[0];

        this.resetUploadProgress();

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

    async loadConfigAndInitialData(): Promise<void> {
        try {
            // Load server config to potentially get a default folder ID.
            const serverConfig = await apiService.getServerConfig();
            // Set the input field value only if a server default is provided.
            if (serverConfig.defaultDriveFolderId) {
                this.folderIdInput.value = serverConfig.defaultDriveFolderId;
            }

        } catch (error: unknown) {
            console.error('Error loading server configuration:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to load server configuration.';
            showMessage(this.messageArea, errorMessage, 'error');
        }
    }

    async loadVideosFromDrive(): Promise<void> {
        // Only proceed if Drive is the selected source
        if (this.currentVideoSource !== 'drive') return;

        const folderInputValue = this.folderIdInput.value;
        // Use the utility function to extract a valid ID
        // Directly use folderInputValue, assuming backend handles URL/ID extraction or validation
        const folderId = folderInputValue.trim(); // Simple trim for basic cleaning

        if (!folderId) {
            showMessage(this.messageArea, 'Please enter a Google Drive folder ID or URL.', 'error');
            this.folderIdInput.focus(); // Focus input for correction
            return;
        }

        // Removed logic related to configManager.extractFolderId

        // Show loading state
        this.loadVideosBtn.disabled = true;
        this.loadVideosBtn.textContent = 'Loading...';
        showMessage(this.messageArea, 'Loading videos from Google Drive...', 'info', 0); // Don't auto-hide

        try {
            const videos: Video[] = await apiService.listVideos(folderId);
            this.videoListComponent.displayVideos(videos); // Display videos
            this.selectedDriveVideos = []; // Reset selection when loading new videos
            this.updateDriveConvertButtonState(); // Update button state
            clearMessages(this.messageArea); // Clear loading message on success
        } catch (error: unknown) {
            console.error('Error loading videos:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            showMessage(this.messageArea, `Failed to load videos: ${errorMessage}`, 'error');
        } finally {
            // Restore button state
            this.loadVideosBtn.disabled = false;
            this.loadVideosBtn.textContent = 'Load Videos';
        }
    }

    // Renamed from submitConversion in ConversionFormComponent
    async submitDriveConversion(): Promise<void> {
        // Only proceed if Drive is the selected source
        if (this.currentVideoSource !== 'drive') return;

        if (this.selectedDriveVideos.length === 0) {
            showMessage(this.messageArea, 'Please select at least one video from Google Drive first.', 'error');
            return;
        }

        const options: ConversionOptions = this.conversionFormComponent.getConversionOptions();

        // Disable button and show processing state
        if (!this.driveConvertBtn) return;
        this.driveConvertBtn.disabled = true;
        this.driveConvertBtn.classList.add('button-pulse');
        // Store original text if needed, but updateDriveConvertButtonState handles restore
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
                mimeType: video.mimeType || '', // Provide default empty string
                targetFormat: options.targetFormat,
                quality: options.quality,
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
                .catch((error: unknown) => {
                    failCount++;
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    showMessage(
                        this.messageArea,
                        `Error starting Drive conversion for ${video.name}: ${errorMessage}`,
                        'error'
                    );
                    console.error(`Drive conversion start error for ${video.name}:`, error);
                });
        });

        // Wait for all conversion requests to be sent
        await Promise.all(conversionPromises);

        // Restore button state
        if (this.driveConvertBtn) {
            this.driveConvertBtn.classList.remove('button-pulse');
            // Re-enable based on selection after completion
            this.updateDriveConvertButtonState(); // This sets text and disabled state correctly
        }

        // Show summary message
        if (failCount === 0 && successCount > 0) {
            showMessage(
                this.messageArea,
                `Successfully started ${successCount} Drive conversion${successCount > 1 ? 's' : ''}. See progress above.`,
                'success'
            );
        } else if (successCount > 0) {
            // Assign template literal to a variable first to potentially avoid parser issues
            const warningMessage = `Started ${successCount} Drive conversion${successCount > 1 ? 's' : ''}, but ${failCount} failed to start. See progress/errors above.`;
            showMessage(
                this.messageArea,
                warningMessage,
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
    async submitUploadConversion(): Promise<void> {
        // Only proceed if Upload is the selected source
        if (this.currentVideoSource !== 'upload') return;

        if (!this.selectedUploadFile) {
            showMessage(this.messageArea, 'Please select a file to upload first.', 'error');
            return;
        }

        const options: ConversionOptions = this.conversionFormComponent.getConversionOptions();
        const file = this.selectedUploadFile;
        // No need for !file check here due to the check above

        // Disable button and show processing state
        this.uploadConvertBtn.disabled = true;
        this.uploadConvertBtn.classList.add('button-pulse');
        this.uploadConvertBtn.textContent = 'Uploading...';

        // Show and reset progress bar
        this.uploadProgressContainer.classList.remove('hidden');
        this.uploadProgressBar.style.width = '0%';
        this.uploadProgressPercent.textContent = '0%';

        showMessage(
            this.messageArea,
            `Uploading and starting conversion for ${file.name}...`,
            'info',
            0 // Don't auto-hide
        );

        try {
            // Pass progress callback function to update UI
            const response = await apiService.uploadAndConvert(
                file,
                options,
                (percent) => {
                    this.uploadProgressBar.style.width = `${percent}%`;
                    this.uploadProgressPercent.textContent = `${percent}%`;
                }
            );

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
                // Simulate empty event for handleFileSelection to update UI state
                const emptyFileEvent = { target: this.fileUploadInput } as unknown as Event;
                this.handleFileSelection(emptyFileEvent);
            } else {
                showMessage(
                    this.messageArea,
                    `Upload/conversion failed for ${file.name}: ${response.error || 'Unknown error'}`,
                    'error'
                );
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            showMessage(
                this.messageArea,
                `Error starting upload/conversion for ${file.name}: ${errorMessage}`,
                'error'
            );
            console.error(`Upload/conversion start error for ${file.name}:`, error);
        } finally {
            this.resetUploadProgress();

            // Restore button state
            this.uploadConvertBtn.classList.remove('button-pulse');
            this.uploadConvertBtn.textContent = 'Upload & Convert';
            // Button disable state is handled by handleFileSelection
            this.uploadConvertBtn.disabled = !this.selectedUploadFile;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    private resetUploadProgress(): void {
        this.uploadProgressContainer.classList.add('hidden');
        this.uploadProgressBar.style.width = '0%';
        this.uploadProgressPercent.textContent = '0%';
    }

    // Handle resetting the folder ID
    async handleResetFolderId(): Promise<void> {
        clearMessages(this.messageArea);
        console.log('Resetting Google Drive Folder ID input');

        // Clear input field
        this.folderIdInput.value = '';

        // Clear the video list and selection
        this.videoListComponent.displayVideos([]);
        this.selectedDriveVideos = [];
        this.updateDriveConvertButtonState();

        // Attempt to reload default from server config into the input field
        try {
            const serverConfig = await apiService.getServerConfig();
            if (serverConfig.defaultDriveFolderId) {
                this.folderIdInput.value = serverConfig.defaultDriveFolderId;
                showMessage(this.messageArea, 'Folder ID input cleared. Server default loaded.', 'info');
            } else {
                showMessage(this.messageArea, 'Folder ID input cleared.', 'info');
            }
        } catch (error: unknown) {
            console.error('Error loading server config after reset:', error);
            showMessage(this.messageArea, 'Folder ID input cleared, but failed to load server default.', 'warning');
        }
    }

    activateTab(tabId: string): void {
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
            // Ensure correct source sections are visible when switching TO convert tab
            this.updateSourceVisibility();
        }
    }

    destroy(): void {
        this.themeAbortController.abort();
    }
}

// Initialize the application once the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    window.addEventListener('beforeunload', () => {
        app.destroy();
    });
});