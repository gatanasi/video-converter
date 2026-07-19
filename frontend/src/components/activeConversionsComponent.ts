import { showMessage, createProgressItem } from '../utils/utils.js';
import apiService from '../api/apiService.js';
import { ConversionStatus, ActiveConversionsContainer, ConversionQuality } from '../types';

const REMOVAL_DELAY = 10000; // Delay before removing completed/failed items (ms)
const ABORT_REMOVAL_DELAY = 5000; // Shorter delay for aborted items

interface TrackedConversion {
    fileName: string;
    format: string;
    quality?: ConversionQuality;
    element: HTMLElement;
    aborted?: boolean;
    timeoutId?: number;
}

/**
 * Active Conversions Component - Displays and manages ongoing conversions.
 * The section is only visible while at least one conversion is tracked.
 */
export class ActiveConversionsComponent {
    private container: HTMLElement;
    private messageContainer: HTMLElement;
    private onConversionComplete?: () => void;
    private activeConversions: Map<string, TrackedConversion>;
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

    constructor(options: ActiveConversionsContainer) {
        this.container = options.container;
        this.messageContainer = options.messageContainer;
        this.onConversionComplete = options.onConversionComplete;
        this.activeConversions = new Map<string, TrackedConversion>();
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
        header.textContent = 'Running conversions';
        this.container.appendChild(header);

        this.progressContainer = document.createElement('div');
        this.progressContainer.className = 'multi-progress';
        this.container.appendChild(this.progressContainer);

        this.updateVisibility();
    }

    /** Show the section only while conversions are tracked. */
    private updateVisibility(): void {
        this.container.classList.toggle('hidden', this.activeConversions.size === 0);
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

            // Update polling for progress updates
            if (this.activeConversions.size > 0) {
                if (this.updateMode === 'polling' && !this.progressInterval) {
                    // Start progress updates only if there are active items
                    this.progressInterval = window.setInterval(() => this.updateAllProgressBars(), 2000);
                }
            } else if (this.progressInterval) {
                clearInterval(this.progressInterval);
                this.progressInterval = null;
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
        // Remove file extension for display
        const lastDotIndex = fileName.lastIndexOf('.');
        const nameWithoutExtension = lastDotIndex === -1 ? fileName : fileName.substring(0, lastDotIndex);

        const qualitySuffix = quality ? ` · ${this.formatQualityLabel(quality)}` : '';
        const progressItem = createProgressItem(`${nameWithoutExtension} → ${format.toUpperCase()}${qualitySuffix}`);
        progressItem.dataset.id = conversionId;

        const abortButton = document.createElement('button');
        abortButton.className = 'abort-button';
        abortButton.type = 'button';
        abortButton.innerHTML = '×';
        abortButton.title = 'Abort conversion';
        abortButton.setAttribute('aria-label', `Abort conversion of ${fileName}`);
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
            element: progressItem
        });

        this.updateVisibility();
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

            if (this.activeConversions.size === 0 && this.progressInterval) {
                clearInterval(this.progressInterval);
                this.progressInterval = null;
            }
            this.updateVisibility();
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
            this.updateVisibility();
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

        // Already resolved: removal is already scheduled. Re-running this would call
        // removeConversionItem again, which resets the pending timeout - in polling mode
        // that means an item that stays "complete" across repeated 2s polls (e.g. the
        // 5s list refresh hasn't dropped it from the active set yet) would have its
        // removal deferred indefinitely instead of firing after REMOVAL_DELAY.
        if (conversion.timeoutId !== undefined) return;

        // Remove abort button on completion
        const abortButton = conversion.element.querySelector<HTMLButtonElement>('.abort-button');
        if (abortButton) abortButton.remove();

        if (status.error && !conversion.aborted) {
            // Handle error completion
            conversion.element.classList.add('error');
            const errorMsg = document.createElement('div');
            errorMsg.className = 'multi-progress-error';
            errorMsg.textContent = status.error;
            // Append error message only if not already present
            if (!conversion.element.querySelector('.multi-progress-error')) {
                conversion.element.appendChild(errorMsg);
            }
            this.removeConversionItem(conversionId, REMOVAL_DELAY);
        } else if (!status.error && !conversion.aborted) {
            // Handle successful completion
            conversion.element.classList.add('complete');
            if (status.downloadUrl && !conversion.element.querySelector('.multi-progress-download')) {
                const downloadLink = document.createElement('a');
                downloadLink.className = 'multi-progress-download';
                downloadLink.href = status.downloadUrl;
                downloadLink.textContent = 'Download';
                const baseName = conversion.fileName.substring(0, conversion.fileName.lastIndexOf('.')) || conversion.fileName;
                downloadLink.setAttribute('download', status.fileName || `${baseName}.${conversion.format}`);
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

    destroy(): void {
        this.stopPolling();
        if (this.streamUnsubscribe) {
            this.streamUnsubscribe();
            this.streamUnsubscribe = null;
        }
    }
}
