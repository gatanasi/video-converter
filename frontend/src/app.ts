/**
 * Video Converter - Main Application Entry Point
 */
// CSS is processed separately via Tailwind CLI - see package.json build:css
import apiService from './api/apiService.js';
import configManager from './config/configManager.js';
// Import components from their individual files
import { ActiveConversionsComponent } from './components/activeConversionsComponent.js';
import { ConversionFormComponent } from './components/conversionFormComponent.js';
import { FileListComponent } from './components/fileListComponent.js';
import { VideoListComponent } from './components/videoListComponent.js';
import { showMessage, clearMessages, formatBytes } from './utils/utils.js';
import { ThemeController } from './theme.js';
import { Video, ConversionOptions } from './types';

class App {
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
    private driveConvertBtn: HTMLButtonElement;

    // Upload elements
    private uploadDropzone: HTMLElement;
    private fileUploadInput: HTMLInputElement;
    private uploadConvertBtn: HTMLButtonElement;
    private uploadClearBtn: HTMLButtonElement;
    private uploadFileInfo: HTMLElement;
    private uploadFileName: HTMLElement;
    private uploadFileSize: HTMLElement;
    private uploadProgressContainer: HTMLElement;
    private uploadProgressBar: HTMLElement;
    private uploadProgressPercent: HTMLElement;

    // Conversion Options
    private conversionFormContainer: HTMLElement;

    // Theme toggle
    private themeController: ThemeController;

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
    private appAbortController: AbortController = new AbortController();

    constructor() {
        this.messageArea = document.getElementById('message-area')!;
        this.activeConversionsContainer = document.getElementById('active-conversions')!;
        this.tabButtons = document.querySelectorAll('.tab-button');
        this.tabPanels = document.querySelectorAll('.tab-panel');
        this.fileListContainer = document.getElementById('file-list')!;

        // Source Selection
        this.sourceRadioButtons = document.querySelectorAll('input[name="videoSource"]');
        this.driveSourceSection = document.getElementById('drive-source-section')!;
        this.uploadSourceSection = document.getElementById('upload-source-section')!;
        this.driveVideoListSection = document.getElementById('drive-video-list-section')!;

        // Drive elements
        this.folderIdInput = document.getElementById('folder-id') as HTMLInputElement;
        this.loadVideosBtn = document.getElementById('load-videos-btn') as HTMLButtonElement;
        this.resetFolderIdBtn = document.getElementById('reset-folder-id-btn') as HTMLButtonElement;
        this.videoListContainer = document.getElementById('video-list')!;
        this.driveConvertBtn = document.getElementById('drive-convert-btn') as HTMLButtonElement;

        // Upload elements
        this.uploadDropzone = document.getElementById('upload-dropzone')!;
        this.fileUploadInput = document.getElementById('file-upload') as HTMLInputElement;
        this.uploadConvertBtn = document.getElementById('upload-convert-btn') as HTMLButtonElement;
        this.uploadClearBtn = document.getElementById('upload-clear-btn') as HTMLButtonElement;
        this.uploadFileInfo = document.getElementById('upload-file-info')!;
        this.uploadFileName = document.getElementById('upload-file-name')!;
        this.uploadFileSize = document.getElementById('upload-file-size')!;
        this.uploadProgressContainer = document.getElementById('upload-progress-container')!;
        this.uploadProgressBar = document.getElementById('upload-progress-bar')!;
        this.uploadProgressPercent = document.getElementById('upload-progress-percent')!;

        // Conversion Options
        this.conversionFormContainer = document.getElementById('conversion-options-section')!;

        this.selectedDriveVideos = [];
        this.selectedUploadFile = null;
        // Browsers may restore the checked radio across reloads - honour it
        const checkedSource = document.querySelector<HTMLInputElement>('input[name="videoSource"]:checked');
        this.currentVideoSource = checkedSource?.value === 'drive' ? 'drive' : 'upload';

        this.initComponents();
        this.setupEventListeners();
        this.loadConfigAndInitialData();

        // Initialize tab based on URL hash, defaulting to 'convert'
        const initialHash = window.location.hash.slice(1);
        this.activateTab(this.getTabFromHash(initialHash));

        this.updateSourceVisibility();
        this.themeController = new ThemeController(
            document.getElementById('theme-toggle') as HTMLButtonElement | null
        );
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

        // Conversion form component (for 'convert' tab)
        this.conversionFormComponent = new ConversionFormComponent({
            container: this.conversionFormContainer,
            messageContainer: this.messageArea,
        });

        // Video list component (for 'convert' tab)
        this.videoListComponent = new VideoListComponent({
            container: this.videoListContainer,
            messageContainer: this.messageArea,
            onSelectVideos: (selectedVideos: Video[]) => {
                this.selectedDriveVideos = selectedVideos;
                this.updateDriveConvertButtonState();
            }
        });
    }

    setupEventListeners(): void {
        this.loadVideosBtn.addEventListener('click', () => this.loadVideosFromDrive());
        this.resetFolderIdBtn.addEventListener('click', () => this.handleResetFolderId());

        this.folderIdInput.addEventListener('keypress', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.loadVideosFromDrive();
            }
        });

        this.tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.dataset.tab;
                if (tabId) {
                    // Update the URL hash to trigger the tab change via hashchange event
                    window.location.hash = tabId;
                }
            });
        });

        // Listen for back/forward navigation or manual hash changes
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.slice(1);
            this.activateTab(this.getTabFromHash(hash));
        }, { signal: this.appAbortController.signal });

        // Source selection listener
        this.sourceRadioButtons.forEach(radio => {
            radio.addEventListener('change', (e: Event) => this.handleSourceChange(e));
        });

        // Upload listeners
        this.fileUploadInput.addEventListener('change', () => this.handleFileSelection());
        this.uploadConvertBtn.addEventListener('click', () => this.submitUploadConversion());
        this.uploadClearBtn.addEventListener('click', (e: MouseEvent) => {
            e.preventDefault();
            this.clearSelectedUploadFile();
        });
        this.setupDropzone();

        // Drive conversion listener
        this.driveConvertBtn.addEventListener('click', () => this.submitDriveConversion());
    }

    /** Wire drag & drop onto the upload dropzone. The file input handles click/keyboard. */
    private setupDropzone(): void {
        const setDragover = (active: boolean) => {
            this.uploadDropzone.classList.toggle('dragover', active);
        };

        ['dragenter', 'dragover'].forEach(eventName => {
            this.uploadDropzone.addEventListener(eventName, (e: Event) => {
                e.preventDefault();
                setDragover(true);
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            this.uploadDropzone.addEventListener(eventName, (e: Event) => {
                e.preventDefault();
                setDragover(false);
            });
        });

        this.uploadDropzone.addEventListener('drop', (e: Event) => {
            const dragEvent = e as DragEvent;
            const file = dragEvent.dataTransfer?.files?.[0];
            if (!file) return;

            if (!file.type.startsWith('video/')) {
                showMessage(this.messageArea, `"${file.name}" does not look like a video file.`, 'error');
                return;
            }

            // Reflect the dropped file in the input so the rest of the flow stays unchanged
            const transfer = new DataTransfer();
            transfer.items.add(file);
            this.fileUploadInput.files = transfer.files;
            this.handleFileSelection();
        });
    }

    private getTabFromHash(hash: string): string {
        return hash === 'files' ? 'files' : 'convert';
    }

    // Handle change in video source selection
    handleSourceChange(event: Event): void {
        const target = event.target as HTMLInputElement;
        this.currentVideoSource = target.value as 'drive' | 'upload';
        this.updateSourceVisibility();
        clearMessages(this.messageArea);
        if (this.currentVideoSource === 'drive') {
            // Reset upload state if switching to drive
            this.clearSelectedUploadFile();
        } else {
            // Reset drive state if switching to upload
            this.videoListComponent.clear();
            this.selectedDriveVideos = [];
            this.updateDriveConvertButtonState();
        }
    }

    // Show/hide sections based on the selected source
    updateSourceVisibility(): void {
        const isDrive = this.currentVideoSource === 'drive';
        this.driveSourceSection.classList.toggle('hidden', !isDrive);
        this.driveVideoListSection.classList.toggle('hidden', !isDrive);
        this.uploadSourceSection.classList.toggle('hidden', isDrive);

        // Show the call-to-action that matches the selected source
        this.driveConvertBtn.classList.toggle('hidden', !isDrive);
        this.uploadConvertBtn.classList.toggle('hidden', isDrive);

        // Ensure conversion options are always visible on this tab
        this.conversionFormContainer.classList.remove('hidden');
    }

    // Update Drive Convert Button based on selection
    updateDriveConvertButtonState(): void {
        const count = this.selectedDriveVideos.length;
        this.driveConvertBtn.disabled = count === 0;
        this.driveConvertBtn.textContent = count > 1 ? `Convert ${count} selected videos` : 'Convert selected video';
    }

    // Sync UI with the currently selected upload file (or lack thereof)
    handleFileSelection(): void {
        const file = this.fileUploadInput.files?.[0];

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

    private clearSelectedUploadFile(): void {
        this.fileUploadInput.value = '';
        this.handleFileSelection();
    }

    async loadConfigAndInitialData(): Promise<void> {
        try {
            // Load server config to potentially get a default folder ID.
            const serverConfig = await apiService.getServerConfig();
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

        const folderId = configManager.extractFolderId(this.folderIdInput.value);
        if (!folderId) {
            showMessage(this.messageArea, 'Please enter a valid Google Drive folder ID or URL.', 'error');
            this.folderIdInput.focus();
            return;
        }

        // Show loading state
        this.loadVideosBtn.disabled = true;
        this.loadVideosBtn.textContent = 'Loading…';
        showMessage(this.messageArea, 'Loading videos from Google Drive...', 'info', 0); // Don't auto-hide

        try {
            const videos: Video[] = await apiService.listVideos(folderId);
            this.videoListComponent.displayVideos(videos);
            this.selectedDriveVideos = []; // Reset selection when loading new videos
            this.updateDriveConvertButtonState();
            clearMessages(this.messageArea);
        } catch (error: unknown) {
            console.error('Error loading videos:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            showMessage(this.messageArea, `Failed to load videos: ${errorMessage}`, 'error');
        } finally {
            this.loadVideosBtn.disabled = false;
            this.loadVideosBtn.textContent = 'Load videos';
        }
    }

    async submitDriveConversion(): Promise<void> {
        // Only proceed if Drive is the selected source
        if (this.currentVideoSource !== 'drive') return;

        if (this.selectedDriveVideos.length === 0) {
            showMessage(this.messageArea, 'Please select at least one video from Google Drive first.', 'error');
            return;
        }

        const options: ConversionOptions = this.conversionFormComponent.getConversionOptions();

        // Disable button and show processing state
        this.driveConvertBtn.disabled = true;
        this.driveConvertBtn.classList.add('button-pulse');
        this.driveConvertBtn.textContent = 'Starting…';

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
                mimeType: video.mimeType || '',
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

        // Restore button state (text and disabled state follow the selection)
        this.driveConvertBtn.classList.remove('button-pulse');
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

        // Clear selection and bring the progress section into view
        this.videoListComponent.deselectAllVideos();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async submitUploadConversion(): Promise<void> {
        // Only proceed if Upload is the selected source
        if (this.currentVideoSource !== 'upload') return;

        if (!this.selectedUploadFile) {
            showMessage(this.messageArea, 'Please select a file to upload first.', 'error');
            return;
        }

        const options: ConversionOptions = this.conversionFormComponent.getConversionOptions();
        const file = this.selectedUploadFile;

        // Disable button and show processing state
        this.uploadConvertBtn.disabled = true;
        this.uploadConvertBtn.classList.add('button-pulse');
        this.uploadConvertBtn.textContent = 'Uploading…';

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
                this.clearSelectedUploadFile();
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
            this.uploadConvertBtn.textContent = 'Upload & convert';
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

        // Clear input field
        this.folderIdInput.value = '';

        // Clear the video list and selection
        this.videoListComponent.clear();
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
        this.currentTab = tabId;

        this.tabButtons.forEach(button => {
            const isActive = button.dataset.tab === tabId;
            button.classList.toggle('active', isActive);
            if (isActive) {
                button.setAttribute('aria-current', 'true');
            } else {
                button.removeAttribute('aria-current');
            }
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
        this.appAbortController.abort();
    }
}

// Initialize the application once the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    window.addEventListener('beforeunload', () => {
        app.destroy();
    });
});
