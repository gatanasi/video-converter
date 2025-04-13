/**
 * API Service - Handles all API interactions with the backend
 */
class ApiService {
    constructor() {
        this.SERVER_URL = window.location.origin;
        this.API_PREFIX = "/api";
    }

    /**
     * Fetch videos from Google Drive folder
     * @param {string} folderId - Google Drive folder ID
     * @returns {Promise} - Promise resolving to array of video file objects
     */
    async listVideos(folderId) {
        try {
            const response = await fetch(`${this.SERVER_URL}${this.API_PREFIX}/list-videos?folderId=${encodeURIComponent(folderId)}`);
            if (!response.ok) {
                return this._handleErrorResponse(response);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching video list:', error);
            throw error;
        }
    }

    /**
     * Request conversion of a Google Drive video
     * @param {Object} conversionData - Conversion parameters
     * @returns {Promise} - Promise resolving to conversion response
     */
    async convertFromDrive(conversionData) {
        try {
            const response = await fetch(`${this.SERVER_URL}${this.API_PREFIX}/convert-from-drive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(conversionData)
            });
            
            if (!response.ok) {
                return this._handleErrorResponse(response);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error requesting conversion:', error);
            throw error;
        }
    }

    /**
     * Get conversion status
     * @param {string} conversionId - ID of the conversion job
     * @returns {Promise} - Promise resolving to status object
     */
    async getConversionStatus(conversionId) {
        try {
            const response = await fetch(`${this.SERVER_URL}${this.API_PREFIX}/status/${conversionId}`);
            if (response.status === 404) {
                throw new Error(`Status not found for ID ${conversionId}. It might be expired or invalid.`);
            }
            if (!response.ok) {
                return this._handleErrorResponse(response);
            }
            return await response.json();
        } catch (error) {
            console.error(`Error checking status for conversion ${conversionId}:`, error);
            throw error;
        }
    }

    /**
     * List converted files
     * @returns {Promise} - Promise resolving to array of file objects
     */
    async listFiles() {
        try {
            const response = await fetch(`${this.SERVER_URL}${this.API_PREFIX}/files`);
            if (!response.ok) {
                return this._handleErrorResponse(response);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching converted files:', error);
            throw error;
        }
    }

    /**
     * Delete a converted file
     * @param {string} filename - Name of file to delete
     * @returns {Promise} - Promise resolving to deletion response
     */
    async deleteFile(filename) {
        try {
            const response = await fetch(`${this.SERVER_URL}${this.API_PREFIX}/delete-file/${encodeURIComponent(filename)}`, { 
                method: 'DELETE'
            });
            
            if (!response.ok) {
                return this._handleErrorResponse(response);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error deleting file:', error);
            throw error;
        }
    }

    /**
     * Abort an active conversion
     * @param {string} conversionId - ID of conversion to abort
     * @returns {Promise} - Promise resolving to abort response
     */
    async abortConversion(conversionId) {
        try {
            const response = await fetch(`${this.SERVER_URL}${this.API_PREFIX}/abort/${conversionId}`, { 
                method: 'POST'
            });
            
            if (!response.ok) {
                return this._handleErrorResponse(response);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error aborting conversion:', error);
            throw error;
        }
    }

    /**
     * Get active conversions
     * @returns {Promise} - Promise resolving to array of active conversion objects
     */
    async getActiveConversions() {
        try {
            const response = await fetch(`${this.SERVER_URL}${this.API_PREFIX}/active-conversions`);
            
            if (!response.ok) {
                return this._handleErrorResponse(response);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching active conversions:', error);
            throw error;
        }
    }

    /**
     * Get server configuration
     * @returns {Promise} - Promise resolving to config object
     */
    async getServerConfig() {
        try {
            const response = await fetch(`${this.SERVER_URL}${this.API_PREFIX}/config`);
            
            if (!response.ok) {
                return this._handleErrorResponse(response);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching server configuration:', error);
            throw error;
        }
    }

    /**
     * Get download URL for file
     * @param {string} filename - Name of the file to download
     * @returns {string} - Full URL for downloading the file
     */
    getDownloadUrl(filename) {
        return `${this.SERVER_URL}/download/${encodeURIComponent(filename)}`;
    }

    /**
     * Handle error responses from the API
     * @private
     * @param {Response} response - Fetch API response object
     * @returns {Promise} - Promise that rejects with error details
     */
    async _handleErrorResponse(response) {
        try {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server error: ${response.status}`);
        } catch (err) {
            if (err instanceof SyntaxError) {
                // Response wasn't valid JSON
                throw new Error(`Server error: ${response.status}`);
            }
            throw err; // Re-throw the error from the try block
        }
    }
}

// Export as singleton
export default new ApiService();