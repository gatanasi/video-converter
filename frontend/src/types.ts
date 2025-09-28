/**
 * Defines shared TypeScript types and interfaces for the frontend application.
 */
export interface InputEvent extends Event {
    target: HTMLInputElement & EventTarget;
}

export type ConversionQuality = 'default' | 'high' | 'fast';

export interface ConversionOptions {
    targetFormat: string;
    quality: ConversionQuality;
    reverseVideo: boolean;
    removeSound: boolean;
}

export interface DriveConversionRequest extends ConversionOptions {
    fileId: string;
    fileName: string;
}

export interface ConversionResponse {
    success: boolean;
    message?: string;
    error?: string;
    conversionId?: string;
}

export interface ConversionStatus {
    id: string;
    progress: number;
    complete: boolean;
    error?: string;
    format: string;
    quality?: ConversionQuality;
    downloadUrl?: string;
    fileName?: string;
}

export interface ConversionItem {
    fileName: string;
    format: string;
    quality?: ConversionQuality;
    element: HTMLElement;
    aborted?: boolean;
    timeoutId?: number;
}

export interface Container {
    container: HTMLElement;
    messageContainer: HTMLElement;
}

export interface ActiveConversionsContainer extends Container {
    onConversionComplete?: () => void;
}

export interface VideoListContainer extends Container {
    onSelectVideos?: (selectedVideos: Video[]) => void;
}

export interface ServerConfig {
    defaultDriveFolderId: string;
}

export interface FileInfo {
    name: string;
    size: number;
    modTime: string; // ISO 8601 string
    url: string;
}

export interface Video {
    id: string;
    name: string;
    size?: number;
    mimeType?: string;
    modifiedTime?: string; // ISO 8601 string
}
