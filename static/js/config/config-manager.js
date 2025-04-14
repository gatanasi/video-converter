/**
 * Configuration Manager - Handles application configuration stored in localStorage.
 */
class ConfigManager {
    constructor() {
        this.CONFIG_KEY = 'videoConverterConfig_v3';
        this.config = {
            googleDriveFolderId: '',
        };
    }

    /**
     * Load configuration from local storage.
     * @returns {Object} The loaded configuration.
     */
    loadConfig() {
        const savedConfig = localStorage.getItem(this.CONFIG_KEY);
        if (savedConfig) {
            try {
                const parsedConfig = JSON.parse(savedConfig);
                // Only load known keys to prevent unexpected data
                this.config.googleDriveFolderId = parsedConfig.googleDriveFolderId || '';
                console.log('Configuration loaded from localStorage');
                return this.config;
            } catch (error) {
                console.error('Error loading saved configuration:', error);
                localStorage.removeItem(this.CONFIG_KEY); // Clear invalid data
                // Return default config
                this.config = { googleDriveFolderId: '' };
                return this.config;
            }
        }
        return this.config; // Return default if nothing saved
    }

    /**
     * Save configuration to local storage.
     * @param {Object} newConfig - Configuration object to merge and save.
     * @returns {Boolean} True if saved successfully.
     */
    saveConfig(newConfig) {
        try {
            // Merge new config with existing, ensuring only known keys are saved
            const configToSave = {
                googleDriveFolderId: newConfig.googleDriveFolderId !== undefined
                    ? newConfig.googleDriveFolderId
                    : this.config.googleDriveFolderId,
            };
            this.config = configToSave; // Update internal state
            localStorage.setItem(this.CONFIG_KEY, JSON.stringify(this.config));
            console.log('Configuration saved to localStorage');
            return true;
        } catch (error) {
            console.error('Error saving configuration:', error);
            return false;
        }
    }

    /**
     * Extract Google Drive folder ID from a URL or ID string.
     * @param {String} input - Google Drive folder ID or URL.
     * @returns {String} Extracted folder ID or empty string if invalid.
     */
    extractFolderId(input) {
        input = input ? input.trim() : '';
        if (!input) return '';

        // Regex to find folder ID in common Google Drive URL formats
        const urlMatch = input.match(/drive\.google\.com\/(?:drive\/folders\/|folderview\?id=)([a-zA-Z0-9_-]+)/);
        if (urlMatch && urlMatch[1]) {
            return urlMatch[1];
        }

        // Basic check if it looks like an ID (alphanumeric, -, _)
        const idMatch = input.match(/^[a-zA-Z0-9_-]+$/);
        if (idMatch) {
            return input; // Assume it's an ID
        }

        return ''; // Invalid input
    }

    /**
     * Get a specific configuration value.
     * @param {String} key - Configuration key.
     * @returns {Any} Configuration value or undefined.
     */
    get(key) {
        return this.config[key];
    }

    /**
     * Set a specific configuration value and save.
     * @param {String} key - Configuration key.
     * @param {Any} value - Configuration value.
     */
    set(key, value) {
        if (key in this.config) { // Only allow setting known keys
            this.config[key] = value;
            this.saveConfig(this.config);
        } else {
            console.warn(`Attempted to set unknown config key: ${key}`);
        }
    }
}

// Export as singleton
export default new ConfigManager();