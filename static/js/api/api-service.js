/**
 * API Service - Handles all communication with the backend API.
 */
export class ApiService { // Export class directly
    constructor(baseUrl = '') { // Accept baseUrl in constructor
        this.baseUrl = baseUrl;
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
        const url = `${this.baseUrl}${endpoint}`;
        try {
            const response = await fetch(url, options);

            if (!response.ok) {
                let errorData;
                try {
                    // Try to parse error response, default to status text
                    errorData = await response.json();
                } catch (e) {
                    errorData = { message: response.statusText || `HTTP error ${response.status}` };
                }
                // Use 'message' field if available, otherwise construct one
                throw new Error(errorData.message || errorData.error || `HTTP error ${response.status}`);
            }

            // Handle cases where response might be empty (e.g., 204 No Content)
            if (response.status === 204) {
                return {}; // Return empty object for consistency
            }

            return await response.json();
        } catch (error) {
            console.error(`API error in ${errorContext} (${url}):`, error.message);
            // Ensure the error thrown has a meaningful message
            throw new Error(error.message || `Request failed: ${errorContext}`);
        }
    }

    /**
     * Fetch application configuration from the backend.
     * @returns {Promise<Object>} - The configuration object.
     */
    async fetchConfig() {
        return this.apiRequest('/api/config', {}, 'fetchConfig');
    }

    /**
     * Fetch available conversion formats.
     * @returns {Promise<Array<string>>}
     */
    async fetchAvailableFormats() {
        // Assuming the backend endpoint is /api/formats
        return this.apiRequest('/api/formats', {}, 'fetchAvailableFormats');
    }

    /**
     * Fetch videos from Google Drive.
     * @param {string} folderId - The Google Drive folder ID.
     * @returns {Promise<Array>} - Array of video file objects.
     */
    async fetchVideos(folderId) {
        if (!folderId) {
            console.error("fetchVideos called without a folderId.");
            // Or throw an error, or return an empty array, depending on desired handling
            return Promise.reject(new Error("Google Drive Folder ID is required to fetch videos."));
        }
        const params = new URLSearchParams({ folderId });
        const endpoint = `/api/videos?${params.toString()}`;
        return this.apiRequest(endpoint, {}, 'fetchVideos');
    }

    /**
     * Request conversion for selected Drive video IDs.
     * @param {string} videoId - Google Drive file ID.
     * @param {string} fileName - Original filename.
     * @param {string} mimeType - Original file mime type.
     * @param {string} targetFormat - The desired output format.
     * @param {object} options - Additional conversion options (e.g., { reverseVideo: boolean, removeSound: boolean }).
     * @returns {Promise<Object>} - Conversion initiation response.
     */
    async requestConversion(videoId, fileName, mimeType, targetFormat, options = {}) { // Updated parameters
        return this.apiRequest(
            `/api/convert/drive`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileId: videoId, // Changed from videoIds array
                    fileName: fileName, // Added fileName
                    mimeType: mimeType, // Added mimeType
                    targetFormat,
                    reverseVideo: options.reverseVideo || false,
                    removeSound: options.removeSound || false
                })
            },
            'requestConversion'
        );
    }

    /**
     * Upload a video file and start conversion.
     * @param {File} file - The video file to upload.
     * @param {string} targetFormat - The desired output format.
     * @param {object} options - Additional conversion options (e.g., { reverseVideo: boolean, removeSound: boolean }).
     * @returns {Promise<Object>} - Conversion initiation response.
     */
    async uploadAndConvert(file, targetFormat, options = {}) { // Added options parameter
        const formData = new FormData();
        formData.append('videoFile', file);
        formData.append('targetFormat', targetFormat);
        // Add other options if the backend supports them (e.g., reverse, sound)
        formData.append('reverseVideo', options.reverseVideo || false); // Send new options
        formData.append('removeSound', options.removeSound || false); // Send new options
        return this.apiRequest(
            `/api/convert/upload`,
            {
                method: 'POST',
                body: formData
            },
            'uploadAndConvert'
        );
    }

    /**
     * Fetch all currently active (running or queued) conversions.
     * @returns {Promise<Array>} - Array of active conversion info objects.
     */
    async fetchActiveConversions() {
        return this.apiRequest('/api/conversions/active', {}, 'fetchActiveConversions');
    }

    /**
     * Request to abort an active conversion.
     * @param {String} conversionId - ID of the conversion to abort.
     * @returns {Promise<Object>} - Abort confirmation response.
     */
    async abortConversion(conversionId) {
        return this.apiRequest(
            `/api/conversions/${encodeURIComponent(conversionId)}/abort`,
            { method: 'POST' },
            'abortConversion'
        );
    }
}