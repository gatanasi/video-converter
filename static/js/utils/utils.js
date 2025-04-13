/**
 * Utility functions for the video converter application
 */

/**
 * Format bytes into human-readable format
 * @param {Number} bytes - Size in bytes
 * @param {Number} decimals - Number of decimal places
 * @returns {String} - Formatted string with appropriate units
 */
export function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    // Handle potential string input or null/undefined
    const numericBytes = Number(bytes);
    if (isNaN(numericBytes) || numericBytes < 0) return 'N/A';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(numericBytes) / Math.log(k));
    const index = Math.max(0, Math.min(i, sizes.length - 1)); // Ensure index is valid

    return parseFloat((numericBytes / Math.pow(k, index)).toFixed(dm)) + ' ' + sizes[index];
}

/**
 * Show a message notification
 * @param {HTMLElement} messageArea - Container for the message
 * @param {String} message - Message text to display
 * @param {String} type - Message type (info, success, error, warning)
 * @param {Number} timeout - Auto-hide timeout in ms, 0 for permanent
 */
export function showMessage(messageArea, message, type = 'info', timeout = 5000) {
    if (!messageArea) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    
    messageArea.innerHTML = '';
    messageArea.appendChild(messageDiv);
    messageArea.classList.remove('hidden');

    if (type === 'info' || type === 'success') {
        if (timeout > 0) {
            setTimeout(() => {
                if (messageArea.firstChild === messageDiv) {
                    messageArea.classList.add('hidden');
                    messageArea.innerHTML = '';
                }
            }, timeout);
        }
    }
}

/**
 * Clear all messages from a message area
 * @param {HTMLElement} messageArea - Container to clear
 */
export function clearMessages(messageArea) {
    if (!messageArea) return;
    messageArea.innerHTML = '';
    messageArea.classList.add('hidden');
}

/**
 * Create a progress item for tracking conversion progress
 * @param {String} fileName - Name of the file being converted
 * @returns {HTMLElement} - Progress item DOM element
 */
export function createProgressItem(fileName) {
    const item = document.createElement('div');
    item.className = 'multi-progress-item';
    
    const info = document.createElement('div');
    info.className = 'multi-progress-info';
    
    const name = document.createElement('div');
    name.className = 'multi-progress-name';
    name.textContent = fileName;
    
    const percent = document.createElement('div');
    percent.className = 'multi-progress-percent';
    percent.textContent = '0%';
    
    info.appendChild(name);
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