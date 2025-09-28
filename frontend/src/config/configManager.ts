type EnvRecord = Record<string, string | undefined>;

interface EnvironmentConfig {
    apiBaseUrl: string;
}

const GLOBAL_ENV_KEY = '__VIDEO_CONVERTER_ENV__';
const API_BASE_URL_KEY = 'VIDEO_CONVERTER_API_BASE_URL';

/**
 * Configuration Manager - Provides utility functions related to configuration, like parsing IDs.
 * Also centralises access to runtime configuration sourced from environment variables.
 */
class ConfigManager {
    private readonly environment: EnvironmentConfig;

    constructor() {
        this.environment = {
            apiBaseUrl: this.resolveApiBaseUrl()
        };
    }

    /**
     * Retrieve the API base URL from the environment, falling back to an empty string.
     */
    get apiBaseUrl(): string {
        return this.environment.apiBaseUrl;
    }

    private resolveApiBaseUrl(): string {
        const rawValue = this.getEnvValue(API_BASE_URL_KEY);
        if (!rawValue) {
            return '';
        }

        // Normalise by trimming whitespace and trailing slashes to keep endpoint joining predictable.
        const trimmed = rawValue.trim();
        return trimmed.replace(/\/+$/u, '');
    }

    private getEnvValue(key: string): string | undefined {
        const fromGlobal = this.getGlobalEnvValue(key);
        if (typeof fromGlobal === 'string' && fromGlobal.trim() !== '') {
            return fromGlobal;
        }

        const fromProcess = this.getProcessEnvValue(key);
        if (typeof fromProcess === 'string' && fromProcess.trim() !== '') {
            return fromProcess;
        }

        return undefined;
    }

    private getGlobalEnvValue(key: string): string | undefined {
        const globalEnv = (globalThis as typeof globalThis & {
            [GLOBAL_ENV_KEY]?: EnvRecord;
        })[GLOBAL_ENV_KEY];

        if (globalEnv && typeof globalEnv === 'object') {
            const value = globalEnv[key];
            if (typeof value === 'string') {
                return value;
            }
        }

        return undefined;
    }

    private getProcessEnvValue(key: string): string | undefined {
        const processEnv = (globalThis as typeof globalThis & {
            process?: { env?: EnvRecord };
        }).process?.env;

        if (processEnv && typeof processEnv === 'object') {
            return processEnv[key];
        }

        return undefined;
    }

    /**
     * Extract Google Drive folder ID from a URL or ID string.
     * @param {String} input - Google Drive folder ID or URL.
     * @returns {String} Extracted folder ID or empty string if invalid.
     */
    extractFolderId(input: string): string {
        input = input ? input.trim() : '';
        if (!input) return '';

        // Regex to find folder ID in common Google Drive URL formats
        const urlMatch = input.match(/drive\.google\.com\/(?:drive\/folders\/|folderview\?id=)([a-zA-Z0-9_-]+)/);
        if (urlMatch && urlMatch[1]) {
            return urlMatch[1];
        }

        // Basic check if it looks like an ID (alphanumeric, -, _)
        const idMatch = input.match(/^[a-zA-Z0-9_-]+$/);
        if (idMatch) {
            return input; // Assume it's an ID
        }

        return ''; // Invalid input
    }
}

// Export as singleton
export default new ConfigManager();