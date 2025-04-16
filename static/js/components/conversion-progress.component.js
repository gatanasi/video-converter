/**
 * Conversion Progress Component - Displays ongoing conversions based on state data.
 */
import { createProgressItem } from '../utils/utils.js';

export class ConversionProgressComponent {
    // constructor(selector, onAbortConversion) { // New signature
    constructor(selector, onAbortConversion, onDownloadReady) { // Added onDownloadReady
        const container = document.querySelector(selector);
         if (!container) {
            throw new Error(`ConversionProgressComponent container not found: ${selector}`);
        }
        this.container = container;
        this.onAbortConversion = onAbortConversion; // Callback to notify App.js to abort
        this.onDownloadReady = onDownloadReady; // Callback when a download is ready (optional)
        this.renderedConversions = new Map(); // Map<conversionId, { element: HTMLElement, timeoutId?: number }>

        this.container.innerHTML = ''; // Clear initial content
        this.showEmptyStateMessage(); // Show initially
    }

    /**
     * Displays the progress of active conversions based on data from the state manager.
     * @param {Array<object>} conversions - Array of conversion objects from the state.
     * @param {string|null} [abortingId=null] - The ID of the conversion currently being aborted (optional).
     * Expected object structure: { id, fileName, format, progress, complete, error, downloadUrl, aborted }
     */
    displayProgress(conversions = [], abortingId = null) { // Added abortingId parameter
        const currentIds = new Set(conversions.map(c => c.id));
        const renderedIds = new Set(this.renderedConversions.keys());

        // Remove items from UI that are no longer in the state data
        renderedIds.forEach(id => {
            if (!currentIds.has(id)) {
                this.removeRenderedItem(id);
            }
        });

        // Add or update items
        conversions.forEach(conv => {
            this.addOrUpdateItem(conv, abortingId); // Pass abortingId
        });

        // Update empty state message
        if (this.renderedConversions.size === 0) {
            this.showEmptyStateMessage();
        } else {
            this.removeEmptyStateMessage();
        }
    }

    addOrUpdateItem(conversion, abortingId) { // Added abortingId parameter
        let item = this.renderedConversions.get(conversion.id);
        let element = item ? item.element : null;
        const isAborting = conversion.id === abortingId; // Check if this item is being aborted

        // --- Create Element if it doesn't exist ---
        if (!element) {
            this.removeEmptyStateMessage(); // Ensure empty message is gone
            element = createProgressItem(`${conversion.fileName} → ${conversion.format.toUpperCase()}`);
            element.dataset.id = conversion.id;

            // Add abort button (conditionally)
            if (!conversion.complete && !conversion.error && !conversion.aborted) {
                const abortButton = this.createAbortButton(conversion.id, isAborting); // Pass isAborting
                element.appendChild(abortButton);
            }

            this.container.appendChild(element);
            item = { element }; // Create new item entry
            this.renderedConversions.set(conversion.id, item);
        }

        // --- Update Element based on conversion state ---
        this.updateProgressBar(element, conversion.progress);

        // Clear previous status classes/elements
        element.classList.remove('complete', 'error', 'aborted', 'aborting'); // Added 'aborting'
        const existingStatus = element.querySelector('.multi-progress-status, .multi-progress-download, .multi-progress-error');
        if (existingStatus) existingStatus.remove();
        let abortButton = element.querySelector('.abort-button');

        // Add aborting class if applicable
        if (isAborting) {
            element.classList.add('aborting');
            if (abortButton) abortButton.disabled = true; // Ensure button is disabled
        }

        // Handle different states
        if (conversion.aborted) {
            element.classList.add('aborted');
            if (abortButton) abortButton.remove(); // Remove abort button if present
            this.appendStatusMessage(element, 'Conversion aborted', 'aborted');
            this.scheduleRemoval(conversion.id, 5000); // Shorter delay for aborted
        } else if (conversion.error) {
            element.classList.add('error');
             if (abortButton) abortButton.remove();
            this.appendErrorMessage(element, conversion.error);
            this.scheduleRemoval(conversion.id, 10000); // Longer delay for errors
        } else if (conversion.complete) {
            element.classList.add('complete');
             if (abortButton) abortButton.remove();
            this.appendDownloadLink(element, conversion.downloadUrl, conversion.fileName); // Use appropriate filename
             if (this.onDownloadReady) {
                 this.onDownloadReady(conversion); // Notify app
             }
            this.scheduleRemoval(conversion.id, 30000); // Longer delay for completed items
        } else {
            // Still in progress - ensure abort button exists if needed and update its state
            if (!abortButton) {
                 const newAbortButton = this.createAbortButton(conversion.id, isAborting); // Pass isAborting
                 element.appendChild(newAbortButton);
                 abortButton = newAbortButton; // Update reference
            }
            // Ensure button disabled state matches isAborting, even if button already existed
            if (abortButton) abortButton.disabled = isAborting;

            // Clear any removal timeout if it somehow became active again
            if (item.timeoutId) {
                clearTimeout(item.timeoutId);
                item.timeoutId = undefined;
            }
        }
    }

    createAbortButton(conversionId, isDisabled = false) { // Added isDisabled parameter
        const abortButton = document.createElement('button');
        abortButton.className = 'abort-button';
        abortButton.innerHTML = '&times;'; // Use HTML entity
        abortButton.title = 'Abort conversion';
        abortButton.disabled = isDisabled; // Set initial disabled state
        abortButton.addEventListener('click', (e) => {
            e.stopPropagation();
            abortButton.disabled = true; // Disable immediately on click
            if (this.onAbortConversion) {
                this.onAbortConversion(conversionId); // Notify App.js
            }
        });
        return abortButton;
    }

     updateProgressBar(element, progress) {
        const progressBar = element.querySelector('.multi-progress-bar');
        const percentText = element.querySelector('.multi-progress-percent');
        if (progressBar && percentText) {
            const percent = Math.max(0, Math.min(100, Math.round(progress || 0))); // Default progress to 0
            progressBar.style.width = `${percent}%`;
            percentText.textContent = `${percent}%`;
        }
    }

    appendStatusMessage(element, message, className) {
         if (!element.querySelector('.multi-progress-status')) { // Append only once
            const msgDiv = document.createElement('div');
            msgDiv.className = `multi-progress-status ${className}`;
            msgDiv.textContent = message;
            element.appendChild(msgDiv);
        }
    }

     appendErrorMessage(element, errorMsg) {
         if (!element.querySelector('.multi-progress-error')) { // Append only once
            const errorDiv = document.createElement('div');
            errorDiv.className = 'multi-progress-error';
            errorDiv.textContent = `Error: ${errorMsg}`;
            element.appendChild(errorDiv);
        }
    }

    appendDownloadLink(element, downloadUrl, originalFileName) {
         if (!element.querySelector('.multi-progress-download')) { // Append only once
            const downloadLink = document.createElement('a');
            downloadLink.className = 'multi-progress-download btn small success'; // Style as button
            downloadLink.href = downloadUrl;
            downloadLink.textContent = 'Download';
            downloadLink.title = `Download converted file (${originalFileName})`;
            downloadLink.target = '_blank'; // Open in new tab/window
            downloadLink.setAttribute('download', ''); // Suggest download with original name (browser might override)
            element.appendChild(downloadLink);
        }
    }

    scheduleRemoval(conversionId, delay) {
        const item = this.renderedConversions.get(conversionId);
        if (!item) return;

        // Clear existing timeout if rescheduling
        if (item.timeoutId) {
            clearTimeout(item.timeoutId);
        }

        item.timeoutId = setTimeout(() => {
            this.removeRenderedItem(conversionId);
             // Check empty state after removal
            if (this.renderedConversions.size === 0) {
                this.showEmptyStateMessage();
            }
        }, delay);
    }

    removeRenderedItem(conversionId) {
        const item = this.renderedConversions.get(conversionId); // Added semicolon
        if (item) {
            if (item.timeoutId) {
                clearTimeout(item.timeoutId); // Added semicolon
            }
            if (item.element) {
                item.element.remove(); // Remove from DOM
            }
            this.renderedConversions.delete(conversionId); // Remove from map
        }
    }

    showEmptyStateMessage() {
        // Add message only if container is empty and message doesn't exist
        if (this.container.children.length === 0 && !this.container.querySelector('.empty-message')) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.id = 'no-conversions-message'; // Keep ID if needed
            emptyMessage.textContent = 'No active conversions.';
            this.container.appendChild(emptyMessage);
        }
    }

    removeEmptyStateMessage() {
        const emptyMessage = this.container.querySelector('#no-conversions-message');
        if (emptyMessage) {
            emptyMessage.remove();
        }
    }
}
