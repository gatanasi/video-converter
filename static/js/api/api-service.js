/**
 * API Service - Handles all communication with the backend API.
 */
export class ApiService { // Export class directly
    constructor(baseUrl = '') { // Accept baseUrl in constructor
        this.baseUrl = baseUrl;
        console.log(`ApiService initialized with base URL: ${this.baseUrl}`);
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
        console.log(`API Request: ${options.method || 'GET'} ${url}`); // Log request
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
     * Fetch available conversion formats.
     * @returns {Promise<Array<string>>}
     */
    async fetchAvailableFormats() {
        // Assuming the backend endpoint is /api/formats
        return this.apiRequest('/api/formats', {}, 'fetchAvailableFormats');
    }

    /**
     * Fetch videos from Google Drive, optionally filtering by search term.
     * @param {string} [searchTerm=''] - Optional search term.
     * @returns {Promise<Array>} - Array of video file objects.
     */
    async fetchVideos(searchTerm = '') {
        const endpoint = searchTerm
            ? `/api/videos?search=${encodeURIComponent(searchTerm)}`
            : '/api/videos';
        return this.apiRequest(endpoint, {}, 'fetchVideos');
    }

    /**
     * Request conversion for selected Drive video IDs.
     * @param {string[]} videoIds - Array of Google Drive file IDs.
     * @param {string} targetFormat - The desired output format.
     * @returns {Promise<Object>} - Conversion initiation response.
     */
    async requestConversion(videoIds, targetFormat) {
        return this.apiRequest(
            `/api/convert/drive`, // Example endpoint
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoIds, targetFormat })
            },
            'requestConversion'
        );
    }

    /**
     * Upload a video file and start conversion.
     * @param {File} file - The video file to upload.
     * @param {string} targetFormat - The desired output format.
     * @returns {Promise<Object>} - Conversion initiation response.
     */
    async uploadAndConvert(file, targetFormat) {
        const formData = new FormData();
        formData.append('videoFile', file);
        formData.append('targetFormat', targetFormat);
        // Add other options if the backend supports them (e.g., reverse, sound)
        // formData.append('reverseVideo', options.reverseVideo);
        // formData.append('removeSound', options.removeSound);

        // Note: We don't set Content-Type header when using FormData with fetch,
        // the browser sets it correctly including the boundary.
        return this.apiRequest(
            `/api/convert/upload`, // Example endpoint
            {
                method: 'POST',
                body: formData
                // No 'Content-Type' header needed here
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
            { method: 'POST' }, // Using POST as it changes server state
            'abortConversion'
        );
    }

    // --- Optional/Unused methods (kept for potential future use) ---

    // Removed unused getConversionStatus method

    // Removed unused listFiles method

    // Removed unused deleteFile method
}