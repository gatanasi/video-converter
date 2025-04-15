/**
 * Utility functions for the video converter application.
 */

/**
 * Format bytes to a human-readable string (e.g., KB, MB, GB).
 * @param {Number} bytes - Number of bytes.
 * @param {Number} [decimals=2] - Number of decimal places.
 * @returns {String} Formatted string.
 */
export function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes'; // Handles 0, null, undefined, NaN

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format seconds into a HH:MM:SS string.
 * @param {Number} totalSeconds - Duration in seconds.
 * @returns {String} Formatted time string.
 */
export function formatDuration(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds < 0) {
        return '00:00';
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    const paddedMinutes = String(minutes).padStart(2, '0');
    const paddedSeconds = String(seconds).padStart(2, '0');

    if (hours > 0) {
        const paddedHours = String(hours).padStart(2, '0');
        return `${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
    } else {
        return `${paddedMinutes}:${paddedSeconds}`;
    }
}

/**
 * Show a message in the specified container, clearing previous messages.
 * @param {HTMLElement} container - The container element for messages.
 * @param {String} text - The message text.
 * @param {String} [type='info'] - Message type ('info', 'success', 'warning', 'error').
 * @param {Number} [timeout=5000] - Auto-hide delay in ms for 'info' and 'success'. 0 to disable.
 */
export function showMessage(container, text, type = 'info', timeout = 5000) {
    clearMessages(container);

    const message = document.createElement('div');
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
export function clearMessages(container) {
    container.innerHTML = ''; // More concise than looping
    container.classList.add('hidden');
}

/**
 * Create a progress item element for multi-progress display.
 * @param {String} label - Label text for the progress item.
 * @returns {HTMLElement} The created progress item element.
 */
export function createProgressItem(label) {
    const item = document.createElement('div');
    item.className = 'multi-progress-item';

    const info = document.createElement('div');
    info.className = 'multi-progress-info';

    const labelEl = document.createElement('span');
    labelEl.className = 'multi-progress-label';
    labelEl.textContent = label;

    const percent = document.createElement('span');
    percent.className = 'multi-progress-percent';
    percent.textContent = '0%';

    info.appendChild(labelEl);
    info.appendChild(percent);

    const barContainer = document.createElement('div');
    barContainer.className = 'multi-progress-bar-container';

    const bar = document.createElement('div');
    bar.className = 'multi-progress-bar';
    bar.style.width = '0%';

    barContainer.appendChild(bar);

    item.appendChild(info);
    item.appendChild(barContainer);

    return item;
}