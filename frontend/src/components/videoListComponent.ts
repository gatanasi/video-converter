import { VideoListContainer, Video } from '../types';
import { formatBytes } from '../utils/utils';

/**
 * Video List Component - Displays videos from Google Drive and handles selection.
 */
export class VideoListComponent {
    private container: HTMLElement;
    private onSelectVideos: (selectedVideos: Video[]) => void;
    private videoList: Video[];
    private selectedVideos: Map<string, Video>;
    private headerCheckbox: HTMLInputElement | null;
    private selectionCounter: HTMLElement | null;
    private deselectAllBtn: HTMLButtonElement | null;

    // Use Container interface for options, ensure onSelectVideo is provided
    constructor(options: VideoListContainer) {
        if (!options.onSelectVideo) {
            throw new Error('VideoListComponent requires an onSelectVideo callback.');
        }
        this.container = options.container;
        this.onSelectVideos = options.onSelectVideo;
        this.videoList = [];
        this.selectedVideos = new Map<string, Video>();
        this.headerCheckbox = null;
        this.selectionCounter = null;
        this.deselectAllBtn = null;
    }

    displayVideos(videos: Video[] | null): void {
        this.videoList = videos || [];
        this.container.innerHTML = '';
        this.selectedVideos.clear();

        if (this.videoList.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.textContent = 'No videos found in this folder.';
            this.container.appendChild(emptyMessage);
            this.updateSelectionUI(); // Ensure controls are hidden/disabled
            return;
        }

        this.createControls();
        this.createTable(this.videoList);
        this.updateSelectionUI();
    }

    createControls(): void {
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'selection-controls';
        controlsDiv.innerHTML = `
            <button id="select-all-btn" class="btn small">Select All</button>
            <button id="deselect-all-btn" class="btn small">Deselect All</button>
            <div class="selection-counter">0 videos selected</div>
        `;
        this.container.appendChild(controlsDiv);

        const selectAllBtn = controlsDiv.querySelector<HTMLButtonElement>('#select-all-btn');
        this.deselectAllBtn = controlsDiv.querySelector<HTMLButtonElement>('#deselect-all-btn');
        this.selectionCounter = controlsDiv.querySelector<HTMLElement>('.selection-counter');

        selectAllBtn?.addEventListener('click', () => this.selectAllVideos());
        this.deselectAllBtn?.addEventListener('click', () => this.deselectAllVideos());
    }

    createTable(videos: Video[]): void {
        const table = document.createElement('table');
        table.className = 'video-table';

        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th class="video-select"><input type="checkbox" id="header-checkbox" title="Select/Deselect All"></th>
                <th class="video-name">Name</th>
                <th class="video-size">Size</th>
                <th class="video-type">Type</th>
                <th class="video-date">Modified Date</th>
            </tr>
        `;
        this.headerCheckbox = thead.querySelector<HTMLInputElement>('#header-checkbox');
        this.headerCheckbox?.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (target.checked) {
                this.selectAllVideos();
            } else {
                this.deselectAllVideos();
            }
        });
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        videos.forEach(video => {
            const row = this.createTableRow(video);
            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        this.container.appendChild(table);
    }

    createTableRow(video: Video): HTMLTableRowElement {
        const row = document.createElement('tr');
        row.dataset.id = video.id;

        let formattedDate = 'N/A';
        if (video.modifiedTime) {
            try {
                const date = new Date(video.modifiedTime);
                formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            } catch (e) { console.error("Error formatting date:", e); }
        }

        const mimeTypeShort = video.mimeType ? video.mimeType.split('/')[1] || 'unknown' : 'unknown';
        const sizeFormatted = video.size ? formatBytes(video.size) : 'N/A';

        row.innerHTML = `
            <td class="video-select">
                <input type="checkbox" class="video-checkbox" data-id="${video.id}">
            </td>
            <td class="video-name" title="${video.name}">${video.name}</td>
            <td class="video-size">${sizeFormatted}</td>
            <td class="video-type">${mimeTypeShort}</td>
            <td class="video-date">${formattedDate}</td>
        `;

        const checkbox = row.querySelector<HTMLInputElement>('.video-checkbox');
        checkbox?.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            this.toggleSelection(video.id, target.checked, row);
        });

        // Allow clicking anywhere on the row (except checkbox cell) to toggle
        row.addEventListener('click', (e: MouseEvent) => {
            if ((e.target as HTMLElement).closest('.video-select')) return; // Ignore clicks on the checkbox cell itself
            if (checkbox) {
                checkbox.checked = !checkbox.checked;
                this.toggleSelection(video.id, checkbox.checked, row);
            }
        });

        return row;
    }

    toggleSelection(videoId: string, isSelected: boolean, rowElement: HTMLTableRowElement): void {
        const video = this.videoList.find(v => v.id === videoId);
        if (!video) return; // Video not found

        if (isSelected) {
            this.selectedVideos.set(videoId, video);
            rowElement.classList.add('selected');
        } else {
            this.selectedVideos.delete(videoId);
            rowElement.classList.remove('selected');
        }

        this.updateSelectionUI();
        this.onSelectVideos(Array.from(this.selectedVideos.values()));
    }

    selectAllVideos(): void {
        this.videoList.forEach(video => {
            if (!this.selectedVideos.has(video.id)) {
                this.selectedVideos.set(video.id, video);
                const row = this.container.querySelector<HTMLTableRowElement>(`tr[data-id="${video.id}"]`);
                const checkbox = row?.querySelector<HTMLInputElement>('.video-checkbox');
                if (row) row.classList.add('selected');
                if (checkbox) checkbox.checked = true;
            }
        });
        this.updateSelectionUI();
        this.onSelectVideos(Array.from(this.selectedVideos.values()));
    }

    deselectAllVideos(): void {
        this.selectedVideos.clear();
        this.container.querySelectorAll<HTMLTableRowElement>('tr.selected').forEach(row => {
            row.classList.remove('selected');
            const checkbox = row.querySelector<HTMLInputElement>('.video-checkbox');
            if (checkbox) checkbox.checked = false;
        });
        this.updateSelectionUI();
        this.onSelectVideos([]);
    }

    updateSelectionUI(): void {
        const count = this.selectedVideos.size;
        const allVisibleChecked = this.videoList.length > 0 && count === this.videoList.length;

        if (this.headerCheckbox) {
            this.headerCheckbox.checked = allVisibleChecked;
            this.headerCheckbox.indeterminate = count > 0 && !allVisibleChecked;
            this.headerCheckbox.disabled = this.videoList.length === 0;
        }
        if (this.selectionCounter) {
            this.selectionCounter.textContent = `${count} video${count !== 1 ? 's' : ''} selected`;
            this.selectionCounter.style.display = count > 0 ? 'block' : 'none';
        }
        if (this.deselectAllBtn) {
            this.deselectAllBtn.style.display = count > 0 ? 'inline-block' : 'none';
        }

        // Update row styles based on selection map
        this.container.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach(row => {
            const id = row.dataset.id;
            if (id) {
                row.classList.toggle('selected', this.selectedVideos.has(id));
            }
        });
    }

    notifySelectionChange(): void {
        if (this.onSelectVideos) {
            this.onSelectVideos([...this.selectedVideos.values()]);
        }
    }

    getSelectedVideos(): Video[] {
        return [...this.selectedVideos.values()];
    }
}
