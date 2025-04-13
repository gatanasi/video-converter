/**
 * Utility functions for the video converter application
 */

/**
 * Format bytes to human-readable format
 * @param {Number} bytes - Number of bytes to format
 * @param {Number} decimals - Number of decimal places
 * @returns {String} - Formatted string
 */
export function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

/**
 * Show a message in the specified container
 * @param {HTMLElement} container - Container for messages
 * @param {String} text - Message text
 * @param {String} type - Message type (info, success, warning, error)
 */
export function showMessage(container, text, type = 'info') {
    // First, clear any existing messages
    clearMessages(container);
    
    // Create message element
    const message = document.createElement('div');
    message.className = 'message ' + type;
    message.textContent = text;
    
    // Ensure container is visible
    container.classList.remove('hidden');
    
    // Add message to container
    container.appendChild(message);
    
    // Auto-hide success and info messages after a delay
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            // Check if message is still in the DOM before removing
            if (message.parentNode === container) {
                container.removeChild(message);
                if (container.children.length === 0) {
                    container.classList.add('hidden');
                }
            }
        }, 5000);
    }
}

/**
 * Clear all messages from the specified container
 * @param {HTMLElement} container - Container to clear
 */
export function clearMessages(container) {
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }
    container.classList.add('hidden');
}

/**
 * Create a progress item element for multi-progress display
 * @param {String} label - Label text for the progress item
 * @returns {HTMLElement} - The created progress item element
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