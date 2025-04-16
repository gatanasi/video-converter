import { populateSelectWithOptions, setSelectedOption } from '../utils/utils.js'; // Import new utils

/**
 * Conversion Form Component - Handles conversion options display.
 * Submission logic is handled by App.js.
 */
export class ConversionFormComponent {
    constructor(selector, onFormatChange) {
        const container = document.querySelector(selector);
         if (!container) {
            throw new Error(`ConversionFormComponent container not found: ${selector}`);
        }
        this.container = container;
        this.onFormatChange = onFormatChange; // Callback when format dropdown changes

        // References to form elements within this component's container
        this.formatSelect = null;
        // Remove reference to the external submit button
        // this.submitButton = null;

        this.createForm(); // Create the basic form structure
        this.setupEventListeners();
    }

    createForm() {
        // Form content focuses only on options within its container
        this.container.innerHTML = `
            <h3>Conversion Options</h3>
            <div class="form-group">
                <label for="target-format">Target Format:</label>
                <select id="target-format" name="targetFormat" class="form-control" required>
                    <!-- Options will be populated dynamically -->
                    <option value="" disabled>Loading formats...</option>
                </select>
            </div>
            <!-- Add other options like reverse, remove sound if needed -->
        `;
        this.formatSelect = this.container.querySelector('#target-format');
        // Initialize with placeholder
        this.populateFormatOptions([]);
        // Remove finding the external submit button
        // this.submitButton = document.getElementById('drive-convert-button');
    }

    setupEventListeners() {
        if (this.formatSelect) {
            this.formatSelect.addEventListener('change', (e) => {
                if (this.onFormatChange) {
                    this.onFormatChange(e.target.value); // Notify App.js of format change
                }
            });
        }
        // Add listeners for other options if they exist
    }

    /**
     * Populates the target format dropdown using the utility function.
     * @param {string[]} formats - Array of available format strings.
     */
    populateFormatOptions(formats = []) {
        if (!this.formatSelect) return;

        const previouslySelected = this.formatSelect.value;
        const selectedValue = populateSelectWithOptions(this.formatSelect, formats, {
            previouslySelected: previouslySelected,
            emptyText: 'No formats available',
            placeholderText: 'Loading formats...',
            textTransform: (text) => text.toUpperCase(), // Keep uppercase transformation
        });

        // If the selection changed (e.g., defaulted to first) and differs from the previous, notify App.js
        if (this.onFormatChange && selectedValue !== previouslySelected && selectedValue !== null) {
            this.onFormatChange(selectedValue);
        }
    }

     /**
     * Sets the selected value of the format dropdown using the utility function.
     * @param {string} format - The format string to select.
     */
    setSelectedFormat(format) {
        setSelectedOption(this.formatSelect, format);
    }

    /** Helper method for App.js to get current options */
    getConversionOptions() {
        const targetFormat = this.formatSelect ? this.formatSelect.value : '';
        // Add logic to get other options if they exist
        // const reverseVideo = this.reverseCheckbox ? this.reverseCheckbox.checked : false;
        // const removeSound = this.soundCheckbox ? this.soundCheckbox.checked : false;
        // return { targetFormat, reverseVideo, removeSound };
        return { targetFormat }; // Simplified example
    }
}
