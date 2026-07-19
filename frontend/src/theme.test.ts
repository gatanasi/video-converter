import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeController } from './theme';

function createToggleButton(): HTMLButtonElement {
    const button = document.createElement('button');
    document.body.appendChild(button);
    return button;
}

beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    document.body.innerHTML = '';
});

describe('ThemeController', () => {
    it('defaults to dark when no preference is stored', () => {
        const controller = new ThemeController(createToggleButton());
        expect(controller.theme).toBe('dark');
        expect(document.documentElement.dataset.theme).toBe('dark');
    });

    it('defaults to dark even when the system prefers light', () => {
        // No matchMedia involvement: dark is the product default, not the OS preference
        vi.stubGlobal('matchMedia', () => {
            throw new Error('matchMedia should not be consulted');
        });
        const controller = new ThemeController(null);
        expect(controller.theme).toBe('dark');
    });

    it('applies a stored light preference', () => {
        localStorage.setItem('vc-theme', 'light');
        const controller = new ThemeController(createToggleButton());
        expect(controller.theme).toBe('light');
        expect(document.documentElement.dataset.theme).toBe('light');
    });

    it('ignores invalid stored values and falls back to dark', () => {
        localStorage.setItem('vc-theme', 'sepia');
        const controller = new ThemeController(null);
        expect(controller.theme).toBe('dark');
    });

    it('toggles the theme on button click and persists the choice', () => {
        const button = createToggleButton();
        new ThemeController(button);

        button.click();
        expect(document.documentElement.dataset.theme).toBe('light');
        expect(localStorage.getItem('vc-theme')).toBe('light');

        button.click();
        expect(document.documentElement.dataset.theme).toBe('dark');
        expect(localStorage.getItem('vc-theme')).toBe('dark');
    });

    it('updates the toggle button label for the next theme', () => {
        const button = createToggleButton();
        new ThemeController(button);
        expect(button.getAttribute('aria-label')).toBe('Switch to light theme');

        button.click();
        expect(button.getAttribute('aria-label')).toBe('Switch to dark theme');
    });

    it('survives unavailable localStorage', () => {
        const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('denied');
        });
        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('denied');
        });

        const controller = new ThemeController(createToggleButton());
        expect(controller.theme).toBe('dark');
        expect(() => controller.toggle()).not.toThrow();
        expect(controller.theme).toBe('light');

        getItem.mockRestore();
        setItem.mockRestore();
    });
});
