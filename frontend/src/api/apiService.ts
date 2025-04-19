import { ConversionOptions, DriveConversionRequest, ConversionResponse, ConversionStatus, ServerConfig, FileInfo, Video } from '../types';

/**
 * API Service - Handles all communication with the backend API.
 */
class ApiService {
    private baseUrl: string;

    constructor() {
        this.baseUrl = ''; // Assumes API is served from the same origin
    }

    /**
     * Helper method to make API requests and handle common errors.
     * @param endpoint - API endpoint path (e.g., '/api/users').
     * @param options - Fetch options (method, headers, body, etc.).
     * @param errorContext - Context for error logging.
     * @returns The JSON response data.
     * @throws Throws an error if the request fails or response is not ok.
     */
    private async apiRequest<T = any>(endpoint: string, options: RequestInit = {}, errorContext: string = 'API call'): Promise<T> {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, options);

            if (!response.ok) {
                let errorData: { error?: string } = {};
                try {
                    // Try to parse JSON error response from backend
                    errorData = await response.json();
                } catch (e) {
                    // If response is not JSON or parsing fails, use status text
                    errorData = { error: response.statusText || `HTTP error ${response.status}` };
                }
                // Use the error message from backend if available, otherwise construct one
                throw new Error(errorData.error || `HTTP error ${response.status}`);
            }

            // Handle cases where response might be empty (e.g., 204 No Content)
            if (response.status === 204) {
                // Return an empty object or null based on expected T, casting to T
                // For simplicity, returning {} as any might suffice if T allows it.
                // A more robust solution might require checking T or specific handling.
                return {} as T;
            }

            // Assuming response is JSON for all other successful statuses
            return await response.json() as T;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`API error in ${errorContext}:`, message);
            // Re-throw the original error or a new error with context
            // Throwing the original error preserves stack trace if it's an Error instance
            if (error instanceof Error) {
                throw error;
            } else {
                throw new Error(`API request failed in ${errorContext}: ${message}`);
            }
        }
    }

    /**
     * Fetch videos from a Google Drive folder.
     * @param folderId - Google Drive folder ID.
     * @returns Array of video file objects.
     */
    async listVideos(folderId: string): Promise<Video[]> {
        return this.apiRequest<Video[]>(
            `/api/videos/drive?folderId=${encodeURIComponent(folderId)}`,
            {},
            'listVideos'
        );
    }

    /**
     * Start video conversion for a file from Google Drive.
     * @param conversionData - Data required for conversion (fileId, fileName, etc.).
     * @returns Conversion initiation response.
     */
    async convertFromDrive(conversionData: DriveConversionRequest): Promise<ConversionResponse> {
        return this.apiRequest<ConversionResponse>(
            `/api/convert/drive`,
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
     * @param file - The video file to upload.
     * @param options - Conversion options (targetFormat, reverseVideo, removeSound).
     * @returns Conversion initiation response.
     */
    async uploadAndConvert(file: File, options: ConversionOptions): Promise<ConversionResponse> {
        const formData = new FormData();
        formData.append('videoFile', file);
        formData.append('targetFormat', options.targetFormat);
        // FormData values are typically strings
        formData.append('reverseVideo', String(options.reverseVideo));
        formData.append('removeSound', String(options.removeSound));

        // Note: We don't set Content-Type header when using FormData with fetch,
        // the browser sets it correctly including the boundary.
        return this.apiRequest<ConversionResponse>(
            `/api/convert/upload`,
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
     * @param conversionId - ID of the conversion.
     * @returns Conversion status object.
     */
    async getConversionStatus(conversionId: string): Promise<ConversionStatus> {
        return this.apiRequest<ConversionStatus>(
            `/api/conversion/status/${encodeURIComponent(conversionId)}`,
            {},
            'getConversionStatus'
        );
    }

    /**
     * Get server configuration relevant to the frontend.
     * @returns Server configuration object.
     */
    async getServerConfig(): Promise<ServerConfig> {
        try {
            return await this.apiRequest<ServerConfig>('/api/config', {}, 'getServerConfig');
        } catch (error: unknown) {
            // Provide a more user-friendly error for this specific case
            throw new Error('Failed to load server configuration. Please check the connection or server status.');
        }
    }

    /**
     * List previously converted files available for download.
     * @returns Array of converted file objects.
     */
    async listFiles(): Promise<FileInfo[]> {
        return this.apiRequest<FileInfo[]>('/api/files', {}, 'listFiles');
    }

    /**
     * Delete a converted file from the server.
     * @param fileName - Name of the file to delete.
     * @returns Deletion confirmation response.
     */
    async deleteFile(fileName: string): Promise<{ success: boolean; message: string }> {
        return this.apiRequest<{ success: boolean; message: string }>(
            `/api/file/delete/${encodeURIComponent(fileName)}`,
            { method: 'DELETE' },
            'deleteFile'
        );
    }

    /**
     * Request to abort an active conversion.
     * @param conversionId - ID of the conversion to abort.
     * @returns Abort confirmation response.
     */
    async abortConversion(conversionId: string): Promise<ConversionResponse> {
        return this.apiRequest<ConversionResponse>(
            `/api/conversion/abort/${encodeURIComponent(conversionId)}`,
            { method: 'POST' }, // Using POST as it changes server state
            'abortConversion'
        );
    }

    /**
     * List all currently active (running or queued) conversions.
     * @returns Array of active conversion info objects.
     */
    async listActiveConversions(): Promise<ConversionStatus[]> {
        // Assuming the backend returns the same structure as ConversionStatus for active ones
        return this.apiRequest<ConversionStatus[]>('/api/conversions/active', {}, 'listActiveConversions');
    }
}

// Export a single instance (singleton pattern)
export default new ApiService();