/**
 * Theme controller. Dark is the application default; light is only applied
 * when the user explicitly chose it. The choice is persisted in localStorage.
 */
export type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'vc-theme';

export class ThemeController {
    private currentTheme: Theme = 'dark';
    private readonly toggleButton: HTMLButtonElement | null;

    constructor(toggleButton: HTMLButtonElement | null) {
        this.toggleButton = toggleButton;
        this.toggleButton?.addEventListener('click', () => this.toggle());
        this.apply(this.readStoredTheme() === 'light' ? 'light' : 'dark');
    }

    get theme(): Theme {
        return this.currentTheme;
    }

    toggle(): void {
        const nextTheme: Theme = this.currentTheme === 'light' ? 'dark' : 'light';
        try {
            localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        } catch {
            // Persisting the preference is best-effort
        }
        this.apply(nextTheme);
    }

    private readStoredTheme(): string | null {
        try {
            return localStorage.getItem(THEME_STORAGE_KEY);
        } catch {
            // Storage unavailable (e.g. privacy mode): fall back to dark
            return null;
        }
    }

    private apply(theme: Theme): void {
        this.currentTheme = theme;
        document.documentElement.dataset.theme = theme;
        if (this.toggleButton) {
            const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
            this.toggleButton.setAttribute('aria-label', label);
            this.toggleButton.title = label;
        }
    }
}
