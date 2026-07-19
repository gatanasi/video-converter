import { formatBytes, showMessage, escapeHtml, copyTextToClipboard } from '../utils/utils.js';
import apiService from '../api/apiService.js';
import { FileInfo, Container } from '../types.js';

const DOWNLOAD_ICON = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
        stroke-linejoin="round" aria-hidden="true">
        <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>`;

const LINK_ICON = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
        stroke-linejoin="round" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>`;

const DELETE_ICON = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
        stroke-linejoin="round" aria-hidden="true">
        <path d="M3 6h18" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>`;

export class FileListComponent {
    private container: HTMLElement;
    private messageContainer: HTMLElement;
    private fileList: FileInfo[];

    constructor(options: Container) {
        this.container = options.container;
        this.messageContainer = options.messageContainer;
        this.fileList = [];
    }

    async loadFiles(): Promise<void> {
        try {
            const files: FileInfo[] = await apiService.listFiles();

            this.fileList = files || [];
            this.displayFiles();
        } catch (error: unknown) {
            console.error('Error loading files:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            // Show error in the file list container itself if it's empty
            if (this.fileList.length === 0) {
                this.container.innerHTML = `<div class="empty-message">Failed to load files: ${escapeHtml(errorMessage)}</div>`;
            } else {
                // Show error in the main message area if list already has content
                showMessage(this.messageContainer, `Failed to load files: ${errorMessage}`, 'error');
            }
        }
    }

    displayFiles(): void {
        this.container.innerHTML = '';

        if (this.fileList.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.textContent = 'No converted files yet. Convert a video and it will show up here.';
            this.container.appendChild(emptyMessage);
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'table-wrapper';

        const table = document.createElement('table');
        table.className = 'data-table file-table';

        table.innerHTML = `
            <thead>
                <tr>
                    <th class="file-name">Name</th>
                    <th class="file-size">Size</th>
                    <th class="file-date">Created</th>
                    <th class="file-actions"><span class="sr-only">Actions</span></th>
                </tr>
            </thead>
        `;

        const tbody = document.createElement('tbody');
        this.fileList.forEach(file => {
            const row = this.createFileRow(file);
            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        wrapper.appendChild(table);
        this.container.appendChild(wrapper);
    }

    createFileRow(file: FileInfo): HTMLTableRowElement {
        const row = document.createElement('tr');

        let formattedDate = 'N/A';
        if (file.modTime) {
            try {
                const date = new Date(file.modTime);
                formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            } catch (e) { console.error("Error formatting date:", e); }
        }
        const sizeFormatted = file.size ? formatBytes(file.size) : 'N/A';

        const safeFileName = escapeHtml(file.name);
        const safeUrl = escapeHtml(file.url);
        row.innerHTML = `
            <td class="file-name" title="${safeFileName}">${safeFileName}</td>
            <td class="file-size cell-muted">${sizeFormatted}</td>
            <td class="file-date cell-muted">${formattedDate}</td>
            <td class="file-actions">
                <div class="file-actions-wrapper">
                    <a href="${safeUrl}" class="btn-icon" download="${safeFileName}"
                        title="Download" aria-label="Download ${safeFileName}">${DOWNLOAD_ICON}</a>
                    <button class="btn-icon copy-link" type="button"
                        title="Copy download link" aria-label="Copy download link for ${safeFileName}">${LINK_ICON}</button>
                    <button class="btn-icon danger delete" type="button"
                        title="Delete" aria-label="Delete ${safeFileName}">${DELETE_ICON}</button>
                </div>
            </td>
        `;

        const copyButton = row.querySelector<HTMLButtonElement>('button.copy-link');
        copyButton?.addEventListener('click', async () => {
            try {
                const absoluteUrl = `${window.location.origin}${file.url}`;
                await copyTextToClipboard(absoluteUrl);
                showMessage(this.messageContainer, `Copied download link for "${file.name}" to clipboard.`, 'info', 3000);
            } catch (err: unknown) {
                console.error('Failed to copy link: ', err);
                showMessage(this.messageContainer, 'Failed to copy download link.', 'error');
            }
        });

        const deleteButton = row.querySelector<HTMLButtonElement>('button.delete');
        deleteButton?.addEventListener('click', () => this.deleteFile(file.name, row));

        return row;
    }

    async deleteFile(fileName: string, rowElement: HTMLTableRowElement): Promise<void> {
        rowElement.style.opacity = '0.5';
        const deleteButton = rowElement.querySelector<HTMLButtonElement>('button.delete');
        if (deleteButton) deleteButton.disabled = true;

        if (!confirm(`Are you sure you want to delete "${fileName}"? This cannot be undone.`)) {
            rowElement.style.opacity = '1'; // Restore appearance
            if (deleteButton) deleteButton.disabled = false;
            return;
        }

        try {
            await apiService.deleteFile(fileName);
            showMessage(this.messageContainer, `File "${fileName}" deleted successfully.`, 'success');
            // Animate removal before reloading
            rowElement.style.transition = 'opacity 0.3s ease-out';
            rowElement.style.opacity = '0';
            setTimeout(() => {
                this.loadFiles(); // Refresh the list after animation
            }, 300);
        } catch (error: unknown) {
            console.error('Error deleting file:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            showMessage(this.messageContainer, `Failed to delete file "${fileName}": ${errorMessage}`, 'error');
            rowElement.style.opacity = '1'; // Restore appearance on error
            if (deleteButton) deleteButton.disabled = false;
        }
    }
}
