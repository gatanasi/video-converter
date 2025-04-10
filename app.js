document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const convertTabBtn = document.getElementById('convertTabBtn');
    const filesTabBtn = document.getElementById('filesTabBtn');
    const convertTab = document.getElementById('convertTab');
    const filesTab = document.getElementById('filesTab');
    const folderIdInput = document.getElementById('folderIdInput');
    const saveConfigBtn = document.getElementById('saveConfigBtn');
    const fetchVideosBtn = document.getElementById('fetchVideosBtn');
    const videoListContainer = document.getElementById('videoListContainer');
    const videoListDiv = document.getElementById('videoList');
    const selectedFileDiv = document.getElementById('selectedFile');
    const fileNameElement = document.getElementById('fileName');
    const conversionOptionsDiv = document.getElementById('conversionOptions');
    const formatSelect = document.getElementById('formatSelect');
    const reverseVideoCheck = document.getElementById('reverseVideoCheck');
    const removeSoundCheck = document.getElementById('removeSoundCheck');
    const convertBtn = document.getElementById('convertBtn');
    const conversionProgressDiv = document.getElementById('conversionProgress');
    const progressBar = document.getElementById('progressBar');
    const progressPercent = document.getElementById('progressPercent');
    const downloadSection = document.getElementById('downloadSection');
    const downloadBtn = document.getElementById('downloadBtn');
    const convertTabMessages = document.getElementById('convertTabMessages');
    const refreshFilesBtn = document.getElementById('refreshFilesBtn');
    const previousFilesList = document.getElementById('previousFilesList');
    const filesTabMessages = document.getElementById('filesTabMessages');

    // Server URL & API Prefix
    const SERVER_URL = window.location.origin; // Assumes backend is on same origin
    const API_PREFIX = "/api"; // Prefix for backend API calls

    // App configuration
    const CONFIG_KEY = 'videoConverterConfig_v3';
    let appConfig = {
        googleDriveFolderId: '',
    };

    // State variables
    let selectedVideo = null;
    let convertedFileUrl = null;
    let currentConversionId = null;
    let statusPollInterval = null;

    // --- Initialization ---
    loadConfiguration();
    if(filesTab.classList.contains('active')) {
        loadConvertedFiles();
    }

    // Event listeners
    convertTabBtn.addEventListener('click', () => switchTab('convert'));
    filesTabBtn.addEventListener('click', () => switchTab('files'));
    saveConfigBtn.addEventListener('click', saveConfiguration);
    fetchVideosBtn.addEventListener('click', handleFetchVideos);
    convertBtn.addEventListener('click', handleConvertVideo);
    downloadBtn.addEventListener('click', handleDownload);
    refreshFilesBtn.addEventListener('click', loadConvertedFiles);


    // --- Helper Functions (showMessage, clearMessages, formatBytes) ---
    function showMessage(tab, message, type = 'info') {
        const messageArea = tab === 'convert' ? convertTabMessages : filesTabMessages;
        if (!messageArea) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = message;
        messageArea.innerHTML = '';
        messageArea.appendChild(messageDiv);
        messageArea.classList.remove('hidden');

        if (type === 'info' || type === 'success') {
            setTimeout(() => {
                if (messageArea.firstChild === messageDiv) {
                    messageArea.classList.add('hidden');
                    messageArea.innerHTML = '';
                }
            }, 5000);
        }
    }

    function clearMessages(tab) {
        const messageArea = tab === 'convert' ? convertTabMessages : filesTabMessages;
         if (!messageArea) return;
        messageArea.innerHTML = '';
        messageArea.classList.add('hidden');
    }

    function formatBytes(bytes, decimals = 2) {
        if (bytes == 0) return '0 Bytes';
        // Handle potential string input or null/undefined
        const numericBytes = Number(bytes);
        if (isNaN(numericBytes) || numericBytes < 0) return 'N/A';

        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

        const i = Math.floor(Math.log(numericBytes) / Math.log(k));
        const index = Math.max(0, Math.min(i, sizes.length - 1)); // Ensure index is valid

        return parseFloat((numericBytes / Math.pow(k, index)).toFixed(dm)) + ' ' + sizes[index];
    }


    // --- Configuration ---
    function loadConfiguration() {
        clearMessages('convert');
        const savedConfig = localStorage.getItem(CONFIG_KEY);
        if (savedConfig) {
            try {
                const parsedConfig = JSON.parse(savedConfig);
                appConfig.googleDriveFolderId = parsedConfig.googleDriveFolderId || '';
                folderIdInput.value = appConfig.googleDriveFolderId || '';
                console.log('Configuration loaded.');
                 if (appConfig.googleDriveFolderId) {
                    showMessage('convert', 'Folder ID loaded. You may fetch videos.', 'info');
                 }
            } catch (error) {
                console.error('Error loading saved configuration:', error);
                showMessage('convert', 'Error loading configuration.', 'error');
                localStorage.removeItem(CONFIG_KEY);
            }
        } else {
             showMessage('convert', 'Enter your Google Drive Folder ID and save configuration.', 'info');
        }
    }

    function saveConfiguration() {
        clearMessages('convert');
        appConfig.googleDriveFolderId = folderIdInput.value.trim();

        // Extract folder ID from URL
        if (appConfig.googleDriveFolderId.includes('drive.google.com')) {
            const match = appConfig.googleDriveFolderId.match(/folders\/([a-zA-Z0-9_-]+)/);
            if (match && match[1]) {
                appConfig.googleDriveFolderId = match[1];
                folderIdInput.value = match[1]; // Update input field with extracted ID
            } else {
                 showMessage('convert', 'Could not extract Folder ID from URL. Please paste just the ID.', 'error');
                 return;
            }
        }

        if (!appConfig.googleDriveFolderId) {
            showMessage('convert', 'Please enter a valid Google Drive folder ID.', 'error');
            return;
        }

        try {
            localStorage.setItem(CONFIG_KEY, JSON.stringify({ googleDriveFolderId: appConfig.googleDriveFolderId }));
            showMessage('convert', 'Folder ID saved! You can now fetch videos.', 'success');
        } catch (error) {
             console.error('Error saving configuration:', error);
             showMessage('convert', 'Failed to save configuration.', 'error');
        }
    }

    // --- Tabs ---
    function switchTab(tabName) {
        clearMessages('convert');
        clearMessages('files');
        if (tabName === 'convert') {
            convertTabBtn.classList.add('active');
            filesTabBtn.classList.remove('active');
            convertTab.classList.add('active');
            filesTab.classList.remove('active');
        } else if (tabName === 'files') {
            convertTabBtn.classList.remove('active');
            filesTabBtn.classList.add('active');
            convertTab.classList.remove('active');
            filesTab.classList.add('active');
            loadConvertedFiles(); // Reload list when switching to files tab
        }
    }

    // --- Files Tab ---
    function loadConvertedFiles() {
        clearMessages('files');
        previousFilesList.innerHTML = '<p>Loading files...</p>';
        filesTabMessages.classList.add('hidden');

        fetch(`${SERVER_URL}${API_PREFIX}/files`)
            .then(response => {
                 if (!response.ok) throw new Error(`Server error: ${response.status}`);
                 return response.json();
            })
            .then(files => { // 'files' is the array of FileInfo objects from the backend
                if (!Array.isArray(files)) throw new Error("Invalid response format.");

                previousFilesList.innerHTML = ''; // Clear loading message

                if (files.length === 0) {
                    previousFilesList.innerHTML = '<p>No previously converted files found.</p>';
                    return;
                }

                // Sort files by modification time, newest first
                files.sort((a, b) => new Date(b.modTime) - new Date(a.modTime));

                // *** CORE FIX IS IN THIS LOOP ***
                files.forEach(fileInfo => { // Rename variable to 'fileInfo' for clarity
                    const fileItem = document.createElement('div');
                    fileItem.className = 'file-item';

                    // Container for file name and metadata
                    const infoDiv = document.createElement('div');
                    infoDiv.className = 'file-info'; // Use this class for styling

                    // Display file name
                    const fileNameDiv = document.createElement('div');
                    fileNameDiv.className = 'file-name';
                    try {
                        // Use fileInfo.name to get the filename
                        fileNameDiv.textContent = decodeURIComponent(fileInfo.name);
                    } catch (e) {
                        fileNameDiv.textContent = fileInfo.name; // Fallback
                    }

                    // Display file metadata (size, date)
                    const fileMetaDiv = document.createElement('div');
                    fileMetaDiv.className = 'file-meta'; // Use this class for styling
                    // Use fileInfo.size and fileInfo.modTime
                    const fileSize = formatBytes(fileInfo.size);
                    const modDate = new Date(fileInfo.modTime).toLocaleString(); // Format date/time
                    fileMetaDiv.textContent = `${fileSize} - ${modDate}`;

                    infoDiv.appendChild(fileNameDiv);
                    infoDiv.appendChild(fileMetaDiv);

                    // Container for action buttons
                    const fileActionsDiv = document.createElement('div');
                    fileActionsDiv.className = 'file-actions';

                    // Download button
                    const downloadButton = document.createElement('button');
                    downloadButton.className = 'download-btn';
                    downloadButton.textContent = 'Download';
                    // Use fileInfo.name for the filename data attribute
                    downloadButton.dataset.filename = fileInfo.name;
                    // The download URL itself comes from fileInfo.url, but we construct it in downloadFile
                    downloadButton.addEventListener('click', (e) => downloadFile(e.target.dataset.filename));

                    // Delete button
                    const deleteButton = document.createElement('button');
                    deleteButton.className = 'delete-btn';
                    deleteButton.textContent = 'Delete';
                    // Use fileInfo.name for the filename data attribute
                    deleteButton.dataset.filename = fileInfo.name;
                    deleteButton.addEventListener('click', (e) => deleteFile(e.target.dataset.filename, fileItem));

                    fileActionsDiv.appendChild(downloadButton);
                    fileActionsDiv.appendChild(deleteButton);

                    // Append info and actions to the main item div
                    fileItem.appendChild(infoDiv);
                    fileItem.appendChild(fileActionsDiv);

                    previousFilesList.appendChild(fileItem);
                 });
                 // *** END OF CORE FIX ***
            })
            .catch(error => {
                console.error('Error fetching converted files:', error);
                previousFilesList.innerHTML = ''; // Clear loading message on error
                showMessage('files', `Error loading files: ${error.message}`, 'error');
            });
    }

    function downloadFile(filename) {
        // Construct the download URL (no API prefix for /download/)
        // Ensure filename is encoded for the URL
        window.open(`${SERVER_URL}/download/${encodeURIComponent(filename)}`, '_blank');
    }

    function deleteFile(filename, fileItemElement) {
        let displayName = filename;
        try { displayName = decodeURIComponent(filename); } catch (e) {/* ignore */}

        if (!confirm(`Are you sure you want to delete "${displayName}"?`)) return;

        clearMessages('files');
        // Use API prefix and DELETE method, encode filename for URL
        fetch(`${SERVER_URL}${API_PREFIX}/delete-file/${encodeURIComponent(filename)}`, { method: 'DELETE' })
            .then(response => {
                if (response.ok) {
                    fileItemElement.remove(); // Remove the item from the list
                    // Check if the list is now empty
                    if (previousFilesList.childElementCount === 0) {
                        previousFilesList.innerHTML = '<p>No converted files found.</p>';
                    }
                    showMessage('files', `File "${displayName}" deleted.`, 'success');
                    return response.json(); // Or handle potential JSON response
                } else {
                    // Try to parse error from backend JSON response
                    return response.json().then(errData => {
                        throw new Error(errData.error || `Failed to delete (Status: ${response.status})`);
                    }).catch(() => { // Fallback if response wasn't JSON
                        throw new Error(`Failed to delete (Status: ${response.status})`);
                    });
                }
            })
            // Removed redundant .then() after successful delete that caused issues
            .catch(error => {
                console.error('Error deleting file:', error);
                showMessage('files', `Error deleting file: ${error.message}`, 'error');
            });
    }


    // --- Convert Tab ---

    function handleFetchVideos() {
        clearMessages('convert');
        if (!appConfig.googleDriveFolderId) {
            showMessage('convert', 'Please enter and save a Google Drive Folder ID first.', 'error');
            return;
        }

        videoListContainer.innerHTML = '<p>Loading videos from server...</p>';
        videoListDiv.classList.remove('hidden');
        selectedFileDiv.classList.add('hidden');
        conversionOptionsDiv.classList.add('hidden');
        conversionProgressDiv.classList.add('hidden');
        downloadSection.classList.add('hidden');

        // Fetch list from backend API endpoint
        fetch(`${SERVER_URL}${API_PREFIX}/list-videos?folderId=${encodeURIComponent(appConfig.googleDriveFolderId)}`)
            .then(response => {
                if (!response.ok) {
                     // Try to parse error from backend's JSON response
                     return response.json().then(errData => {
                         throw new Error(errData.error || `Server error: ${response.status}`);
                     }).catch(() => {
                          throw new Error(`Server error fetching video list: ${response.status}`);
                     });
                }
                return response.json();
            })
            .then(files => { // This 'files' is the array from Google Drive list response
                 videoListContainer.innerHTML = ''; // Clear loading
                 if (!Array.isArray(files)) {
                     console.error("Received invalid file list format from server:", files);
                     throw new Error("Invalid file list format received from server.");
                 }

                if (files.length > 0) {
                    files.forEach(file => { // This 'file' is a GoogleDriveFile object
                        const videoItem = document.createElement('div');
                        videoItem.className = 'video-item';
                        videoItem.dataset.id = file.id;
                        videoItem.dataset.name = file.name;
                        videoItem.dataset.mimeType = file.mimeType || 'video/unknown';

                        let fileSize = file.size ? formatBytes(file.size) : 'Unknown size'; // Handle size string

                        const titleDiv = document.createElement('div');
                        titleDiv.className = 'video-title';
                        titleDiv.textContent = file.name;

                        const metaDiv = document.createElement('div');
                        metaDiv.className = 'video-meta';
                        const dateStr = file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : 'Unknown date';
                        metaDiv.textContent = `${dateStr} - ${fileSize}`;

                        videoItem.appendChild(titleDiv);
                        videoItem.appendChild(metaDiv);

                        videoItem.addEventListener('click', () => {
                            selectPublicVideo(file); // Pass the GoogleDriveFile object
                            // Highlight selected item
                            document.querySelectorAll('.video-item.selected').forEach(item => item.classList.remove('selected'));
                            videoItem.classList.add('selected');
                        });
                        videoListContainer.appendChild(videoItem);
                    });
                } else {
                    videoListContainer.innerHTML = '<p>No video files found in the specified folder.</p>';
                     showMessage('convert', 'No videos found. Check Folder ID and sharing settings ("Anyone with link can view").', 'info');
                }
            })
            .catch(error => {
                console.error('Error fetching video list from server:', error);
                videoListContainer.innerHTML = ''; // Clear loading
                showMessage('convert', `Error fetching videos: ${error.message}`, 'error');
                videoListDiv.classList.add('hidden');
            });
    }

    function selectPublicVideo(file) {
        selectedVideo = file; // Store the selected GoogleDriveFile object
        fileNameElement.textContent = file.name;
        selectedFileDiv.classList.remove('hidden');
        conversionOptionsDiv.classList.remove('hidden');
        conversionProgressDiv.classList.add('hidden'); // Hide progress from previous runs
        downloadSection.classList.add('hidden'); // Hide download from previous runs
        clearMessages('convert');
        stopPollingStatus(); // Stop polling if a new video is selected
        console.log(`Selected video: ${file.name} (ID: ${file.id}, Type: ${file.mimeType})`);
    }

    function handleConvertVideo() {
        if (!selectedVideo) {
            showMessage('convert', 'Please select a video first.', 'error');
            return;
        }

        stopPollingStatus(); // Stop any previous polling
        clearMessages('convert');

        const targetFormat = formatSelect.value;
        const reverseVideo = reverseVideoCheck.checked;
        const removeSound = removeSoundCheck.checked;

        // Reset UI for conversion start
        conversionOptionsDiv.classList.add('hidden'); // Hide options during conversion
        downloadSection.classList.add('hidden');
        conversionProgressDiv.classList.remove('hidden');
        progressBar.style.width = '0%';
        progressPercent.textContent = '0%';

        requestServerConversion(selectedVideo, targetFormat, reverseVideo, removeSound);
    }


    function requestServerConversion(file, targetFormat, reverseVideo, removeSound) {
        // Use API prefix for conversion request
        fetch(`${SERVER_URL}${API_PREFIX}/convert-from-drive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            // Send data needed by backend
            body: JSON.stringify({
                fileId: file.id,
                fileName: file.name, // Send original filename for output naming
                mimeType: file.mimeType || 'video/unknown',
                targetFormat: targetFormat,
                reverseVideo: reverseVideo,
                removeSound: removeSound
            })
        })
        .then(response => {
             if (!response.ok) {
                  // Try to parse error from backend JSON response
                  return response.json().then(errData => {
                      throw new Error(errData.error || `Server error: ${response.status}`);
                  }).catch(() => { // Fallback if not JSON
                      throw new Error(`Server error: ${response.status}`);
                  });
             }
             return response.json();
        })
        .then(data => {
            if (data.success && data.conversionId) {
                // Backend provides relative download URL and conversion ID
                convertedFileUrl = data.downloadUrl; // Store relative URL (e.g., /download/...)
                currentConversionId = data.conversionId;
                showMessage('convert', `Conversion started (ID: ${currentConversionId}). Polling status...`, 'info');
                pollConversionStatus(currentConversionId); // Start polling
            } else {
                // Handle cases where backend indicates failure but returns 2xx status
                throw new Error(data.error || 'Conversion request failed. Backend did not provide ID.');
            }
        })
        .catch(error => {
            console.error('Conversion request error:', error);
            showMessage('convert', `Conversion failed: ${error.message}`, 'error');
            // Reset UI on failure
            conversionProgressDiv.classList.add('hidden');
            // Show options again only if a video is still selected
            if(selectedVideo) { conversionOptionsDiv.classList.remove('hidden'); }
        });
    }

    function pollConversionStatus(conversionId) {
        stopPollingStatus(); // Clear existing interval just in case

        statusPollInterval = setInterval(() => {
            // Use API prefix for status check
            fetch(`${SERVER_URL}${API_PREFIX}/status/${conversionId}`)
                .then(response => {
                    if (response.status === 404) { // Handle case where status is gone (e.g., cleaned up)
                         stopPollingStatus();
                         throw new Error(`Status not found for ID ${conversionId}. It might be expired or invalid.`);
                    }
                    if (!response.ok) {
                        stopPollingStatus();
                        // Try parsing error JSON
                        return response.json().then(errData => {
                            throw new Error(errData.error || `Status check failed: ${response.status}`);
                        }).catch(() => { // Fallback
                             throw new Error(`Status check failed: ${response.status}`);
                        });
                    }
                    return response.json();
                 })
                .then(data => {
                    // Update progress bar
                    const progress = Math.max(0, Math.min(100, Math.round(data.progress || 0)));
                    progressBar.style.width = `${progress}%`;
                    progressPercent.textContent = `${progress}%`;

                    if (data.error) {
                        // Conversion ended with an error
                        stopPollingStatus();
                        showMessage('convert', `Conversion error: ${data.error}`, 'error');
                        conversionProgressDiv.classList.add('hidden');
                        if(selectedVideo) { conversionOptionsDiv.classList.remove('hidden'); } // Show options again
                    } else if (data.complete) {
                        // Conversion completed successfully
                        stopPollingStatus();
                        progressBar.style.width = '100%'; // Ensure it shows 100%
                        progressPercent.textContent = '100%';
                        showMessage('convert', 'Conversion complete!', 'success');
                        conversionProgressDiv.classList.add('hidden');
                        downloadSection.classList.remove('hidden'); // Show download button
                        // If files tab is active, refresh the list after a short delay
                        if (filesTab.classList.contains('active')) {
                            setTimeout(loadConvertedFiles, 500); // Delay allows filesystem changes to propagate
                        }
                    }
                    // If neither error nor complete, polling continues
                 })
                .catch(error => {
                    // Error during the fetch/status check itself
                    console.error('Error checking status:', error);
                    stopPollingStatus(); // Stop polling on error
                    showMessage('convert', `Status check error: ${error.message}`, 'error');
                    // Reset UI
                    conversionProgressDiv.classList.add('hidden');
                    if(selectedVideo) { conversionOptionsDiv.classList.remove('hidden'); }
                });
        }, 2000); // Poll every 2 seconds
    }

    function stopPollingStatus() {
        if (statusPollInterval) {
            clearInterval(statusPollInterval);
            statusPollInterval = null;
            console.log("Stopped status polling.");
        }
    }

    function handleDownload() {
        if (!convertedFileUrl) {
            showMessage('convert','No converted file URL available.', 'error');
            return;
        }
        // Use the relative URL stored from the conversion response
        // Download URL does NOT use API prefix
        window.open(`${SERVER_URL}${convertedFileUrl}`, '_blank');
    }

}); // End DOMContentLoaded