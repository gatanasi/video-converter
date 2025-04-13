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
     * Fetch videos from Google Drive folder
     * @param {String} folderId - Google Drive folder ID
     * @returns {Promise<Array>} - Array of video objects
     */
    async listVideos(folderId) {
        try {
            const response = await fetch(`${this.baseUrl}/api/list-videos?folderId=${encodeURIComponent(folderId)}`);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error ${response.status}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('API error in listVideos:', error);
            throw error;
        }
    }

    /**
     * Start video conversion from Google Drive
     * @param {Object} conversionData - Data for conversion
     * @returns {Promise<Object>} - Conversion response
     */
    async convertFromDrive(conversionData) {
        try {
            const response = await fetch(`${this.baseUrl}/api/convert-from-drive`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(conversionData),
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('API error in convertFromDrive:', error);
            throw error;
        }
    }

    /**
     * Get conversion status
     * @param {String} conversionId - ID of the conversion
     * @returns {Promise<Object>} - Status object
     */
    async getConversionStatus(conversionId) {
        try {
            const response = await fetch(`${this.baseUrl}/api/status/${encodeURIComponent(conversionId)}`);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('API error in getConversionStatus:', error);
            throw error;
        }
    }

    /**
     * Get server configuration
     * @returns {Promise<Object>} - Server configuration
     */
    async getServerConfig() {
        try {
            const response = await fetch(`${this.baseUrl}/api/config`);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('API error in getServerConfig:', error);
            throw new Error('Failed to load server configuration');
        }
    }

    /**
     * List converted files
     * @returns {Promise<Array>} - Array of file objects
     */
    async listFiles() {
        try {
            const response = await fetch(`${this.baseUrl}/api/files`);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('API error in listFiles:', error);
            throw error;
        }
    }

    /**
     * Delete a converted file
     * @param {String} fileName - Name of file to delete
     * @returns {Promise<Object>} - Delete response
     */
    async deleteFile(fileName) {
        try {
            const response = await fetch(`${this.baseUrl}/api/delete-file/${encodeURIComponent(fileName)}`, {
                method: 'DELETE',
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('API error in deleteFile:', error);
            throw error;
        }
    }

    /**
     * Abort an active conversion
     * @param {String} conversionId - ID of conversion to abort
     * @returns {Promise<Object>} - Abort response
     */
    async abortConversion(conversionId) {
        try {
            const response = await fetch(`${this.baseUrl}/api/abort/${encodeURIComponent(conversionId)}`, {
                method: 'POST',
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('API error in abortConversion:', error);
            throw error;
        }
    }

    /**
     * List active conversions
     * @returns {Promise<Array>} - Array of active conversion objects
     */
    async listActiveConversions() {
        try {
            const response = await fetch(`${this.baseUrl}/api/active-conversions`);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('API error in listActiveConversions:', error);
            throw error;
        }
    }
}

// Export as singleton
export default new ApiService();