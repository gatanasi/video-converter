/**
 * API Service - Handles all API communication with the backend
 */
class ApiService {
    /**
     * Initialize the API service
     */
    constructor() {
        this.baseUrl = ''; // Same origin
    }

    /**
     * Helper method to handle API requests
     * @param {String} endpoint - API endpoint
     * @param {Object} options - Fetch options
     * @param {String} errorContext - Context for error logging
     * @returns {Promise<Object>} - Response data
     */
    async apiRequest(endpoint, options = {}, errorContext = 'API call') {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, options);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`API error in ${errorContext}:`, error);
            throw error;
        }
    }

    /**
     * Fetch videos from Google Drive folder
     * @param {String} folderId - Google Drive folder ID
     * @returns {Promise<Array>} - Array of video objects
     */
    async listVideos(folderId) {
        return this.apiRequest(
            `/api/list-videos?folderId=${encodeURIComponent(folderId)}`,
            {},
            'listVideos'
        );
    }

    /**
     * Start video conversion from Google Drive
     * @param {Object} conversionData - Data for conversion
     * @returns {Promise<Object>} - Conversion response
     */
    async convertFromDrive(conversionData) {
        return this.apiRequest(
            `/api/convert-from-drive`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(conversionData)
            },
            'convertFromDrive'
        );
    }

    /**
     * Get conversion status
     * @param {String} conversionId - ID of the conversion
     * @returns {Promise<Object>} - Status object
     */
    async getConversionStatus(conversionId) {
        return this.apiRequest(
            `/api/status/${encodeURIComponent(conversionId)}`,
            {},
            'getConversionStatus'
        );
    }

    /**
     * Get server configuration
     * @returns {Promise<Object>} - Server configuration
     */
    async getServerConfig() {
        try {
            return await this.apiRequest('/api/config', {}, 'getServerConfig');
        } catch (error) {
            // Special handling for server config to provide a more user-friendly error
            throw new Error('Failed to load server configuration');
        }
    }

    /**
     * List converted files
     * @returns {Promise<Array>} - Array of file objects
     */
    async listFiles() {
        return this.apiRequest('/api/files', {}, 'listFiles');
    }

    /**
     * Delete a converted file
     * @param {String} fileName - Name of file to delete
     * @returns {Promise<Object>} - Delete response
     */
    async deleteFile(fileName) {
        return this.apiRequest(
            `/api/delete-file/${encodeURIComponent(fileName)}`,
            { method: 'DELETE' },
            'deleteFile'
        );
    }

    /**
     * Abort an active conversion
     * @param {String} conversionId - ID of conversion to abort
     * @returns {Promise<Object>} - Abort response
     */
    async abortConversion(conversionId) {
        return this.apiRequest(
            `/api/abort/${encodeURIComponent(conversionId)}`,
            { method: 'POST' },
            'abortConversion'
        );
    }

    /**
     * List active conversions
     * @returns {Promise<Array>} - Array of active conversion objects
     */
    async listActiveConversions() {
        return this.apiRequest('/api/active-conversions', {}, 'listActiveConversions');
    }
}

// Export as singleton
export default new ApiService();