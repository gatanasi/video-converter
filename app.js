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
    const conversionOptionsDiv = document.getElementById('conversionOptions');
    const formatSelect = document.getElementById('formatSelect');
    const reverseVideoCheck = document.getElementById('reverseVideoCheck');
    const removeSoundCheck = document.getElementById('removeSoundCheck');
    const convertBtn = document.getElementById('convertBtn');
    const conversionProgressDiv = document.getElementById('conversionProgress');
    const multiConversionProgress = document.getElementById('multiConversionProgress');
    const hideProgressBtn = document.getElementById('hideProgressBtn');
    const downloadSection = document.getElementById('downloadSection');
    const viewFilesBtn = document.getElementById('viewFilesBtn');
    const convertTabMessages = document.getElementById('convertTabMessages');
    const refreshFilesBtn = document.getElementById('refreshFilesBtn');
    const previousFilesList = document.getElementById('previousFilesList');
    const filesTabMessages = document.getElementById('filesTabMessages');
    const activeConversionsSection = document.getElementById('activeConversions');
    const activeConversionsList = document.getElementById('activeConversionsList');
    const refreshActiveBtn = document.getElementById('refreshActiveBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const deselectAllBtn = document.getElementById('deselectAllBtn');
    const selectionCounter = document.getElementById('selectionCounter');

    // Server URL & API Prefix
    const SERVER_URL = window.location.origin; // Assumes backend is on same origin
    const API_PREFIX = "/api"; // Prefix for backend API calls

    // App configuration
    const CONFIG_KEY = 'videoConverterConfig_v3';
    let appConfig = {
        googleDriveFolderId: '',
    };

    // State variables
    let selectedVideos = []; // Array of selected video objects
    let convertedFileUrls = {}; // Map of conversion IDs to file URLs
    let activeConversions = {}; // Track active conversion statuses by ID
    let activeConversionsPollInterval = null; // For polling active conversions

    // --- Initialization ---
    loadConfiguration();
    if(filesTab.classList.contains('active')) {
        loadConvertedFiles();
    }
    // Start checking for active conversions automatically
    startActiveConversionPolling();

    // Event listeners
    convertTabBtn.addEventListener('click', () => switchTab('convert'));
    filesTabBtn.addEventListener('click', () => switchTab('files'));
    saveConfigBtn.addEventListener('click', saveConfiguration);
    fetchVideosBtn.addEventListener('click', handleFetchVideos);
    convertBtn.addEventListener('click', handleConvertVideos);
    viewFilesBtn.addEventListener('click', () => switchTab('files'));
    refreshFilesBtn.addEventListener('click', loadConvertedFiles);
    refreshActiveBtn.addEventListener('click', loadActiveConversions);
    selectAllBtn.addEventListener('click', selectAllVideos);
    deselectAllBtn.addEventListener('click', deselectAllVideos);
    hideProgressBtn.addEventListener('click', () => {
        conversionProgressDiv.classList.add('hidden');
    });

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
            // Check for active conversions when switching to convert tab
            loadActiveConversions();
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
        conversionOptionsDiv.classList.add('hidden');
        conversionProgressDiv.classList.add('hidden');
        downloadSection.classList.add('hidden');
        
        // Reset selected videos
        selectedVideos = [];
        updateSelectionCounter();

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
                            toggleVideoSelection(file, videoItem);
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

    // Function to toggle video selection
    function toggleVideoSelection(file, videoItem) {
        // Check if the video is already selected
        const index = selectedVideos.findIndex(v => v.id === file.id);
        
        if (index !== -1) {
            // If already selected, deselect it
            selectedVideos.splice(index, 1);
            videoItem.classList.remove('selected');
        } else {
            // Otherwise, select it
            selectedVideos.push(file);
            videoItem.classList.add('selected');
        }
        
        updateSelectionCounter();
        
        // Show/hide conversion options based on selection
        if (selectedVideos.length > 0) {
            conversionOptionsDiv.classList.remove('hidden');
        } else {
            conversionOptionsDiv.classList.add('hidden');
        }
    }

    // Function to update selection counter
    function updateSelectionCounter() {
        const count = selectedVideos.length;
        selectionCounter.textContent = `${count} ${count === 1 ? 'video' : 'videos'} selected`;
    }

    // Select all videos
    function selectAllVideos() {
        selectedVideos = []; // Clear existing selections
        
        // Get all video items and add them to selected videos
        const videoItems = document.querySelectorAll('.video-item');
        videoItems.forEach(item => {
            const fileId = item.dataset.id;
            const fileName = item.dataset.name;
            const fileMimeType = item.dataset.mimeType;
            
            // Only add if we have all required data
            if (fileId && fileName) {
                selectedVideos.push({
                    id: fileId,
                    name: fileName,
                    mimeType: fileMimeType || 'video/unknown'
                });
                
                item.classList.add('selected');
            }
        });
        
        updateSelectionCounter();
        
        if (selectedVideos.length > 0) {
            conversionOptionsDiv.classList.remove('hidden');
        }
    }

    // Deselect all videos
    function deselectAllVideos() {
        selectedVideos = []; // Clear selections
        
        // Remove selected class from all video items
        document.querySelectorAll('.video-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        updateSelectionCounter();
        conversionOptionsDiv.classList.add('hidden');
    }

    // Function to handle converting multiple videos
    function handleConvertVideos() {
        if (selectedVideos.length === 0) {
            showMessage('convert', 'Please select at least one video first.', 'error');
            return;
        }

        // Clear active conversions tracking
        activeConversions = {};
        clearMessages('convert');

        const targetFormat = formatSelect.value;
        const reverseVideo = reverseVideoCheck.checked;
        const removeSound = removeSoundCheck.checked;

        // Reset UI for conversion start
        conversionOptionsDiv.classList.add('hidden'); // Hide options during conversion
        downloadSection.classList.add('hidden');
        conversionProgressDiv.classList.remove('hidden');
        multiConversionProgress.innerHTML = ''; // Clear any previous progress items
        
        // Start all conversions in parallel
        selectedVideos.forEach(file => {
            // Create a progress element for this video
            const progressItem = createProgressItem(file.name);
            multiConversionProgress.appendChild(progressItem);
            
            // Start the conversion
            requestServerConversion(
                file, 
                targetFormat, 
                reverseVideo, 
                removeSound,
                progressItem
            );
        });
    }

    // Helper to create a progress item for a single video
    function createProgressItem(fileName) {
        const item = document.createElement('div');
        item.className = 'multi-progress-item';
        
        const info = document.createElement('div');
        info.className = 'multi-progress-info';
        
        const name = document.createElement('div');
        name.className = 'multi-progress-name';
        name.textContent = fileName;
        
        const percent = document.createElement('div');
        percent.className = 'multi-progress-percent';
        percent.textContent = '0%';
        
        info.appendChild(name);
        info.appendChild(percent);
        
        const barContainer = document.createElement('div');
        barContainer.className = 'multi-progress-bar-container';
        
        const bar = document.createElement('div');
        bar.className = 'multi-progress-bar';
        bar.style.width = '0%';
        
        barContainer.appendChild(bar);
        
        item.appendChild(info);
        item.appendChild(barContainer);
        
        return item;
    }

    // Updated function to request server conversion
    function requestServerConversion(file, targetFormat, reverseVideo, removeSound, progressItem) {
        // Get elements within the progress item
        const percentElement = progressItem.querySelector('.multi-progress-percent');
        const barElement = progressItem.querySelector('.multi-progress-bar');
        
        // Use API prefix for conversion request
        fetch(`${SERVER_URL}${API_PREFIX}/convert-from-drive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            // Send data needed by backend
            body: JSON.stringify({
                fileId: file.id,
                fileName: file.name,
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
                convertedFileUrls[data.conversionId] = data.downloadUrl;
                
                // Track this conversion
                activeConversions[data.conversionId] = {
                    fileName: file.name,
                    progressItem: progressItem,
                    complete: false,
                    error: null,
                    progress: 0
                };
                
                // Start polling for this conversion's status
                pollConversionStatus(data.conversionId);
                
                // Also update active conversions list
                loadActiveConversions();
            } else {
                // Handle cases where backend indicates failure but returns 2xx status
                throw new Error(data.error || 'Conversion request failed. Backend did not provide ID.');
            }
        })
        .catch(error => {
            console.error('Conversion request error:', error);
            
            // Show error in the progress item
            const errorMsg = document.createElement('div');
            errorMsg.className = 'multi-progress-error';
            errorMsg.textContent = `Error: ${error.message}`;
            progressItem.appendChild(errorMsg);
            
            // Mark as complete with error in tracking
            checkAllConversionsComplete();
        });
    }

    // New function to poll status for a single conversion
    function pollConversionStatus(conversionId) {
        if (!activeConversions[conversionId]) return;
        
        const conversionInfo = activeConversions[conversionId];
        const progressItem = conversionInfo.progressItem;
        const percentElement = progressItem.querySelector('.multi-progress-percent');
        const barElement = progressItem.querySelector('.multi-progress-bar');
        
        // Check status
        fetch(`${SERVER_URL}${API_PREFIX}/status/${conversionId}`)
            .then(response => {
                if (response.status === 404) {
                    throw new Error(`Status not found for ID ${conversionId}. It might be expired or invalid.`);
                }
                if (!response.ok) {
                    return response.json().then(errData => {
                        throw new Error(errData.error || `Status check failed: ${response.status}`);
                    }).catch(() => {
                        throw new Error(`Status check failed: ${response.status}`);
                    });
                }
                return response.json();
            })
            .then(data => {
                // Update progress
                const progress = Math.max(0, Math.min(100, Math.round(data.progress || 0)));
                barElement.style.width = `${progress}%`;
                percentElement.textContent = `${progress}%`;
                
                // Update tracking object
                conversionInfo.progress = progress;
                
                if (data.error) {
                    // Conversion ended with an error
                    conversionInfo.complete = true;
                    conversionInfo.error = data.error;
                    
                    // Show error in the progress item
                    const errorMsg = document.createElement('div');
                    errorMsg.className = 'multi-progress-error';
                    errorMsg.textContent = `Error: ${data.error}`;
                    progressItem.appendChild(errorMsg);
                    
                    // Check if all conversions are complete
                    checkAllConversionsComplete();
                } else if (data.complete) {
                    // Conversion completed successfully
                    conversionInfo.complete = true;
                    barElement.style.width = '100%';
                    percentElement.textContent = '100%';
                    
                    // Check if all conversions are complete
                    checkAllConversionsComplete();
                } else {
                    // Continue polling
                    setTimeout(() => pollConversionStatus(conversionId), 2000);
                }
            })
            .catch(error => {
                console.error(`Error checking status for conversion ${conversionId}:`, error);
                
                // Mark as complete with error
                conversionInfo.complete = true;
                conversionInfo.error = error.message;
                
                // Show error in the progress item
                const errorMsg = document.createElement('div');
                errorMsg.className = 'multi-progress-error';
                errorMsg.textContent = `Error: ${error.message}`;
                progressItem.appendChild(errorMsg);
                
                // Check if all conversions are complete
                checkAllConversionsComplete();
            });
    }

    // Helper to check if all conversions are complete
    function checkAllConversionsComplete() {
        const conversionIds = Object.keys(activeConversions);
        if (conversionIds.length === 0) return;
        
        const allComplete = conversionIds.every(id => activeConversions[id].complete);
        if (!allComplete) return;
        
        // Count errors
        const errors = conversionIds.filter(id => activeConversions[id].error).length;
        const total = conversionIds.length;
        
        // All conversions are complete, show appropriate message
        if (errors === 0) {
            showMessage('convert', 'All conversions completed successfully!', 'success');
        } else if (errors === total) {
            showMessage('convert', 'All conversions failed. Check errors above.', 'error');
        } else {
            showMessage('convert', `${total - errors} of ${total} conversions completed successfully. ${errors} failed.`, 'warning');
        }
        
        // Show download section
        downloadSection.classList.remove('hidden');
        
        // Refresh files list after a delay to ensure server has processed everything
        setTimeout(() => {
            loadConvertedFiles();
            loadActiveConversions();
        }, 1000);
    }

    function loadActiveConversions() {
        clearMessages('convert');
        activeConversionsList.innerHTML = '<p>Loading active conversions...</p>';
        activeConversionsSection.classList.remove('hidden');

        fetch(`${SERVER_URL}${API_PREFIX}/active-conversions`)
            .then(response => {
                if (!response.ok) throw new Error(`Server error: ${response.status}`);
                return response.json();
            })
            .then(conversions => {
                if (!Array.isArray(conversions)) throw new Error("Invalid response format.");

                activeConversionsList.innerHTML = ''; // Clear loading message

                if (conversions.length === 0) {
                    activeConversionsList.innerHTML = '<p>No active conversions found.</p>';
                    return;
                }

                conversions.forEach(conversion => {
                    const conversionItem = document.createElement('div');
                    conversionItem.className = 'conversion-item';

                    const infoDiv = document.createElement('div');
                    infoDiv.className = 'conversion-info';

                    const fileNameDiv = document.createElement('div');
                    fileNameDiv.className = 'conversion-file-name';
                    fileNameDiv.textContent = conversion.fileName;

                    const progressDiv = document.createElement('div');
                    progressDiv.className = 'conversion-progress';
                    const progress = Math.max(0, Math.min(100, Math.round(conversion.progress || 0)));
                    progressDiv.textContent = `Progress: ${progress}%`;

                    infoDiv.appendChild(fileNameDiv);
                    infoDiv.appendChild(progressDiv);

                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'conversion-actions';

                    const abortButton = document.createElement('button');
                    abortButton.className = 'abort-btn';
                    abortButton.textContent = 'Abort';
                    abortButton.dataset.conversionId = conversion.id;
                    abortButton.addEventListener('click', (e) => handleAbortConversion(e.target.dataset.conversionId, conversionItem));

                    actionsDiv.appendChild(abortButton);

                    conversionItem.appendChild(infoDiv);
                    conversionItem.appendChild(actionsDiv);

                    activeConversionsList.appendChild(conversionItem);
                });
            })
            .catch(error => {
                console.error('Error fetching active conversions:', error);
                activeConversionsList.innerHTML = ''; // Clear loading message on error
                showMessage('convert', `Error loading active conversions: ${error.message}`, 'error');
            });
    }

    function handleAbortConversion(conversionId, conversionItemElement) {
        if (!confirm(`Are you sure you want to abort conversion ID ${conversionId}?`)) return;

        clearMessages('convert');
        fetch(`${SERVER_URL}${API_PREFIX}/abort/${conversionId}`, { method: 'POST' })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to abort conversion (Status: ${response.status})`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    conversionItemElement.remove(); // Remove the item from the list
                    if (activeConversionsList.childElementCount === 0) {
                        activeConversionsList.innerHTML = '<p>No active conversions found.</p>';
                    }
                    showMessage('convert', `Conversion ID ${conversionId} aborted.`, 'success');
                    
                    // If this is one of our tracked conversions, update ONLY this specific conversion's status
                    if (activeConversions[conversionId]) {
                        const conversionInfo = activeConversions[conversionId];
                        conversionInfo.complete = true;
                        conversionInfo.error = 'Aborted by user';
                        
                        const progressItem = conversionInfo.progressItem;
                        if (progressItem) {
                            const errorMsg = document.createElement('div');
                            errorMsg.className = 'multi-progress-error';
                            errorMsg.textContent = 'Aborted by user';
                            progressItem.appendChild(errorMsg);
                        }
                        
                        // Check if all conversions are now complete, but don't affect other conversions
                        const allOthersComplete = Object.keys(activeConversions)
                            .filter(id => id !== conversionId) // Exclude the aborted conversion
                            .every(id => activeConversions[id].complete);
                            
                        // Only call checkAllConversionsComplete if there are no other active conversions
                        // or if all other conversions are already complete
                        if (Object.keys(activeConversions).length === 1 || allOthersComplete) {
                            checkAllConversionsComplete();
                        }
                    }
                } else {
                    throw new Error(data.error || 'Failed to abort conversion.');
                }
            })
            .catch(error => {
                console.error('Error aborting conversion:', error);
                showMessage('convert', `Error aborting conversion: ${error.message}`, 'error');
            });
    }

    // --- Active Conversions Management ---
    function startActiveConversionPolling() {
        // Initial load
        loadActiveConversions();
        
        // Set up polling for active conversions (every 10 seconds)
        activeConversionsPollInterval = setInterval(loadActiveConversions, 10000);
        
        // Clean up interval when page is unloaded
        window.addEventListener('beforeunload', stopActiveConversionPolling);
    }
    
    function stopActiveConversionPolling() {
        if (activeConversionsPollInterval) {
            clearInterval(activeConversionsPollInterval);
            activeConversionsPollInterval = null;
        }
    }

}); // End DOMContentLoaded