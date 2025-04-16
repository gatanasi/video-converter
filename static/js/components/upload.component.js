import { populateSelectWithOptions, setSelectedOption } from '../utils/utils.js'; // Import new utils

/**
 * Upload Component - Handles file selection and upload initiation.
 */
export class UploadComponent {
    // constructor(selector, onFileSelect, onUploadSubmit) { // Original signature
    constructor(selector, onFileSelect, onUploadSubmit, onFormatChange) { // Added onFormatChange
        const container = document.querySelector(selector);
        if (!container) {
            throw new Error(`UploadComponent container not found: ${selector}`);
        }
        this.container = container;
        this.onFileSelect = onFileSelect;
        this.onUploadSubmit = onUploadSubmit;
        this.onFormatChange = onFormatChange; // Callback for format change

        // References to elements within the component's container
        this.form = this.container.querySelector('#upload-form');
        this.fileInput = this.container.querySelector('#file-input');
        this.fileNameDisplay = this.container.querySelector('#file-name');
        this.uploadButton = this.container.querySelector('#upload-button');
        this.formatSelect = this.container.querySelector('#upload-target-format'); // Assuming a format select exists here
        this.reverseCheckbox = this.container.querySelector('#reverse-video-upload'); // Added
        this.removeSoundCheckbox = this.container.querySelector('#remove-sound-upload'); // Added

        if (!this.form || !this.fileInput || !this.fileNameDisplay || !this.uploadButton || !this.formatSelect) {
            console.error("UploadComponent is missing required elements within:", selector);
            // Optionally throw an error or handle gracefully
        } else {
            // Initialize format dropdown
            this.populateFormatOptions([]);
        }
        // Add null checks for new checkboxes if they might not exist in the HTML yet
        if (!this.reverseCheckbox) console.warn("UploadComponent: #reverse-video-upload checkbox not found.");
        if (!this.removeSoundCheckbox) console.warn("UploadComponent: #remove-sound-upload checkbox not found.");

        this.setupEventListeners();
        this.updateUploadButton(false); // Initially disabled
    }

    setupEventListeners() {
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0] || null;
                this.displaySelectedFile(file);
                if (this.onFileSelect) {
                    this.onFileSelect(file); // Notify App.js
                }
            });
        }

        if (this.form) {
            // Prevent default form submission, notify App.js via callback
            this.form.addEventListener('submit', (e) => {
                e.preventDefault();
                if (this.onUploadSubmit) {
                    this.onUploadSubmit(e); // Pass the event if needed, App.js handles API call
                }
            });
        }

        if (this.formatSelect) {
            this.formatSelect.addEventListener('change', (e) => {
                if (this.onFormatChange) {
                    this.onFormatChange(e.target.value); // Notify App.js of format change
                }
            });
        }
    }

    displaySelectedFile(file) {
        if (this.fileNameDisplay) {
            this.fileNameDisplay.textContent = file ? file.name : 'No file selected';
        }
    }

    /**
     * Updates the enabled/disabled state of the upload button.
     * Called by App.js based on whether a file is selected.
     * @param {boolean} isEnabled - Whether the button should be enabled.
     */
    updateUploadButton(isEnabled) {
        if (this.uploadButton) {
            this.uploadButton.disabled = !isEnabled;
        }
    }

    /**
    * Populates the target format dropdown for uploads using the utility function.
    * @param {string[]} formats - Array of available format strings.
    */
    populateFormatOptions(formats = []) {
        if (!this.formatSelect) return;

        const previouslySelected = this.formatSelect.value;
        const selectedValue = populateSelectWithOptions(this.formatSelect, formats, {
            previouslySelected: previouslySelected,
            emptyText: 'No formats available',
            placeholderText: 'Select format...',
            textTransform: (text) => text.toUpperCase(),
        });

        // If the selection changed and differs from the previous, notify App.js
        if (this.onFormatChange && selectedValue !== previouslySelected && selectedValue !== null) {
            this.onFormatChange(selectedValue);
        }
    }

    /**
    * Sets the selected value of the format dropdown for uploads using the utility function.
    * @param {string} format - The format string to select.
    */
    setSelectedFormat(format) {
        setSelectedOption(this.formatSelect, format);
    }

    /** Helper method for App.js to get current options */
    getConversionOptions() {
        const targetFormat = this.formatSelect ? this.formatSelect.value : '';
        const reverseVideo = this.reverseCheckbox ? this.reverseCheckbox.checked : false; // Added
        const removeSound = this.removeSoundCheckbox ? this.removeSoundCheckbox.checked : false; // Added
        // Add other upload-specific options if needed
        return { targetFormat, reverseVideo, removeSound }; // Updated
    }

    /** Resets the file input and display. Called by App.js after successful upload. */
    resetForm() {
        if (this.form) {
            this.form.reset(); // Resets file input
        }
        this.displaySelectedFile(null); // Clear file name display
        // App.js will disable the button via updateUploadButton based on state
    }
}
