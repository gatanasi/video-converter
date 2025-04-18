/**
 * API Service - Handles all communication with the backend API.
 */
class ApiService {
    constructor() {
        this.baseUrl = ''; // Assumes API is served from the same origin
    }

    /**
     * Helper method to make API requests and handle common errors.
     * @param {String} endpoint - API endpoint path (e.g., '/api/users').
     * @param {Object} [options={}] - Fetch options (method, headers, body, etc.).
     * @param {String} [errorContext='API call'] - Context for error logging.
     * @returns {Promise<Object>} - The JSON response data.
     * @throws {Error} - Throws an error if the request fails or response is not ok.
     */
    async apiRequest(endpoint, options = {}, errorContext = 'API call') {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, options);

            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    // If response is not JSON, use status text
                    errorData = { error: response.statusText || `HTTP error ${response.status}` };
                }
                throw new Error(errorData.error || `HTTP error ${response.status}`);
            }

            // Handle cases where response might be empty (e.g., 204 No Content)
            if (response.status === 204) {
                return {}; // Return empty object for consistency
            }

            return await response.json();
        } catch (error) {
            console.error(`API error in ${errorContext}:`, error.message);
            throw error; // Re-throw the error for the caller to handle
        }
    }

    /**
     * Fetch videos from a Google Drive folder.
     * @param {String} folderId - Google Drive folder ID.
     * @returns {Promise<Array>} - Array of video file objects.
     */
    async listVideos(folderId) {
        return this.apiRequest(
            `/api/list-videos?folderId=${encodeURIComponent(folderId)}`,
            {},
            'listVideos'
        );
    }

    /**
     * Start video conversion for a file from Google Drive.
     * @param {Object} conversionData - Data required for conversion (fileId, fileName, etc.).
     * @returns {Promise<Object>} - Conversion initiation response.
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
     * Upload a video file and start conversion.
     * @param {File} file - The video file to upload.
     * @param {Object} options - Conversion options (targetFormat, reverseVideo, removeSound).
     * @returns {Promise<Object>} - Conversion initiation response.
     */
    async uploadAndConvert(file, options) {
        const formData = new FormData();
        formData.append('videoFile', file);
        formData.append('targetFormat', options.targetFormat);
        formData.append('reverseVideo', options.reverseVideo);
        formData.append('removeSound', options.removeSound);

        // Note: We don't set Content-Type header when using FormData with fetch,
        // the browser sets it correctly including the boundary.
        return this.apiRequest(
            `/api/upload-convert`,
            {
                method: 'POST',
                body: formData
                // No 'Content-Type' header needed here
            },
            'uploadAndConvert'
        );
    }

    /**
     * Get the status of a specific conversion.
     * @param {String} conversionId - ID of the conversion.
     * @returns {Promise<Object>} - Conversion status object.
     */
    async getConversionStatus(conversionId) {
        return this.apiRequest(
            `/api/status/${encodeURIComponent(conversionId)}`,
            {},
            'getConversionStatus'
        );
    }

    /**
     * Get server configuration relevant to the frontend.
     * @returns {Promise<Object>} - Server configuration object.
     */
    async getServerConfig() {
        try {
            return await this.apiRequest('/api/config', {}, 'getServerConfig');
        } catch (error) {
            // Provide a more user-friendly error for this specific case
            throw new Error('Failed to load server configuration. Please check the connection or server status.');
        }
    }

    /**
     * List previously converted files available for download.
     * @returns {Promise<Array>} - Array of converted file objects.
     */
    async listFiles() {
        return this.apiRequest('/api/files', {}, 'listFiles');
    }

    /**
     * Delete a converted file from the server.
     * @param {String} fileName - Name of the file to delete.
     * @returns {Promise<Object>} - Deletion confirmation response.
     */
    async deleteFile(fileName) {
        return this.apiRequest(
            `/api/delete-file/${encodeURIComponent(fileName)}`,
            { method: 'DELETE' },
            'deleteFile'
        );
    }

    /**
     * Request to abort an active conversion.
     * @param {String} conversionId - ID of the conversion to abort.
     * @returns {Promise<Object>} - Abort confirmation response.
     */
    async abortConversion(conversionId) {
        return this.apiRequest(
            `/api/abort/${encodeURIComponent(conversionId)}`,
            { method: 'POST' }, // Using POST as it changes server state
            'abortConversion'
        );
    }

    /**
     * List all currently active (running or queued) conversions.
     * @returns {Promise<Array>} - Array of active conversion info objects.
     */
    async listActiveConversions() {
        return this.apiRequest('/api/active-conversions', {}, 'listActiveConversions');
    }
}

// Export a single instance (singleton pattern)
export default new ApiService();