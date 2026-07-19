import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { clearMessages, createProgressItem, escapeHtml, formatBytes, formatDuration, showMessage } from './utils';

describe('formatBytes', () => {
    it('formats zero and invalid input as 0 Bytes', () => {
        expect(formatBytes(0)).toBe('0 Bytes');
        expect(formatBytes(NaN)).toBe('0 Bytes');
    });

    it('formats sizes with binary units', () => {
        expect(formatBytes(1024)).toBe('1 KB');
        expect(formatBytes(1536)).toBe('1.5 KB');
        expect(formatBytes(1048576)).toBe('1 MB');
        expect(formatBytes(1073741824)).toBe('1 GB');
    });

    it('respects the decimals argument', () => {
        expect(formatBytes(1536, 0)).toBe('2 KB');
        expect(formatBytes(1234567, 1)).toBe('1.2 MB');
    });
});

describe('formatDuration', () => {
    it('handles invalid input', () => {
        expect(formatDuration(NaN)).toBe('00:00');
        expect(formatDuration(-5)).toBe('00:00');
    });

    it('formats minutes and seconds', () => {
        expect(formatDuration(0)).toBe('00:00');
        expect(formatDuration(75)).toBe('01:15');
    });

    it('includes hours when needed', () => {
        expect(formatDuration(3661)).toBe('01:01:01');
    });
});

describe('escapeHtml', () => {
    it('escapes HTML special characters', () => {
        expect(escapeHtml(`<img src="x" onerror='alert(1)'> & more`)).toBe(
            '&lt;img src=&quot;x&quot; onerror=&#039;alert(1)&#039;&gt; &amp; more'
        );
    });

    it('leaves plain text untouched', () => {
        expect(escapeHtml('plain text')).toBe('plain text');
    });
});

describe('showMessage / clearMessages', () => {
    let container: HTMLElement;

    beforeEach(() => {
        vi.useFakeTimers();
        container = document.createElement('div');
        container.classList.add('hidden');
        document.body.appendChild(container);
    });

    afterEach(() => {
        vi.useRealTimers();
        container.remove();
    });

    it('renders a message with the right type and reveals the container', () => {
        showMessage(container, 'Hello', 'error');
        const message = container.querySelector('.message');
        expect(message?.textContent).toBe('Hello');
        expect(message?.classList.contains('error')).toBe(true);
        expect(message?.getAttribute('role')).toBe('alert');
        expect(container.classList.contains('hidden')).toBe(false);
    });

    it('replaces any previous message', () => {
        showMessage(container, 'First', 'info', 0);
        showMessage(container, 'Second', 'warning');
        expect(container.querySelectorAll('.message')).toHaveLength(1);
        expect(container.textContent).toBe('Second');
    });

    it('auto-hides info and success messages after the timeout', () => {
        showMessage(container, 'Saved', 'success', 3000);
        expect(container.querySelector('.message')).not.toBeNull();
        vi.advanceTimersByTime(3000);
        expect(container.querySelector('.message')).toBeNull();
        expect(container.classList.contains('hidden')).toBe(true);
    });

    it('keeps error messages until cleared', () => {
        showMessage(container, 'Boom', 'error', 3000);
        vi.advanceTimersByTime(10000);
        expect(container.querySelector('.message')).not.toBeNull();
        clearMessages(container);
        expect(container.children).toHaveLength(0);
        expect(container.classList.contains('hidden')).toBe(true);
    });
});

describe('createProgressItem', () => {
    it('creates a progress item with label, percent and bar', () => {
        const item = createProgressItem('video.mp4 → MP4');
        expect(item.querySelector('.multi-progress-label')?.textContent).toBe('video.mp4 → MP4');
        expect(item.querySelector('.multi-progress-percent')?.textContent).toBe('0%');
        const bar = item.querySelector<HTMLElement>('.multi-progress-bar');
        expect(bar?.style.width).toBe('0%');
    });
});
