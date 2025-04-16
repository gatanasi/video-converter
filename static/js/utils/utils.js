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
 * @param {String} text - The message text.
 * @param {String} [type='info'] - Message type ('info', 'success', 'warning', 'error').
 * @param {HTMLElement} container - The container element for messages.
 * @param {Number} [timeout=5000] - Auto-hide delay in ms for 'info' and 'success'. 0 to disable.
 */
export function showMessage(text, type = 'info', container, timeout = 5000) { // Changed order to match app.js usage
    if (!container) {
        console.warn("showMessage: Container element not provided or found.");
        return;
    }
    clearMessages(container);

    if (!text) { // If text is empty, just ensure container is hidden
        container.classList.add('hidden');
        return;
    }

    const message = document.createElement('div');
    // Use specific class names matching CSS
    message.className = `message ${type}`; // Removed 'messages' class from individual message
    message.textContent = text;
    message.setAttribute('role', 'alert'); // Accessibility

    container.appendChild(message);
    container.classList.remove('hidden'); // Show the container

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

/**
 * Populates a <select> element with options.
 * @param {HTMLSelectElement} selectElement - The select element to populate.
 * @param {Array<string|object>} options - An array of option values (strings) or objects.
 * @param {object} [config={}] - Configuration options.
 * @param {string} [config.valueField] - If options are objects, the property to use for the option value.
 * @param {string} [config.textField] - If options are objects, the property to use for the option text. If not provided, uses valueField.
 * @param {string} [config.previouslySelected] - The value to try and re-select.
 * @param {string} [config.emptyText='No options available'] - Text to display if options array is empty.
 * @param {string} [config.placeholderText] - Optional placeholder text (value="").
 * @param {function(string): string} [config.textTransform] - Function to transform the text displayed for each option.
 * @returns {string|null} The value that was ultimately selected (either re-selected or the first option).
 */
export function populateSelectWithOptions(selectElement, options = [], config = {}) {
    if (!selectElement) return null;

    const {
        valueField,
        textField,
        previouslySelected,
        emptyText = 'No options available',
        placeholderText,
        textTransform = (text) => text, // Default: no transformation
    } = config;

    selectElement.innerHTML = ''; // Clear existing options

    if (placeholderText) {
        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = placeholderText;
        placeholderOption.disabled = true;
        placeholderOption.selected = true; // Select by default if no other selection happens
        selectElement.appendChild(placeholderOption);
    }

    if (options.length === 0) {
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = emptyText;
        emptyOption.disabled = true;
        selectElement.appendChild(emptyOption);
        selectElement.disabled = true;
        return null;
    }

    selectElement.disabled = false;
    let valueToSelect = previouslySelected;
    let firstOptionValue = null;

    options.forEach((optionData, index) => {
        const value = typeof optionData === 'object' ? optionData[valueField] : optionData;
        const text = typeof optionData === 'object' ? (optionData[textField] || value) : optionData;

        if (index === 0) {
            firstOptionValue = value; // Store the first actual option value
        }

        const optionElement = document.createElement('option');
        optionElement.value = value;
        optionElement.textContent = textTransform(text); // Apply transformation
        selectElement.appendChild(optionElement);
    });

    // Determine which value should be selected
    if (valueToSelect && options.some(opt => (typeof opt === 'object' ? opt[valueField] : opt) === valueToSelect)) {
        // Previously selected value exists in the new options
        selectElement.value = valueToSelect;
    } else if (firstOptionValue !== null) {
        // Default to the first option if previous selection is invalid or not set
        selectElement.value = firstOptionValue;
        valueToSelect = firstOptionValue; // Update the value that is now selected
    } else if (placeholderText) {
        // If only a placeholder exists, ensure it's selected
        selectElement.value = '';
        valueToSelect = null;
    } else {
        // Should not happen if options.length > 0, but as a fallback
        valueToSelect = null;
    }

    return valueToSelect; // Return the value that ended up being selected
}

/**
 * Sets the selected value of a <select> element if the option exists.
 * @param {HTMLSelectElement} selectElement - The select element.
 * @param {string} value - The value to select.
 * @returns {boolean} True if the value was successfully selected, false otherwise.
 */
export function setSelectedOption(selectElement, value) {
    if (!selectElement || value === null || value === undefined) return false;

    const optionExists = Array.from(selectElement.options).some(opt => opt.value === value);
    if (optionExists) {
        selectElement.value = value;
        return true;
    } else {
        console.warn(`Value "${value}" not found in select options.`);
        return false;
    }
}

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds have elapsed
 * since the last time the debounced function was invoked.
 * @param {Function} func The function to debounce.
 * @param {number} wait The number of milliseconds to delay.
 * @returns {Function} Returns the new debounced function.
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}