import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActiveConversionsComponent } from './activeConversionsComponent';
import apiService from '../api/apiService.js';
import { ConversionStatus } from '../types';

vi.mock('../api/apiService.js', () => ({
    default: {
        isActiveConversionStreamSupported: vi.fn(),
        connectActiveConversionsStream: vi.fn(),
        listActiveConversions: vi.fn(),
        getConversionStatus: vi.fn(),
        abortConversion: vi.fn(),
    },
}));

type StreamCallbacks = {
    onStatus: (status: ConversionStatus) => void;
    onRemoval: (conversionId: string) => void;
    onError?: (error: Event | Error) => void;
};

function runningStatus(overrides: Partial<ConversionStatus> = {}): ConversionStatus {
    return {
        id: 'conv-1',
        progress: 40,
        complete: false,
        format: 'mp4',
        quality: 'default',
        fileName: 'movie.avi',
        ...overrides,
    };
}

describe('ActiveConversionsComponent (SSE mode)', () => {
    let container: HTMLElement;
    let messageContainer: HTMLElement;
    let callbacks: StreamCallbacks;
    let unsubscribe: ReturnType<typeof vi.fn<() => void>>;
    let onConversionComplete: ReturnType<typeof vi.fn<() => void>>;
    let component: ActiveConversionsComponent;

    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '';
        container = document.createElement('div');
        container.classList.add('hidden');
        messageContainer = document.createElement('div');
        document.body.append(container, messageContainer);

        unsubscribe = vi.fn<() => void>();
        vi.mocked(apiService.isActiveConversionStreamSupported).mockReturnValue(true);
        vi.mocked(apiService.connectActiveConversionsStream).mockImplementation((cb) => {
            callbacks = cb;
            return unsubscribe;
        });

        onConversionComplete = vi.fn<() => void>();
        component = new ActiveConversionsComponent({
            container,
            messageContainer,
            onConversionComplete,
        });
    });

    afterEach(() => {
        component.destroy();
        vi.useRealTimers();
    });

    it('stays hidden while there are no conversions', () => {
        expect(container.classList.contains('hidden')).toBe(true);
    });

    it('shows a progress item when a conversion status arrives', () => {
        callbacks.onStatus(runningStatus());

        expect(container.classList.contains('hidden')).toBe(false);
        const item = container.querySelector<HTMLElement>('.multi-progress-item')!;
        expect(item.dataset.id).toBe('conv-1');
        expect(item.querySelector('.multi-progress-label')?.textContent).toContain('movie → MP4');
        expect(item.querySelector('.multi-progress-percent')?.textContent).toBe('40%');
        expect(item.querySelector('.abort-button')).not.toBeNull();
    });

    it('updates progress for subsequent statuses', () => {
        callbacks.onStatus(runningStatus());
        callbacks.onStatus(runningStatus({ progress: 80 }));

        const bar = container.querySelector<HTMLElement>('.multi-progress-bar')!;
        expect(bar.style.width).toBe('80%');
        expect(container.querySelectorAll('.multi-progress-item')).toHaveLength(1);
    });

    it('adds a download link on completion and removes the item after the delay', () => {
        callbacks.onStatus(runningStatus());
        callbacks.onStatus(runningStatus({
            progress: 100,
            complete: true,
            downloadUrl: '/download/movie.mp4',
        }));

        const item = container.querySelector<HTMLElement>('.multi-progress-item')!;
        expect(item.classList.contains('complete')).toBe(true);
        expect(item.querySelector('.abort-button')).toBeNull();
        const link = item.querySelector<HTMLAnchorElement>('.multi-progress-download')!;
        expect(link.getAttribute('href')).toBe('/download/movie.mp4');
        expect(onConversionComplete).toHaveBeenCalled();

        vi.advanceTimersByTime(10000);
        expect(container.querySelector('.multi-progress-item')).toBeNull();
        expect(container.classList.contains('hidden')).toBe(true);
    });

    it('shows the error and removes the item when a conversion fails', () => {
        callbacks.onStatus(runningStatus());
        callbacks.onStatus(runningStatus({
            complete: true,
            error: 'ffmpeg exploded',
        }));

        const item = container.querySelector<HTMLElement>('.multi-progress-item')!;
        expect(item.classList.contains('error')).toBe(true);
        expect(item.querySelector('.multi-progress-error')?.textContent).toBe('ffmpeg exploded');

        vi.advanceTimersByTime(10000);
        expect(container.classList.contains('hidden')).toBe(true);
    });

    it('ignores completed statuses for conversions it never tracked', () => {
        callbacks.onStatus(runningStatus({ complete: true, progress: 100 }));
        expect(container.querySelector('.multi-progress-item')).toBeNull();
        expect(container.classList.contains('hidden')).toBe(true);
    });

    it('removes items when the server reports removal', () => {
        callbacks.onStatus(runningStatus());
        callbacks.onRemoval('conv-1');
        expect(container.querySelector('.multi-progress-item')).toBeNull();
        expect(container.classList.contains('hidden')).toBe(true);
    });

    it('aborts a conversion via the abort button', async () => {
        vi.mocked(apiService.abortConversion).mockResolvedValue({ success: true });
        callbacks.onStatus(runningStatus());

        container.querySelector<HTMLButtonElement>('.abort-button')!.click();
        await vi.waitFor(() => {
            expect(apiService.abortConversion).toHaveBeenCalledWith('conv-1');
        });

        const item = container.querySelector<HTMLElement>('.multi-progress-item')!;
        expect(item.classList.contains('aborted')).toBe(true);
        expect(item.querySelector('.multi-progress-status')?.textContent).toBe('Conversion aborted');

        vi.advanceTimersByTime(5000);
        expect(container.querySelector('.multi-progress-item')).toBeNull();
    });

    it('unsubscribes from the stream on destroy', () => {
        component.destroy();
        expect(unsubscribe).toHaveBeenCalled();
    });
});

describe('ActiveConversionsComponent (polling fallback)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '';
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('polls the active conversion list when SSE is unsupported', async () => {
        const container = document.createElement('div');
        container.classList.add('hidden');
        document.body.appendChild(container);

        vi.mocked(apiService.isActiveConversionStreamSupported).mockReturnValue(false);
        vi.mocked(apiService.listActiveConversions).mockResolvedValue([runningStatus()]);

        const component = new ActiveConversionsComponent({
            container,
            messageContainer: document.createElement('div'),
        });

        await vi.waitFor(() => {
            expect(apiService.listActiveConversions).toHaveBeenCalled();
        });
        await vi.waitFor(() => {
            expect(container.querySelector('.multi-progress-item')).not.toBeNull();
        });
        expect(container.classList.contains('hidden')).toBe(false);

        component.destroy();
    });
});
