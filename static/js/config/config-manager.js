/**
 * Configuration Manager - Handles application configuration
 */
class ConfigManager {
    constructor() {
        this.CONFIG_KEY = 'videoConverterConfig_v3';
        this.config = {
            googleDriveFolderId: '',
        };
    }

    /**
     * Load configuration from local storage
     * @returns {Object} - The loaded configuration
     */
    loadConfig() {
        const savedConfig = localStorage.getItem(this.CONFIG_KEY);
        if (savedConfig) {
            try {
                const parsedConfig = JSON.parse(savedConfig);
                this.config.googleDriveFolderId = parsedConfig.googleDriveFolderId || '';
                console.log('Configuration loaded successfully');
                return this.config;
            } catch (error) {
                console.error('Error loading saved configuration:', error);
                localStorage.removeItem(this.CONFIG_KEY);
                return this.config;
            }
        }
        return this.config;
    }

    /**
     * Save configuration to local storage
     * @param {Object} newConfig - Configuration to save
     * @returns {Boolean} - True if saved successfully
     */
    saveConfig(newConfig) {
        try {
            this.config = { ...this.config, ...newConfig };
            localStorage.setItem(this.CONFIG_KEY, JSON.stringify(this.config));
            console.log('Configuration saved successfully');
            return true;
        } catch (error) {
            console.error('Error saving configuration:', error);
            return false;
        }
    }

    /**
     * Extract Google Drive folder ID from URL or ID string
     * @param {String} input - Google Drive folder ID or URL
     * @returns {String} - Extracted folder ID or empty string if invalid
     */
    extractFolderId(input) {
        input = input.trim();
        if (!input) return '';
        
        // If it's a Google Drive URL, extract the folder ID
        if (input.includes('drive.google.com')) {
            const match = input.match(/folders\/([a-zA-Z0-9_-]+)/);
            if (match && match[1]) {
                return match[1];
            }
            return '';
        }
        
        // Otherwise assume it's already an ID
        return input;
    }

    /**
     * Reset configuration to defaults
     * @returns {Object} - Default configuration
     */
    resetConfig() {
        localStorage.removeItem(this.CONFIG_KEY);
        this.config = {
            googleDriveFolderId: '',
        };
        return this.config;
    }

    /**
     * Get specific configuration value
     * @param {String} key - Configuration key
     * @returns {Any} - Configuration value
     */
    get(key) {
        return this.config[key];
    }

    /**
     * Set specific configuration value
     * @param {String} key - Configuration key
     * @param {Any} value - Configuration value
     */
    set(key, value) {
        this.config[key] = value;
        this.saveConfig(this.config);
    }
}

// Export as singleton
export default new ConfigManager();