import { Video } from '../app.js'; // Import the Video interface

// Define interfaces for component options and conversion options
interface ConversionFormOptions {
    container: HTMLElement;
    messageContainer: HTMLElement;
}

interface ConversionOptions {
    targetFormat: string;
    reverseVideo: boolean;
    removeSound: boolean;
}

/**
 * Conversion Form Component - Handles conversion options and submission.
 * Now primarily displays options; submission logic is handled by App for Drive/Upload separately.
 */
export class ConversionFormComponent {
    private container: HTMLElement;
    private messageContainer: HTMLElement;
    // selectedVideos is not used internally anymore, but kept for potential external access if needed
    public selectedVideos: Video[] = []; // Use the imported Video interface

    constructor(options: ConversionFormOptions) {
        this.container = options.container;
        this.messageContainer = options.messageContainer;
        this.createForm();
    }

    createForm(): void {
        const form = document.createElement('form');
        form.className = 'conversion-form';
        // Removed the submit button from here, it will be handled separately
        // for Drive selection and Upload.
        form.innerHTML = `
            <h3>Conversion Options</h3>
            <div class="form-group">
                <label for="target-format">Target Format:</label>
                <select id="target-format" class="form-control">
                    <option value="mov">MOV (H.265)</option>
                    <option value="mp4">MP4 (H.265)</option>
                    <option value="avi">AVI (Xvid)</option>
                </select>
            </div>
            <div class="form-options">
                <label class="checkbox-container">
                    <input type="checkbox" id="reverse-video">
                    Reverse Video
                </label>
                <label class="checkbox-container">
                    <input type="checkbox" id="remove-sound" checked>
                    Remove Sound
                </label>
            </div>
            <!-- Removed form-actions and submit button -->
        `;

        // Remove form submit listener, as options are read directly
        // form.addEventListener('submit', (e) => {
        //     e.preventDefault();
        //     this.submitConversion(); // This logic moves to App.js
        // });

        this.container.appendChild(form);
    }

    /** Update based on the list of selected videos from VideoListComponent */
    updateSelectedVideos(videos: Video[]): void { // Use the imported Video interface
        this.selectedVideos = videos || [];
    }

    /** Helper method for App.ts to get current options */
    getConversionOptions(): ConversionOptions {
        const targetFormat = (this.container.querySelector('#target-format') as HTMLSelectElement).value;
        const reverseVideo = (this.container.querySelector('#reverse-video') as HTMLInputElement).checked;
        const removeSound = (this.container.querySelector('#remove-sound') as HTMLInputElement).checked;
        return { targetFormat, reverseVideo, removeSound };
    }
}
