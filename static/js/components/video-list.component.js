/**
 * Video List Component - Displays videos (e.g., from Google Drive) and handles selection.
 */
import { formatBytes } from '../utils/utils.js';


export class VideoListComponent {
    constructor(selector, onVideoSelectionChange) {
        const container = document.querySelector(selector);
        if (!container) {
            throw new Error(`VideoListComponent container not found: ${selector}`);
        }
        this.container = container;
        this.onVideoSelectionChange = onVideoSelectionChange; // Callback when selection changes
        this.videoList = [];
        // References to controls (will be created in displayVideos)
        this.headerCheckbox = null;
        this.selectionCounter = null;
        this.deselectAllBtn = null;
        this.selectAllBtn = null; // Added reference
        this.tbody = null; // Reference to table body for updates
    }

    displayVideos(videos = [], source = 'drive') {
        this.videoList = videos;
        this.container.innerHTML = ''; // Clear previous list

        if (this.videoList.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.textContent = source === 'drive' ? 'No videos found or Drive access might be needed.' : 'No videos to display.';
            this.container.appendChild(emptyMessage);
            return;
        }

        this.createControls();
        this.createTable(this.videoList);
        // Initial selection state will be set by updateSelection called from App.js
    }

    createControls() {
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'selection-controls';
        // Use consistent IDs/classes if needed elsewhere
        controlsDiv.innerHTML = `
            <button id="select-all-btn" class="btn small">Select All</button>
            <button id="deselect-all-btn" class="btn small" disabled>Deselect All</button>
            <span class="selection-counter">0 videos selected</span>
        `;
        this.container.appendChild(controlsDiv);

        this.selectAllBtn = controlsDiv.querySelector('#select-all-btn');
        this.deselectAllBtn = controlsDiv.querySelector('#deselect-all-btn');
        this.selectionCounter = controlsDiv.querySelector('.selection-counter');

        this.selectAllBtn.addEventListener('click', () => this.handleSelectAll());
        this.deselectAllBtn.addEventListener('click', () => this.handleDeselectAll());
    }

    createTable(videos) {
        const table = document.createElement('table');
        table.className = 'video-table'; // Ensure CSS targets this

        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th class="video-select"><input type="checkbox" id="header-checkbox" title="Select/Deselect All Visible"></th>
                <th class="video-name">Name</th>
                <th class="video-size">Size</th>
                <th class="video-type">Type</th>
                <th class="video-date">Modified Date</th>
            </tr>
        `;
        this.headerCheckbox = thead.querySelector('#header-checkbox');
        this.headerCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.handleSelectAll();
            } else {
                this.handleDeselectAll();
            }
        });
        table.appendChild(thead);

        this.tbody = document.createElement('tbody'); // Store tbody reference
        videos.forEach(video => {
            const row = this.createTableRow(video);
            this.tbody.appendChild(row);
        });
        table.appendChild(this.tbody);
        this.container.appendChild(table);
    }

    createTableRow(video) {
        const row = document.createElement('tr');
        row.dataset.id = video.id; // Use data-id for easy selection

        let formattedDate = 'N/A';
        if (video.modifiedTime) {
            try {
                const date = new Date(video.modifiedTime);
                // Consistent date formatting
                formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            } catch (e) { console.error("Error formatting date:", e); }
        }

        const mimeTypeShort = video.mimeType ? video.mimeType.split('/')[1] || 'unknown' : 'unknown';
        const sizeFormatted = video.size ? formatBytes(parseInt(video.size, 10)) : 'N/A'; // Ensure size is number

        row.innerHTML = `
            <td class="video-select">
                <input type="checkbox" class="video-checkbox" data-id="${video.id}">
            </td>
            <td class="video-name" title="${video.name}">${video.name}</td>
            <td class="video-size">${sizeFormatted}</td>
            <td class="video-type">${mimeTypeShort}</td>
            <td class="video-date">${formattedDate}</td>
        `;

        const checkbox = row.querySelector('.video-checkbox');
        // Event listener for individual checkbox change
        checkbox.addEventListener('change', (e) => {
            this.handleCheckboxChange(video.id, e.target.checked);
        });

        // Allow clicking anywhere on the row (except checkbox cell) to toggle
        row.addEventListener('click', (e) => {
            // Prevent interference if clicking directly on checkbox or its cell
            if (e.target.closest('.video-select')) return;
            checkbox.checked = !checkbox.checked;
            // Manually trigger the change handler
            this.handleCheckboxChange(video.id, checkbox.checked);
        });

        return row;
    }

    // Called when an individual checkbox state changes (user interaction)
    handleCheckboxChange(videoId, isSelected) {
        if (this.onVideoSelectionChange) {
            this.onVideoSelectionChange(videoId, isSelected); // Notify App.js
        }
        // UI update (row style, counts) will be handled by updateSelection when state changes
    }

    // Called when user clicks "Select All" button or header checkbox (checked)
    handleSelectAll() {
        const allVisibleIds = this.videoList.map(v => v.id);
        if (this.onVideoSelectionChange) {
            // Notify App.js to select all *these* specific videos
            this.onVideoSelectionChange(allVisibleIds, true);
        }
    }

    // Called when user clicks "Deselect All" button or header checkbox (unchecked)
    handleDeselectAll() {
        const allVisibleIds = this.videoList.map(v => v.id);
        if (this.onVideoSelectionChange) {
            // Notify App.js to deselect all *these* specific videos
            this.onVideoSelectionChange(allVisibleIds, false);
        }
    }

    /**
     * Updates the visual state of checkboxes and controls based on the provided list of selected IDs.
     * Called by App.js when the central state's selectedDriveVideos changes.
     * @param {string[]} selectedIds - Array of IDs of currently selected videos.
     */
    updateSelection(selectedIds = []) {
        if (!this.tbody) return; // Not initialized yet

        const selectedSet = new Set(selectedIds);
        let visibleSelectedCount = 0;
        const totalVisible = this.videoList.length;

        // Update individual rows and checkboxes
        this.videoList.forEach(video => {
            const row = this.tbody.querySelector(`tr[data-id="${video.id}"]`);
            if (!row) return;
            const checkbox = row.querySelector('.video-checkbox');
            if (!checkbox) return;

            const isSelected = selectedSet.has(video.id);
            row.classList.toggle('selected', isSelected);
            checkbox.checked = isSelected;
            if (isSelected) {
                visibleSelectedCount++;
            }
        });

        // Update controls
        if (this.selectionCounter) {
            this.selectionCounter.textContent = `${visibleSelectedCount} video${visibleSelectedCount !== 1 ? 's' : ''} selected`;
        }
        if (this.deselectAllBtn) {
            this.deselectAllBtn.disabled = visibleSelectedCount === 0;
        }
        if (this.selectAllBtn) {
            this.selectAllBtn.disabled = visibleSelectedCount === totalVisible; // Disable if all are already selected
        }
        if (this.headerCheckbox) {
            this.headerCheckbox.checked = totalVisible > 0 && visibleSelectedCount === totalVisible;
            this.headerCheckbox.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < totalVisible;
            this.headerCheckbox.disabled = totalVisible === 0; // Disable if no videos
        }
    }
}
