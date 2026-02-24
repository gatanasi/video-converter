/**
 * Utility functions for the video converter application.
 */

/**
 * Format bytes to a human-readable string (e.g., KB, MB, GB).
 * @param {Number} bytes - Number of bytes.
 * @param {Number} [decimals=2] - Number of decimal places.
 * @returns {String} Formatted string.
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
    if (!+bytes) return '0 Bytes'; // Handles 0, null, undefined, NaN

    const k: number = 1024;
    const dm: number = decimals < 0 ? 0 : decimals;
    const sizes: string[] = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i: number = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format seconds into a HH:MM:SS string.
 * @param {Number} totalSeconds - Duration in seconds.
 * @returns {String} Formatted time string.
 */
export function formatDuration(totalSeconds: number): string {
    if (isNaN(totalSeconds) || totalSeconds < 0) {
        return '00:00';
    }
    const hours: number = Math.floor(totalSeconds / 3600);
    const minutes: number = Math.floor((totalSeconds % 3600) / 60);
    const seconds: number = Math.floor(totalSeconds % 60);

    const paddedMinutes: string = String(minutes).padStart(2, '0');
    const paddedSeconds: string = String(seconds).padStart(2, '0');

    if (hours > 0) {
        const paddedHours: string = String(hours).padStart(2, '0');
        return `${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
    } else {
        return `${paddedMinutes}:${paddedSeconds}`;
    }
}

/**
 * Message type options for the showMessage function
 */
export type MessageType = 'info' | 'success' | 'warning' | 'error';

/**
 * Show a message in the specified container, clearing previous messages.
 * @param {HTMLElement} container - The container element for messages.
 * @param {String} text - The message text.
 * @param {String} [type='info'] - Message type ('info', 'success', 'warning', 'error').
 * @param {Number} [timeout=5000] - Auto-hide delay in ms for 'info' and 'success'. 0 to disable.
 */
export function showMessage(
    container: HTMLElement,
    text: string,
    type: MessageType = 'info',
    timeout: number = 5000
): void {
    clearMessages(container);

    const message: HTMLDivElement = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;
    message.setAttribute('role', 'alert'); // Accessibility

    container.appendChild(message);
    container.classList.remove('hidden');

    // Auto-hide non-error messages
    if ((type === 'success' || type === 'info') && timeout > 0) {
        setTimeout(() => {
            // Check if the message is still the one we added before removing
            if (message.parentNode === container) {
                message.remove();
                // Hide container if no other messages were added in the meantime
                if (container.children.length === 0) {
                    container.classList.add('hidden');
                }
            }
        }, timeout);
    }
}

/**
 * Clear all messages from the specified container.
 * @param {HTMLElement} container - The container element to clear.
 */
export function clearMessages(container: HTMLElement): void {
    container.innerHTML = ''; // More concise than looping
    container.classList.add('hidden');
}

/**
 * Create a progress item element for multi-progress display.
 * @param {String} label - Label text for the progress item.
 * @returns {HTMLElement} The created progress item element.
 */
export function createProgressItem(label: string): HTMLDivElement {
    const item: HTMLDivElement = document.createElement('div');
    item.className = 'multi-progress-item';

    const info: HTMLDivElement = document.createElement('div');
    info.className = 'multi-progress-info';

    const labelEl: HTMLSpanElement = document.createElement('span');
    labelEl.className = 'multi-progress-label';
    labelEl.textContent = label;

    const percent: HTMLSpanElement = document.createElement('span');
    percent.className = 'multi-progress-percent';
    percent.textContent = '0%';

    info.appendChild(labelEl);
    info.appendChild(percent);

    const barContainer: HTMLDivElement = document.createElement('div');
    barContainer.className = 'multi-progress-bar-container';

    const bar: HTMLDivElement = document.createElement('div');
    bar.className = 'multi-progress-bar';
    bar.style.width = '0%';

    barContainer.appendChild(bar);

    item.appendChild(info);
    item.appendChild(barContainer);

    return item;
}

/**
 * Safely escape HTML characters to prevent XSS.
 * @param {String} unsafe - The unsafe string.
 * @returns {String} The escaped string.
 */
export function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}