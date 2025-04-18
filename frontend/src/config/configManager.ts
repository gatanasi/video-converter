/**
 * Configuration Manager - Provides utility functions related to configuration, like parsing IDs.
 */
class ConfigManager {
    /**
     * Extract Google Drive folder ID from a URL or ID string.
     * @param {String} input - Google Drive folder ID or URL.
     * @returns {String} Extracted folder ID or empty string if invalid.
     */
    extractFolderId(input: string): string {
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
}

// Export as singleton
export default new ConfigManager();