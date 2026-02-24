import { showMessage, createProgressItem } from '../utils/utils.js';
import apiService from '../api/apiService.js';
import { ConversionStatus, ActiveConversionsContainer, ConversionQuality } from '../types';

const REMOVAL_DELAY = 10000; // Delay before removing completed/failed items (ms)
const ABORT_REMOVAL_DELAY = 5000; // Shorter delay for aborted items

/**
 * Active Conversions Component - Displays and manages ongoing conversions.
 */
export class ActiveConversionsComponent {
    private container: HTMLElement;
    private messageContainer: HTMLElement;
    private onConversionComplete?: () => void;
    private activeConversions: Map<string, {
        fileName: string;
        format: string;
        quality?: ConversionQuality;
        element: HTMLElement;
        aborted?: boolean;
        timeoutId?: number;
        conversionId: string; // Added conversionId to track status
    }>;
    private progressInterval: number | null;
    private pollingInterval: number | null;
    private isPolling: boolean;
    private updateMode: 'sse' | 'polling';
    private readonly supportsStream: boolean;
    private streamUnsubscribe: (() => void) | null;
    private progressContainer!: HTMLElement;

    private handleStreamStatus = (status: ConversionStatus): void => {
        const conversionId = status.id;
        if (!conversionId) {
            return;
        }

        if (this.updateMode === 'polling') {
            this.stopPolling();
            this.updateMode = 'sse';
        }

        if (!this.activeConversions.has(conversionId)) {
            if (status.complete) {
                return;
            }
            const fileName = status.fileName || 'Unknown File';
            this.addConversionItem(
                conversionId,
                fileName,
                status.format,
                status.progress,
                status.quality
            );
        }

        const conversion = this.activeConversions.get(conversionId);
        if (!conversion) {
            return;
        }

        this.updateProgressBar(conversion.element, status.progress);

        if (status.complete) {
            this.handleCompletion(conversionId, status);
        }
    };

    private handleStreamRemoval = (conversionId: string): void => {
        this.removeConversionItem(conversionId);
    };

    private handleStreamError = (): void => {
        console.warn('Active conversions stream encountered an issue; falling back to polling.');
        this.fallbackToPolling();
    };

    private fallbackToPolling(): void {
        if (this.updateMode === 'polling') {
            return;
        }

        this.startPolling();
    }

    // Use Container interface for options
    constructor(options: ActiveConversionsContainer) {
        this.container = options.container;
        this.messageContainer = options.messageContainer;
        this.onConversionComplete = options.onConversionComplete;
        this.activeConversions = new Map<string, {
            fileName: string;
            format: string;
            quality?: ConversionQuality;
            element: HTMLElement;
            aborted?: boolean;
            timeoutId?: number;
            conversionId: string; // Added conversionId to track status
        }>();
        this.progressInterval = null;
        this.pollingInterval = null;
        this.isPolling = false;
        this.supportsStream = apiService.isActiveConversionStreamSupported();
        this.updateMode = this.supportsStream ? 'sse' : 'polling';
        this.streamUnsubscribe = null;

        this.createElements();
        if (this.supportsStream) {
            this.streamUnsubscribe = apiService.connectActiveConversionsStream({
                onStatus: this.handleStreamStatus,
                onRemoval: this.handleStreamRemoval,
                onError: () => this.handleStreamError()
            });
        } else {
            this.startPolling();
        }
    }

    startPolling(prime: boolean = true): void {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        this.updateMode = 'polling';

        if (prime) {
            void this.loadActiveConversions();
        }

        this.pollingInterval = window.setInterval(() => this.loadActiveConversions(), 5000);
        console.info('Polling active conversions every 5 seconds.');
    }

    stopPolling(): void {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log('Stopped polling for active conversions');
        }
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    createElements(): void {
        this.container.innerHTML = '';

        const header = document.createElement('h2');
        header.className = 'section-title';
        header.textContent = 'Running Conversions';
        this.container.appendChild(header);

        this.progressContainer = document.createElement('div');
        this.progressContainer.className = 'multi-progress';
        this.container.appendChild(this.progressContainer);

        this.container.classList.remove('hidden');
        this.showEmptyStateMessage();
    }

    showEmptyStateMessage(): void {
        if (this.progressContainer.children.length === 0 && !this.progressContainer.querySelector('.empty-message')) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.id = 'no-conversions-message';
            emptyMessage.textContent = 'No active conversions.';
            this.progressContainer.appendChild(emptyMessage);
        }
    }

    removeEmptyStateMessage(): void {
        const emptyMessage = this.progressContainer.querySelector('#no-conversions-message');
        if (emptyMessage) {
            emptyMessage.remove();
        }
    }

    async loadActiveConversions(): Promise<void> {
        if (this.updateMode !== 'polling') {
            return;
        }

        if (this.isPolling) return; // Prevent concurrent polls
        this.isPolling = true;

        try {
            const serverConversions: ConversionStatus[] = await apiService.listActiveConversions();
            const serverIds = new Set(serverConversions.map(conv => conv.id));
            const clientIds = new Set(this.activeConversions.keys());

            // Add new conversions not tracked by the client
            serverConversions.forEach((conv: ConversionStatus) => {
                if (!clientIds.has(conv.id)) {
                    // Provide default for potentially undefined fileName
                    this.addConversionItem(
                        conv.id,
                        conv.fileName || 'Unknown File',
                        conv.format,
                        conv.progress,
                        conv.quality
                    );
                }
            });

            // Remove conversions from client that are no longer active on the server
            clientIds.forEach(id => {
                if (!serverIds.has(id)) {
                    this.removeConversionItem(id);
                }
            });

            // Update UI state (empty message, progress interval)
            if (this.activeConversions.size > 0) {
                this.removeEmptyStateMessage();
                if (this.updateMode === 'polling' && !this.progressInterval) {
                    // Start progress updates only if there are active items
                    this.progressInterval = window.setInterval(() => this.updateAllProgressBars(), 2000);
                }
            } else {
                this.showEmptyStateMessage();
                if (this.progressInterval) {
                    clearInterval(this.progressInterval);
                    this.progressInterval = null;
                }
            }
        } catch (error: unknown) {
            console.error('Error loading active conversions:', error);
        } finally {
            this.isPolling = false;
        }
    }

    addConversionItem(
        conversionId: string,
        fileName: string,
        format: string,
        initialProgress: number = 0,
        quality?: ConversionQuality
    ): void {
        this.removeEmptyStateMessage();

        // Remove file extension for display
        const lastDotIndex = fileName.lastIndexOf('.');
        const nameWithoutExtension = lastDotIndex === -1 ? fileName : fileName.substring(0, lastDotIndex);

        const qualitySuffix = quality ? ` · ${this.formatQualityLabel(quality)}` : '';
        const progressItem = createProgressItem(`${nameWithoutExtension} → ${format.toUpperCase()}${qualitySuffix}`);
        progressItem.dataset.id = conversionId;

        const abortButton = document.createElement('button');
        abortButton.className = 'abort-button';
        abortButton.innerHTML = '×';
        abortButton.title = 'Abort conversion';
        abortButton.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation();
            this.abortConversion(conversionId);
        });
        progressItem.appendChild(abortButton);

        // Set initial progress
        this.updateProgressBar(progressItem, initialProgress);

        this.progressContainer.appendChild(progressItem);

        this.activeConversions.set(conversionId, {
            fileName,
            format,
            quality,
            element: progressItem,
            conversionId
        });
    }

    private formatQualityLabel(quality: ConversionQuality): string {
        switch (quality) {
            case 'high':
                return 'High Quality';
            case 'fast':
                return 'Fast Quality';
            default:
                return 'Default Quality';
        }
    }

    /** Safely removes a conversion item from the UI and map */
    removeConversionItem(conversionId: string, delay: number = 0): void {
        const conversion = this.activeConversions.get(conversionId);
        if (!conversion) return;

        if (conversion.timeoutId) {
            clearTimeout(conversion.timeoutId);
        }

        const performRemoval = () => {
            if (conversion.element) {
                conversion.element.remove();
            }
            this.activeConversions.delete(conversionId);

            if (this.activeConversions.size === 0) {
                this.showEmptyStateMessage();
                if (this.progressInterval) {
                    clearInterval(this.progressInterval);
                    this.progressInterval = null;
                }
            }
        };

        if (delay > 0) {
            conversion.timeoutId = window.setTimeout(performRemoval, delay);
        } else {
            performRemoval();
        }
    }

    updateProgressBar(element: HTMLElement, progress: number): void {
        const progressBar = element.querySelector<HTMLElement>('.multi-progress-bar');
        const percentText = element.querySelector<HTMLElement>('.multi-progress-percent');
        if (progressBar && percentText) {
            const percent = Math.max(0, Math.min(100, Math.round(progress)));
            progressBar.style.width = `${percent}%`;
            percentText.textContent = `${percent}%`;
        }
    }

    async updateAllProgressBars(): Promise<void> {
        if (this.activeConversions.size === 0) {
            // Should be handled by loadActiveConversions, but as a safeguard:
            if (this.progressInterval) {
                clearInterval(this.progressInterval);
                this.progressInterval = null;
            }
            this.showEmptyStateMessage();
            return;
        }

        if (this.updateMode !== 'polling') {
            return;
        }

        // Create promises for all status requests
        const statusPromises = Array.from(this.activeConversions.keys()).map(id =>
            apiService.getConversionStatus(id).catch((error: unknown) => {
                console.error(`Error fetching status for ${id}:`, error);
                return null; // Return null on error to avoid breaking Promise.all
            })
        );

        const statuses: (ConversionStatus | null)[] = await Promise.all(statusPromises);

        statuses.forEach(status => {
            if (!status) return; // Skip if fetching status failed

            const conversionId = status.id;
            const conversion = this.activeConversions.get(conversionId);
            if (!conversion || !conversion.element) return; // Skip if conversion was removed

            this.updateProgressBar(conversion.element, status.progress);

            if (status.complete) {
                this.handleCompletion(conversionId, status);
            }
        });
    }

    handleCompletion(conversionId: string, status: ConversionStatus): void {
        const conversion = this.activeConversions.get(conversionId);
        if (!conversion || !conversion.element) return;

        // Remove abort button on completion
        const abortButton = conversion.element.querySelector<HTMLButtonElement>('.abort-button');
        if (abortButton) abortButton.remove();

        if (status.error && !conversion.aborted) {
            // Handle error completion
            conversion.element.classList.add('error');
            const errorMsg = document.createElement('div');
            errorMsg.className = 'multi-progress-error'; // Use specific class
            errorMsg.textContent = status.error;
            // Append error message only if not already present
            if (!conversion.element.querySelector('.multi-progress-error')) {
                conversion.element.appendChild(errorMsg);
            }
            this.removeConversionItem(conversionId, REMOVAL_DELAY);
        } else if (!status.error && !conversion.aborted) {
            // Handle successful completion
            conversion.element.classList.add('complete');
            const downloadLink = document.createElement('a');
            downloadLink.className = 'multi-progress-download';
            downloadLink.href = status.downloadUrl || '#';
            downloadLink.textContent = 'Download';
            const lastDotIndex = conversion.fileName.lastIndexOf('.');
            const baseName = lastDotIndex === -1 ? conversion.fileName : conversion.fileName.substring(0, lastDotIndex);
            downloadLink.setAttribute('download', status.fileName || `${baseName}.${conversion.format}`);
            // Append download link only if not already present
            if (!conversion.element.querySelector('.multi-progress-download')) {
                conversion.element.appendChild(downloadLink);
            }

            if (this.onConversionComplete) {
                this.onConversionComplete(); // Notify app (e.g., refresh file list)
            }
            this.removeConversionItem(conversionId, REMOVAL_DELAY);
        }
    }

    async abortConversion(conversionId: string): Promise<void> {
        const conversion = this.activeConversions.get(conversionId);
        if (!conversion || conversion.aborted) return; // Already aborted or gone

        // Disable button immediately
        const abortButton = conversion.element.querySelector<HTMLButtonElement>('.abort-button');
        if (abortButton) abortButton.disabled = true;

        try {
            await apiService.abortConversion(conversionId);
            conversion.aborted = true;
            conversion.element.classList.add('aborted');

            // Remove abort button and progress bar details, show status message
            if (abortButton) abortButton.remove();
            const info = conversion.element.querySelector<HTMLElement>('.multi-progress-info');
            const barContainer = conversion.element.querySelector<HTMLElement>('.multi-progress-bar-container');
            if (info) info.style.opacity = '0.5'; // Dim the info
            if (barContainer) barContainer.remove();

            const abortMsg = document.createElement('div');
            abortMsg.className = 'multi-progress-status aborted';
            abortMsg.textContent = 'Conversion aborted';
            // Append message only if not already present
            if (!conversion.element.querySelector('.multi-progress-status')) {
                conversion.element.appendChild(abortMsg);
            }

            this.removeConversionItem(conversionId, ABORT_REMOVAL_DELAY);

        } catch (error: unknown) {
            console.error('Error aborting conversion:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            showMessage(this.messageContainer, `Failed to abort conversion: ${errorMessage}`, 'error');
            // Re-enable button if abort failed
            if (abortButton) abortButton.disabled = false;
        }
    }

    async pollConversionStatuses(): Promise<void> {
        if (this.updateMode !== 'polling') {
            return;
        }

        if (this.isPolling || this.activeConversions.size === 0) {
            return;
        }
        this.isPolling = true;

        try {
            // Fetch status for all active conversions tracked by the component
            const conversionIds = Array.from(this.activeConversions.keys());
            if (conversionIds.length === 0) {
                this.isPolling = false;
                return; // No active conversions to poll
            }

            // Fetch statuses from the API - uses imported ConversionStatus
            const statusPromises = conversionIds.map(id =>
                apiService.getConversionStatus(id).catch((err: unknown) => {
                    console.error(`Error fetching status for ${id}:`, err);
                    // Find the corresponding item to potentially mark as error locally
                    const item = this.activeConversions.get(id);
                    if (item) {
                        this.updateProgressBar(item.element, 100); // Assuming 100% progress on error for visual feedback
                        // Add error message display similar to handleCompletion
                        item.element.classList.add('error');
                        const errorMsg = document.createElement('div');
                        errorMsg.className = 'multi-progress-error';
                        // Safely get error message
                        const errorMessage = err instanceof Error ? err.message : String(err);
                        errorMsg.textContent = `Error fetching status: ${errorMessage}`;
                        if (!item.element.querySelector('.multi-progress-error')) {
                            item.element.appendChild(errorMsg);
                        }
                        this.removeConversionItem(id, REMOVAL_DELAY);
                    }
                    return null; // Return null for failed fetches
                })
            );

            const statuses: (ConversionStatus | null)[] = await Promise.all(statusPromises);

            statuses.forEach(status => {
                if (status) {
                    const item = this.activeConversions.get(status.id);
                    if (item) {
                        // Use updateProgressBar instead of updateProgress
                        this.updateProgressBar(item.element, status.progress);
                        if (status.complete || status.error) {
                            // Use handleCompletion instead of handleCompletedOrFailedConversion
                            // Pass the full status object to handleCompletion
                            this.handleCompletion(status.id, status);
                        }
                    }
                }
            });

            // Fetch the list of all active conversions from the server
            // to catch any conversions started elsewhere or missed
            const serverConversions: ConversionStatus[] = await apiService.listActiveConversions();
            const serverConversionIds = new Set(serverConversions.map(s => s.id));

            // Add any new conversions from the server not tracked locally
            serverConversions.forEach(status => {
                if (!this.activeConversions.has(status.id)) {
                    console.warn(`Found untracked active conversion ${status.id}, adding to list.`);
                    // We might not have the original file name readily available here
                    // Using status.fileName if available, otherwise a placeholder
                    this.addConversionItem(
                        status.id,
                        status.fileName || 'Unknown File',
                        status.format,
                        status.progress,
                        status.quality
                    );
                }
            });

            // Remove conversions from local map if they are no longer active on the server
            // (unless already completed/failed and pending removal)
            this.activeConversions.forEach((item, id) => {
                // Check if the item is marked for removal by checking for timeoutId or specific class/data attribute
                const isRemoving = item.timeoutId !== undefined || item.element.classList.contains('complete') || item.element.classList.contains('error') || item.element.classList.contains('aborted');
                if (!serverConversionIds.has(id) && !isRemoving) {
                    console.warn(`Conversion ${id} no longer active on server, removing from local list.`);
                    this.removeConversionItem(id, 0); // Remove immediately if gone from server
                }
            });

        } catch (error) {
            console.error('Error polling conversion statuses:', error);
        } finally {
            this.isPolling = false;
            // Check if polling should continue
            if (this.activeConversions.size > 0) {
                // Optionally adjust polling interval based on activity
            } else {
                this.stopPolling();
            }
        }

    }

    destroy(): void {
        this.stopPolling();
        if (this.streamUnsubscribe) {
            this.streamUnsubscribe();
            this.streamUnsubscribe = null;
        }
    }
}
