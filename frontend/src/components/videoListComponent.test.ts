import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoListComponent } from './videoListComponent';
import { Video } from '../types';

const VIDEOS: Video[] = [
    { id: 'a', name: 'clip-a.mp4', size: 1048576, mimeType: 'video/mp4', modifiedTime: '2026-01-05T10:00:00Z' },
    { id: 'b', name: 'clip-b.mov', size: 2097152, mimeType: 'video/quicktime', modifiedTime: '2026-02-06T11:30:00Z' },
    { id: 'c', name: 'clip-c.mp4', mimeType: 'video/mp4' },
];

describe('VideoListComponent', () => {
    let container: HTMLElement;
    let onSelectVideos: ReturnType<typeof vi.fn<(selectedVideos: Video[]) => void>>;
    let component: VideoListComponent;

    beforeEach(() => {
        document.body.innerHTML = '';
        container = document.createElement('div');
        const messageContainer = document.createElement('div');
        document.body.append(container, messageContainer);
        onSelectVideos = vi.fn<(selectedVideos: Video[]) => void>();
        component = new VideoListComponent({ container, messageContainer, onSelectVideos });
    });

    it('requires an onSelectVideos callback', () => {
        expect(() => new VideoListComponent({
            container,
            messageContainer: document.createElement('div'),
        })).toThrow();
    });

    it('renders a row per video with metadata', () => {
        component.displayVideos(VIDEOS);
        const rows = container.querySelectorAll('tbody tr');
        expect(rows).toHaveLength(3);
        expect(rows[0].textContent).toContain('clip-a.mp4');
        expect(rows[0].textContent).toContain('1 MB');
        expect(rows[0].textContent).toContain('mp4');
        expect(rows[2].textContent).toContain('N/A'); // no size
    });

    it('shows an empty message when a loaded folder has no videos', () => {
        component.displayVideos([]);
        expect(container.querySelector('.empty-message')?.textContent).toContain('No videos found');
    });

    it('clears silently without an empty message', () => {
        component.displayVideos(VIDEOS);
        component.clear();
        expect(container.innerHTML).toBe('');
    });

    it('toggles selection when a row is clicked', () => {
        component.displayVideos(VIDEOS);
        const row = container.querySelector<HTMLTableRowElement>('tr[data-id="a"]')!;

        row.click();
        expect(row.classList.contains('selected')).toBe(true);
        expect(onSelectVideos).toHaveBeenLastCalledWith([VIDEOS[0]]);

        row.click();
        expect(row.classList.contains('selected')).toBe(false);
        expect(onSelectVideos).toHaveBeenLastCalledWith([]);
    });

    it('updates the selection counter', () => {
        component.displayVideos(VIDEOS);
        container.querySelector<HTMLTableRowElement>('tr[data-id="a"]')!.click();
        container.querySelector<HTMLTableRowElement>('tr[data-id="b"]')!.click();
        expect(container.querySelector('.selection-counter')?.textContent).toBe('2 videos selected');
    });

    it('selects and deselects all videos via the control buttons', () => {
        component.displayVideos(VIDEOS);

        container.querySelector<HTMLButtonElement>('#select-all-btn')!.click();
        expect(onSelectVideos).toHaveBeenLastCalledWith(VIDEOS);
        expect(container.querySelectorAll('tr.selected')).toHaveLength(3);

        const headerCheckbox = container.querySelector<HTMLInputElement>('#header-checkbox')!;
        expect(headerCheckbox.checked).toBe(true);

        container.querySelector<HTMLButtonElement>('#deselect-all-btn')!.click();
        expect(onSelectVideos).toHaveBeenLastCalledWith([]);
        expect(container.querySelectorAll('tr.selected')).toHaveLength(0);
    });

    it('drives selection through the header checkbox', () => {
        component.displayVideos(VIDEOS);
        const headerCheckbox = container.querySelector<HTMLInputElement>('#header-checkbox')!;

        headerCheckbox.checked = true;
        headerCheckbox.dispatchEvent(new Event('change'));
        expect(onSelectVideos).toHaveBeenLastCalledWith(VIDEOS);

        headerCheckbox.checked = false;
        headerCheckbox.dispatchEvent(new Event('change'));
        expect(onSelectVideos).toHaveBeenLastCalledWith([]);
    });

    it('marks the header checkbox indeterminate for partial selections', () => {
        component.displayVideos(VIDEOS);
        container.querySelector<HTMLTableRowElement>('tr[data-id="a"]')!.click();
        const headerCheckbox = container.querySelector<HTMLInputElement>('#header-checkbox')!;
        expect(headerCheckbox.indeterminate).toBe(true);
        expect(headerCheckbox.checked).toBe(false);
    });
});
