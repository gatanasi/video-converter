import { afterEach, describe, expect, it, vi } from 'vitest';

const GLOBAL_ENV_KEY = '__VIDEO_CONVERTER_ENV__';

type GlobalWithEnv = typeof globalThis & {
    [GLOBAL_ENV_KEY]?: Record<string, string | undefined>;
};

async function loadConfigManager() {
    vi.resetModules();
    const module = await import('./configManager');
    return module.default;
}

afterEach(() => {
    delete (globalThis as GlobalWithEnv)[GLOBAL_ENV_KEY];
});

describe('apiBaseUrl resolution', () => {
    it('defaults to an empty string when no environment is provided', async () => {
        const configManager = await loadConfigManager();
        expect(configManager.apiBaseUrl).toBe('');
    });

    it('reads the base URL from the injected global environment', async () => {
        (globalThis as GlobalWithEnv)[GLOBAL_ENV_KEY] = {
            VIDEO_CONVERTER_API_BASE_URL: 'https://api.example.com',
        };
        const configManager = await loadConfigManager();
        expect(configManager.apiBaseUrl).toBe('https://api.example.com');
    });

    it('trims whitespace and trailing slashes', async () => {
        (globalThis as GlobalWithEnv)[GLOBAL_ENV_KEY] = {
            VIDEO_CONVERTER_API_BASE_URL: '  https://api.example.com//  ',
        };
        const configManager = await loadConfigManager();
        expect(configManager.apiBaseUrl).toBe('https://api.example.com');
    });
});

describe('extractFolderId', () => {
    it('extracts the ID from a Drive folder URL', async () => {
        const configManager = await loadConfigManager();
        expect(
            configManager.extractFolderId('https://drive.google.com/drive/folders/1AbC_dEf-123?usp=sharing')
        ).toBe('1AbC_dEf-123');
    });

    it('extracts the ID from a legacy folderview URL', async () => {
        const configManager = await loadConfigManager();
        expect(
            configManager.extractFolderId('https://drive.google.com/folderview?id=1AbC_dEf-123')
        ).toBe('1AbC_dEf-123');
    });

    it('accepts a bare folder ID', async () => {
        const configManager = await loadConfigManager();
        expect(configManager.extractFolderId(' 1AbC_dEf-123 ')).toBe('1AbC_dEf-123');
    });

    it('returns an empty string for invalid input', async () => {
        const configManager = await loadConfigManager();
        expect(configManager.extractFolderId('')).toBe('');
        expect(configManager.extractFolderId('not a folder id!')).toBe('');
    });
});
