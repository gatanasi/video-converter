/**
 * Defines shared TypeScript types and interfaces for the frontend application.
 */

interface InputEvent extends Event {
    target: HTMLInputElement & EventTarget;
}

export interface ConversionOptions {
    targetFormat: string;
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
    downloadUrl?: string;
    fileName?: string;
}

export interface ConversionItem {
    fileName: string;
    format: string;
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
    onSelectVideo?: (selectedVideos: Video[]) => void;
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
