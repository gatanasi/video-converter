import { formatBytes, showMessage } from '../utils/utils.js';
import apiService from '../api/apiService.js';
import { FileInfo, Container } from '../types.js';

export class FileListComponent {
    private container: HTMLElement;
    private messageContainer: HTMLElement;
    private fileList: FileInfo[];

    // Use Container interface for options
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
                this.container.innerHTML = `<div class="empty-message error">Failed to load files: ${errorMessage}</div>`;
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
            emptyMessage.textContent = 'No converted files found.';
            this.container.appendChild(emptyMessage);
            return;
        }

        const table = document.createElement('table');
        table.className = 'file-table';

        table.innerHTML = `
            <thead>
                <tr>
                    <th class="file-name">Name</th>
                    <th class="file-size">Size</th>
                    <th class="file-date">Date Created</th>
                    <th class="file-actions">Actions</th>
                </tr>
            </thead>
        `;

        const tbody = document.createElement('tbody');
        this.fileList.forEach(file => {
            const row = this.createFileRow(file);
            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        this.container.appendChild(table);
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

        row.innerHTML = `
            <td class="file-name" title="${file.name}">${file.name}</td>
            <td class="file-size">${sizeFormatted}</td>
            <td class="file-date">${formattedDate}</td>
            <td class="file-actions">
                <a href="${file.url}" class="btn small success" title="Download file">↓</a>
                <button class="btn small danger delete" title="Delete file">X</button>
            </td>
        `;

        const fileNameCell = row.querySelector<HTMLTableCellElement>('.file-name');
        // Make the filename cell clickable and add copy functionality
        if (fileNameCell) {
            fileNameCell.style.cursor = 'pointer';
            fileNameCell.title = 'Click to copy download link';
            fileNameCell.addEventListener('click', async () => {
                try {
                    const absoluteUrl = `${window.location.origin}${file.url}`;
                    await navigator.clipboard.writeText(absoluteUrl);
                    showMessage(this.messageContainer, `Copied download link for "${file.name}" to clipboard.`, 'info', 3000); // Show short confirmation
                } catch (err: unknown) {
                    console.error('Failed to copy link: ', err);
                    showMessage(this.messageContainer, 'Failed to copy download link.', 'error');
                }
            });
        }

        const deleteButton = row.querySelector<HTMLButtonElement>('button.delete');
        deleteButton?.addEventListener('click', () => this.deleteFile(file.name, row)); // Pass row for potential UI feedback

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
