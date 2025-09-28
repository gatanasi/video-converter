import { ConversionOptions, DriveConversionRequest, ConversionResponse, ConversionStatus, ServerConfig, FileInfo, Video } from '../types';
import configManager from '../config/configManager.js';

type ActiveConversionStreamCallbacks = {
    onStatus: (status: ConversionStatus) => void;
    onRemoval: (conversionId: string) => void;
    onError?: (error: Event | Error) => void;
};

/**
 * API Service - Handles all communication with the backend API.
 */
class ApiService {
    private baseUrl: string;
    private readonly supportsEventSource: boolean;
    private readonly activeConversionStreamEndpoint = '/api/conversions/stream';
    private readonly activeConversionReconnectDelay = 15000;
    private activeConversionEventSource: EventSource | null;
    private activeConversionCallbacks: Set<ActiveConversionStreamCallbacks>;
    private activeConversionReconnectTimer: number | null;

    constructor() {
        this.baseUrl = configManager.apiBaseUrl || '';
        this.supportsEventSource = typeof window !== 'undefined' && 'EventSource' in window;
        this.activeConversionEventSource = null;
        this.activeConversionReconnectTimer = null;
        this.activeConversionCallbacks = new Set();
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
     * @param onProgress - Optional callback to track upload progress (0 to 100).
     * @returns Promise that resolves to the conversion initiation response.
     */
    async uploadAndConvert(
        file: File, 
        options: ConversionOptions, 
        onProgress?: (percent: number) => void
    ): Promise<ConversionResponse> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const formData = new FormData();
            
            formData.append('videoFile', file);
            formData.append('targetFormat', options.targetFormat);
            formData.append('quality', options.quality);
            formData.append('reverseVideo', String(options.reverseVideo));
            formData.append('removeSound', String(options.removeSound));
            
            // Set up upload progress event
            if (onProgress) {
                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable) {
                        const percent = Math.round((event.loaded / event.total) * 100);
                        onProgress(percent);
                    }
                });
            }
            
            // Handle response
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        resolve(response);
                    } catch (error) {
                        reject(new Error(`Failed to parse server response: ${xhr.responseText}`));
                    }
                } else {
                    let errorMessage = `Upload failed with HTTP status ${xhr.status}`;
                    try {
                        const errorResponse = JSON.parse(xhr.responseText);
                        if (errorResponse && errorResponse.error) {
                            errorMessage = `Upload failed: ${errorResponse.error} (Status: ${xhr.status})`;
                        } else if (xhr.statusText) {
                            errorMessage = `Upload failed: ${xhr.statusText} (Status: ${xhr.status})`;
                        }
                    } catch (e) {
                        // If response is not JSON or parsing fails, use status text or default
                        if (xhr.statusText) {
                            errorMessage = `Upload failed: ${xhr.statusText} (Status: ${xhr.status})`;
                        }
                        // Keep the default message if statusText is also unavailable
                    }
                    reject(new Error(errorMessage));
                }
            });
            
            // Handle network errors
            xhr.addEventListener('error', () => {
                reject(new Error('Network error occurred during upload'));
            });
            
            // Handle timeout
            xhr.addEventListener('timeout', () => {
                reject(new Error('Upload request timed out'));
            });
            
            // Handle abort
            xhr.addEventListener('abort', () => {
                reject(new Error('Upload was aborted by the client'));
            });
            
            // Open and send the request
            xhr.open('POST', `${this.baseUrl}/api/convert/upload`);
            xhr.timeout = 900000; // 15 minutes timeout
            xhr.send(formData);
        });
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

    /**
     * Returns true when the environment supports Server-Sent Events for active conversions.
     */
    isActiveConversionStreamSupported(): boolean {
        return this.supportsEventSource;
    }

    /**
     * Subscribes to the active conversions SSE stream. Returns an unsubscribe function.
     */
    connectActiveConversionsStream(callbacks: ActiveConversionStreamCallbacks): () => void {
        if (!this.supportsEventSource) {
            callbacks.onError?.(new Error('Server-sent events are not supported in this environment.'));
            return () => undefined;
        }

        this.activeConversionCallbacks.add(callbacks);
        this.ensureActiveConversionStream();

        return () => {
            this.activeConversionCallbacks.delete(callbacks);
            if (this.activeConversionCallbacks.size === 0) {
                this.teardownActiveConversionStream();
            }
        };
    }

    private ensureActiveConversionStream(): void {
        if (!this.supportsEventSource || this.activeConversionEventSource) {
            return;
        }

        // Cancel pending reconnect timers since we're about to establish a new connection.
        if (this.activeConversionReconnectTimer !== null) {
            window.clearTimeout(this.activeConversionReconnectTimer);
            this.activeConversionReconnectTimer = null;
        }

        const streamUrl = `${this.baseUrl}${this.activeConversionStreamEndpoint}`;

        try {
            const eventSource = new EventSource(streamUrl);
            this.activeConversionEventSource = eventSource;

            eventSource.addEventListener('status', this.handleActiveConversionStatusEvent as EventListener);
            eventSource.addEventListener('removed', this.handleActiveConversionRemovalEvent as EventListener);
            eventSource.onopen = () => {
                if (this.activeConversionReconnectTimer !== null) {
                    window.clearTimeout(this.activeConversionReconnectTimer);
                    this.activeConversionReconnectTimer = null;
                }
            };
            eventSource.onerror = (event: Event) => {
                this.notifyActiveConversionError(event);
                this.restartActiveConversionStream();
            };
        } catch (error: unknown) {
            this.notifyActiveConversionError(error instanceof Error ? error : new Error(String(error)));
            this.restartActiveConversionStream();
        }
    }

    private restartActiveConversionStream(): void {
        this.teardownActiveConversionStream();

        if (this.activeConversionCallbacks.size === 0 || !this.supportsEventSource) {
            return;
        }

        if (this.activeConversionReconnectTimer !== null) {
            return;
        }

        this.activeConversionReconnectTimer = window.setTimeout(() => {
            this.activeConversionReconnectTimer = null;
            this.ensureActiveConversionStream();
        }, this.activeConversionReconnectDelay);
    }

    private teardownActiveConversionStream(): void {
        if (this.activeConversionEventSource) {
            this.activeConversionEventSource.removeEventListener('status', this.handleActiveConversionStatusEvent as EventListener);
            this.activeConversionEventSource.removeEventListener('removed', this.handleActiveConversionRemovalEvent as EventListener);
            this.activeConversionEventSource.onerror = null;
            this.activeConversionEventSource.onopen = null;
            this.activeConversionEventSource.close();
            this.activeConversionEventSource = null;
        }

        if (this.activeConversionReconnectTimer !== null) {
            window.clearTimeout(this.activeConversionReconnectTimer);
            this.activeConversionReconnectTimer = null;
        }
    }

    private handleActiveConversionStatusEvent = (event: MessageEvent): void => {
        try {
            const payload = JSON.parse(event.data) as {
                conversionId?: string;
                status?: ConversionStatus;
            };

            if (!payload || !payload.status) {
                return;
            }

            const conversionId = payload.status.id || payload.conversionId;
            if (!conversionId) {
                return;
            }

            const normalizedStatus: ConversionStatus = {
                ...payload.status,
                id: conversionId,
            };

            this.notifyActiveConversionStatus(normalizedStatus);
        } catch (error: unknown) {
            this.notifyActiveConversionError(error instanceof Error ? error : new Error(String(error)));
        }
    };

    private handleActiveConversionRemovalEvent = (event: MessageEvent): void => {
        try {
            const payload = JSON.parse(event.data) as {
                conversionId?: string;
                status?: ConversionStatus;
            };

            const conversionId = payload?.conversionId || payload?.status?.id;
            if (!conversionId) {
                return;
            }

            this.notifyActiveConversionRemoval(conversionId);
        } catch (error: unknown) {
            this.notifyActiveConversionError(error instanceof Error ? error : new Error(String(error)));
        }
    };

    private notifyActiveConversionStatus(status: ConversionStatus): void {
        this.activeConversionCallbacks.forEach(callbacks => {
            callbacks.onStatus(status);
        });
    }

    private notifyActiveConversionRemoval(conversionId: string): void {
        this.activeConversionCallbacks.forEach(callbacks => {
            callbacks.onRemoval(conversionId);
        });
    }

    private notifyActiveConversionError(error: Event | Error): void {
        this.activeConversionCallbacks.forEach(callbacks => {
            callbacks.onError?.(error);
        });
    }
}

// Export a single instance (singleton pattern)
export default new ApiService();