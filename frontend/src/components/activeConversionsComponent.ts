import { showMessage, clearMessages, createProgressItem } from '../utils/utils.js';
import apiService from '../api/apiService.js';

// Define interfaces for component options and state
interface ActiveConversionsOptions {
    container: HTMLElement;
    messageContainer: HTMLElement;
    onConversionComplete?: () => void;
}

interface ConversionItem {
    fileName: string;
    format: string;
    element: HTMLElement;
    aborted?: boolean;
    timeoutId?: number; // Using number for NodeJS.Timeout/browser timeout ID
}

interface ConversionStatus {
    id: string;
    fileName: string;
    format: string;
    progress: number;
    complete: boolean;
    error?: string;
    downloadUrl?: string;
}

const REMOVAL_DELAY = 10000; // Delay before removing completed/failed items (ms)
const ABORT_REMOVAL_DELAY = 5000; // Shorter delay for aborted items

/**
 * Active Conversions Component - Displays and manages ongoing conversions.
 */
export class ActiveConversionsComponent {
    private container: HTMLElement;
    private messageContainer: HTMLElement;
    private onConversionComplete?: () => void;
    private activeConversions: Map<string, ConversionItem>;
    private progressInterval: number | null;
    private pollingInterval: number | null;
    private isPolling: boolean;
    private progressContainer!: HTMLElement; // Definite assignment assertion

    constructor(options: ActiveConversionsOptions) {
        this.container = options.container;
        this.messageContainer = options.messageContainer;
        this.onConversionComplete = options.onConversionComplete;
        this.activeConversions = new Map<string, ConversionItem>();
        this.progressInterval = null;
        this.pollingInterval = null;
        this.isPolling = false;

        this.createElements();
        this.loadActiveConversions(); // Initial load
        this.startPolling();
    }

    startPolling(): void {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        // Poll immediately, then set interval
        this.loadActiveConversions();
        this.pollingInterval = window.setInterval(() => this.loadActiveConversions(), 5000);
        console.log('Started polling for active conversions every 5 seconds');
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
        this.container.innerHTML = ''; // Clear previous content

        const header = document.createElement('h2');
        header.className = 'section-title'; // Use class if defined in CSS
        header.textContent = 'Running Conversions';
        this.container.appendChild(header);

        this.progressContainer = document.createElement('div');
        this.progressContainer.className = 'multi-progress';
        this.container.appendChild(this.progressContainer);

        this.container.classList.remove('hidden'); // Ensure section is visible
        this.showEmptyStateMessage(); // Show initially
    }

    showEmptyStateMessage(): void {
        // Add message only if container is empty and message doesn't exist
        if (this.progressContainer.children.length === 0 && !this.progressContainer.querySelector('.empty-message')) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.id = 'no-conversions-message'; // Keep ID for potential removal
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
        if (this.isPolling) return; // Prevent concurrent polls
        this.isPolling = true;

        try {
            const serverConversions: ConversionStatus[] = await apiService.listActiveConversions();
            const serverIds = new Set(serverConversions.map(conv => conv.id));
            const clientIds = new Set(this.activeConversions.keys());

            // Add new conversions not tracked by the client
            serverConversions.forEach((conv: ConversionStatus) => {
                if (!clientIds.has(conv.id)) {
                    this.addConversionItem(conv.id, conv.fileName, conv.format, conv.progress);
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
                if (!this.progressInterval) {
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
        } catch (error: unknown) { // Changed from any to unknown
            console.error('Error loading active conversions:', error);
            // Optionally show a message in the UI
            // const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            // showMessage(this.messageContainer, `Error loading conversions: ${errorMessage}`, 'error');
        } finally {
            this.isPolling = false;
        }
    }

    addConversionItem(conversionId: string, fileName: string, format: string, initialProgress: number = 0): void {
        this.removeEmptyStateMessage(); // Ensure empty message is gone

        const progressItem = createProgressItem(`${fileName} → ${format.toUpperCase()}`);
        progressItem.dataset.id = conversionId;

        const abortButton = document.createElement('button');
        abortButton.className = 'abort-button'; // Use class for styling
        abortButton.innerHTML = '×'; // Use HTML entity for cross
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
            element: progressItem
        });
    }

    /** Safely removes a conversion item from the UI and map */
    removeConversionItem(conversionId: string, delay: number = 0): void {
        const conversion = this.activeConversions.get(conversionId);
        if (!conversion) return;

        // Clear any existing removal timeout
        if (conversion.timeoutId) {
            clearTimeout(conversion.timeoutId);
        }

        const performRemoval = () => {
            if (conversion.element) {
                conversion.element.remove();
            }
            this.activeConversions.delete(conversionId);

            // Check if UI should show empty state after removal
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
            const percent = Math.max(0, Math.min(100, Math.round(progress))); // Clamp between 0-100
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

        // Create promises for all status requests
        const statusPromises = Array.from(this.activeConversions.keys()).map(id =>
            apiService.getConversionStatus(id).catch((error: unknown) => { // Changed from any to unknown
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
            downloadLink.className = 'multi-progress-download'; // Use specific class
            downloadLink.href = status.downloadUrl || '#'; // Use downloadUrl from status API, provide fallback
            downloadLink.textContent = 'Download';
            downloadLink.target = '_blank'; // Open in new tab
            downloadLink.setAttribute('download', ''); // Suggest download
            // Append download link only if not already present
            if (!conversion.element.querySelector('.multi-progress-download')) {
                conversion.element.appendChild(downloadLink);
            }

            if (this.onConversionComplete) {
                this.onConversionComplete(); // Notify app (e.g., refresh file list)
            }
            this.removeConversionItem(conversionId, REMOVAL_DELAY);
        }
        // If conversion.aborted is true, the abort function handles the UI update and removal.
    }

    async abortConversion(conversionId: string): Promise<void> {
        const conversion = this.activeConversions.get(conversionId);
        if (!conversion || conversion.aborted) return; // Already aborted or gone

        // Disable button immediately
        const abortButton = conversion.element.querySelector<HTMLButtonElement>('.abort-button');
        if (abortButton) abortButton.disabled = true;

        try {
            await apiService.abortConversion(conversionId);
            conversion.aborted = true; // Mark as aborted
            conversion.element.classList.add('aborted');

            // Remove abort button and progress bar details, show status message
            if (abortButton) abortButton.remove();
            const info = conversion.element.querySelector<HTMLElement>('.multi-progress-info');
            const barContainer = conversion.element.querySelector<HTMLElement>('.multi-progress-bar-container');
            if (info) info.style.opacity = '0.5'; // Dim the info
            if (barContainer) barContainer.remove(); // Remove progress bar

            const abortMsg = document.createElement('div');
            abortMsg.className = 'multi-progress-status aborted'; // Use general status class
            abortMsg.textContent = 'Conversion aborted';
            // Append message only if not already present
            if (!conversion.element.querySelector('.multi-progress-status')) {
                conversion.element.appendChild(abortMsg);
            }

            this.removeConversionItem(conversionId, ABORT_REMOVAL_DELAY);

        } catch (error: unknown) { // Changed from any to unknown
            console.error('Error aborting conversion:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            showMessage(this.messageContainer, `Failed to abort conversion: ${errorMessage}`, 'error');
            // Re-enable button if abort failed
            if (abortButton) abortButton.disabled = false;
        }
    }
}
