import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileListComponent } from './fileListComponent';
import apiService from '../api/apiService.js';
import { FileInfo } from '../types';

vi.mock('../api/apiService.js', () => ({
    default: {
        listFiles: vi.fn(),
        deleteFile: vi.fn(),
    },
}));

const FILES: FileInfo[] = [
    { name: 'holiday.mp4', size: 5242880, modTime: '2026-03-01T09:00:00Z', url: '/download/holiday.mp4' },
    { name: 'clip <1>.mov', size: 1024, modTime: '2026-03-02T10:00:00Z', url: '/download/clip%20%3C1%3E.mov' },
];

describe('FileListComponent', () => {
    let container: HTMLElement;
    let messageContainer: HTMLElement;
    let component: FileListComponent;

    beforeEach(() => {
        document.body.innerHTML = '';
        container = document.createElement('div');
        messageContainer = document.createElement('div');
        messageContainer.classList.add('hidden');
        document.body.append(container, messageContainer);
        component = new FileListComponent({ container, messageContainer });
        vi.mocked(apiService.listFiles).mockResolvedValue(FILES);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('renders a row per file with actions', async () => {
        await component.loadFiles();

        const rows = container.querySelectorAll('tbody tr');
        expect(rows).toHaveLength(2);
        expect(rows[0].querySelector('.file-name')?.textContent).toBe('holiday.mp4');
        expect(rows[0].querySelector('.file-size')?.textContent).toBe('5 MB');
        expect(rows[0].querySelector('a[download]')).not.toBeNull();
        expect(rows[0].querySelector('button.copy-link')).not.toBeNull();
        expect(rows[0].querySelector('button.delete')).not.toBeNull();
    });

    it('escapes file names to prevent HTML injection', async () => {
        await component.loadFiles();
        const nameCell = container.querySelectorAll('tbody tr')[1].querySelector('.file-name');
        expect(nameCell?.textContent).toBe('clip <1>.mov');
        expect(nameCell?.innerHTML).toContain('&lt;1&gt;');
    });

    it('shows an empty state when there are no files', async () => {
        vi.mocked(apiService.listFiles).mockResolvedValue([]);
        await component.loadFiles();
        expect(container.querySelector('.empty-message')?.textContent).toContain('No converted files yet');
    });

    it('shows the load error inside the container when the list is empty', async () => {
        vi.mocked(apiService.listFiles).mockRejectedValue(new Error('backend down'));
        await component.loadFiles();
        expect(container.querySelector('.empty-message')?.textContent).toContain('backend down');
    });

    it('copies the absolute download link to the clipboard', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

        await component.loadFiles();
        container.querySelector<HTMLButtonElement>('button.copy-link')!.click();
        await vi.waitFor(() => {
            expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/download/holiday.mp4`);
        });
        expect(messageContainer.textContent).toContain('Copied download link');
    });

    it('does not delete when the confirmation is declined', async () => {
        vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));

        await component.loadFiles();
        const row = container.querySelector<HTMLTableRowElement>('tbody tr')!;
        row.querySelector<HTMLButtonElement>('button.delete')!.click();

        await vi.waitFor(() => {
            expect(row.style.opacity).toBe('1');
        });
        expect(apiService.deleteFile).not.toHaveBeenCalled();
    });

    it('deletes the file and refreshes the list when confirmed', async () => {
        vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
        vi.mocked(apiService.deleteFile).mockResolvedValue({ success: true, message: 'ok' });

        await component.loadFiles();
        container.querySelector<HTMLButtonElement>('button.delete')!.click();

        await vi.waitFor(() => {
            expect(apiService.deleteFile).toHaveBeenCalledWith('holiday.mp4');
        });
        expect(messageContainer.textContent).toContain('deleted successfully');
    });

    it('restores the row when deletion fails', async () => {
        vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
        vi.mocked(apiService.deleteFile).mockRejectedValue(new Error('locked'));

        await component.loadFiles();
        const row = container.querySelector<HTMLTableRowElement>('tbody tr')!;
        row.querySelector<HTMLButtonElement>('button.delete')!.click();

        await vi.waitFor(() => {
            expect(messageContainer.textContent).toContain('Failed to delete file');
        });
        expect(row.style.opacity).toBe('1');
    });
});
