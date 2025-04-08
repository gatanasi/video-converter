document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Tab Navigation
    const convertTabBtn = document.getElementById('convertTabBtn');
    const filesTabBtn = document.getElementById('filesTabBtn');
    const convertTab = document.getElementById('convertTab');
    const filesTab = document.getElementById('filesTab');
    
    // DOM Elements - Convert Tab
    const apiKeyInput = document.getElementById('apiKeyInput');
    const folderIdInput = document.getElementById('folderIdInput');
    const saveConfigBtn = document.getElementById('saveConfigBtn');
    const fetchVideosBtn = document.getElementById('fetchVideosBtn');
    const videoListContainer = document.getElementById('videoListContainer');
    const videoListDiv = document.getElementById('videoList');
    const selectedFileDiv = document.getElementById('selectedFile');
    const fileNameElement = document.getElementById('fileName');
    const conversionOptionsDiv = document.getElementById('conversionOptions');
    const formatSelect = document.getElementById('formatSelect');
    const convertBtn = document.getElementById('convertBtn');
    const conversionProgressDiv = document.getElementById('conversionProgress');
    const progressBar = document.getElementById('progressBar');
    const progressPercent = document.getElementById('progressPercent');
    const downloadSection = document.getElementById('downloadSection');
    const downloadBtn = document.getElementById('downloadBtn');
    
    // DOM Elements - Files Tab
    const refreshFilesBtn = document.getElementById('refreshFilesBtn');
    const previousFilesList = document.getElementById('previousFilesList');

    // Server URL
    const SERVER_URL = window.location.origin;
    
    // App configuration
    const CONFIG_KEY = 'videoConverterConfig';
    let appConfig = {
        googleDriveApiKey: '',
        googleDriveFolderId: '',
        isPublicFolder: true
    };
    
    // Current selected video
    let selectedVideo = null;
    let convertedFileUrl = null;

    // Load saved configuration
    loadConfiguration();

    // Event listeners - Tabs
    convertTabBtn.addEventListener('click', () => switchTab('convert'));
    filesTabBtn.addEventListener('click', () => switchTab('files'));
    
    // Event listeners - Convert Tab
    saveConfigBtn.addEventListener('click', saveConfiguration);
    fetchVideosBtn.addEventListener('click', handleFetchVideos);
    convertBtn.addEventListener('click', handleConvertVideo);
    downloadBtn.addEventListener('click', handleDownload);
    
    // Event listeners - Files Tab
    refreshFilesBtn.addEventListener('click', loadConvertedFiles);

    // Fetch converted files on initial load
    loadConvertedFiles();

    // Load saved configuration
    function loadConfiguration() {
        const savedConfig = localStorage.getItem(CONFIG_KEY);
        
        if (savedConfig) {
            try {
                appConfig = JSON.parse(savedConfig);
                apiKeyInput.value = appConfig.googleDriveApiKey || '';
                folderIdInput.value = appConfig.googleDriveFolderId || '';
            } catch (error) {
                console.error('Error loading saved configuration:', error);
            }
        }
    }

    // Switch between tabs
    function switchTab(tabName) {
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
            
            // Reload the file list when switching to the files tab
            loadConvertedFiles();
        }
    }
    
    // Load the list of previously converted files
    function loadConvertedFiles() {
        previousFilesList.innerHTML = '<p>Loading files...</p>';
        
        fetch(`${SERVER_URL}/files`)
            .then(response => response.json())
            .then(files => {
                if (!Array.isArray(files) || files.length === 0) {
                    previousFilesList.innerHTML = '<p>No converted files found.</p>';
                    return;
                }
                
                previousFilesList.innerHTML = '';
                
                // Sort files by timestamp (most recent first)
                files.sort().reverse();
                
                // Display each file with actions
                files.forEach(filename => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'file-item';
                    
                    // Format file name for display
                    const displayName = decodeURIComponent(filename);
                    
                    fileItem.innerHTML = `
                        <div class="file-name">${displayName}</div>
                        <div class="file-actions">
                            <button class="download-btn" data-filename="${filename}">Download</button>
                            <button class="delete-btn" data-filename="${filename}">Delete</button>
                        </div>
                    `;
                    
                    // Add event listeners for the buttons
                    fileItem.querySelector('.download-btn').addEventListener('click', (e) => {
                        const filename = e.target.getAttribute('data-filename');
                        downloadFile(filename);
                    });
                    
                    fileItem.querySelector('.delete-btn').addEventListener('click', (e) => {
                        const filename = e.target.getAttribute('data-filename');
                        deleteFile(filename, fileItem);
                    });
                    
                    previousFilesList.appendChild(fileItem);
                });
            })
            .catch(error => {
                console.error('Error fetching converted files:', error);
                previousFilesList.innerHTML = `<p>Error loading converted files: ${error.message}</p>`;
            });
    }
    
    // Download a previously converted file
    function downloadFile(filename) {
        window.open(`${SERVER_URL}/download/${filename}`, '_blank');
    }
    
    // Delete a previously converted file
    function deleteFile(filename, fileItemElement) {
        if (!confirm(`Are you sure you want to delete ${filename}?`)) {
            return;
        }
        
        fetch(`${SERVER_URL}/delete-file/${filename}`, { method: 'GET' })
            .then(response => {
                if (response.ok) {
                    // Remove the file item from the UI
                    fileItemElement.remove();
                    
                    // Check if there are any files left
                    if (previousFilesList.childElementCount === 0) {
                        previousFilesList.innerHTML = '<p>No converted files found.</p>';
                    }
                    
                    alert('File deleted successfully');
                } else {
                    throw new Error('Failed to delete file');
                }
            })
            .catch(error => {
                console.error('Error deleting file:', error);
                alert(`Error deleting file: ${error.message}`);
            });
    }

    // Save configuration
    function saveConfiguration() {
        appConfig.googleDriveApiKey = apiKeyInput.value.trim();
        appConfig.googleDriveFolderId = folderIdInput.value.trim();
        
        // Extract folder ID from URL if needed
        if (appConfig.googleDriveFolderId.includes('drive.google.com')) {
            const match = appConfig.googleDriveFolderId.match(/folders\/([a-zA-Z0-9_-]+)/);
            if (match && match[1]) {
                appConfig.googleDriveFolderId = match[1];
                folderIdInput.value = match[1];
            }
        }
        
        if (!appConfig.googleDriveFolderId) {
            alert('Please enter a valid Google Drive folder ID');
            return;
        }
        
        if (!appConfig.googleDriveApiKey) {
            alert('Please enter a valid Google Drive API Key');
            return;
        }
        
        localStorage.setItem(CONFIG_KEY, JSON.stringify(appConfig));
        alert('Configuration saved! You can now fetch videos from your Google Drive folder.');
    }

    // Handle fetch videos button click
    function handleFetchVideos() {
        if (!appConfig.googleDriveFolderId) {
            alert('Please enter a Google Drive folder ID first.');
            return;
        }
        
        if (!appConfig.googleDriveApiKey) {
            alert('Please enter a Google Drive API Key first.');
            return;
        }
        
        fetchVideosFromPublicFolder();
    }

    // Fetch videos from a public Google Drive folder
    function fetchVideosFromPublicFolder() {
        // Clear previously loaded videos
        videoListContainer.innerHTML = '';
        
        // Show loading indicator
        videoListContainer.innerHTML = '<p>Loading videos...</p>';
        
        // For public folders, we'll use a different approach
        // We'll list the folder using Google Drive API's public endpoints
        
        // First, try to get the folder metadata
        fetch(`https://www.googleapis.com/drive/v3/files?q='${appConfig.googleDriveFolderId}'+in+parents+and+mimeType+contains+'video'&fields=files(id,name,mimeType,modifiedTime)&key=${appConfig.googleDriveApiKey}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to access the folder. Make sure it is public and the ID is correct.');
                }
                return response.json();
            })
            .then(data => {
                // Clear loading indicator
                videoListContainer.innerHTML = '';
                
                const files = data.files || [];
                
                if (files.length > 0) {
                    // Display videos
                    videoListDiv.classList.remove('hidden');
                    
                    files.forEach(file => {
                        const videoItem = document.createElement('div');
                        videoItem.className = 'video-item';
                        videoItem.dataset.id = file.id;
                        videoItem.dataset.name = file.name;
                        videoItem.dataset.mimeType = file.mimeType;
                        
                        // Format the HTML content
                        videoItem.innerHTML = `
                            <div class="video-title">${file.name}</div>
                            <div class="video-date">${new Date(file.modifiedTime).toLocaleString()}</div>
                        `;
                        
                        // Add click event to select video
                        videoItem.addEventListener('click', () => {
                            selectPublicVideo(file);
                            
                            // Highlight the selected item
                            document.querySelectorAll('.video-item').forEach(item => {
                                item.classList.remove('selected');
                            });
                            videoItem.classList.add('selected');
                        });
                        
                        videoListContainer.appendChild(videoItem);
                    });
                    
                } else {
                    videoListContainer.innerHTML = '<p>No videos found in the specified folder. Make sure the folder is public and contains video files.</p>';
                }
            })
            .catch(error => {
                console.error('Error fetching videos:', error);
                videoListContainer.innerHTML = `
                    <p>Error: ${error.message}</p>
                    <p>Make sure:</p>
                    <ul>
                        <li>The folder ID is correct</li>
                        <li>The folder is publicly shared with "Anyone with the link"</li>
                        <li>The folder contains video files</li>
                        <li>Your API Key is valid</li>
                    </ul>
                `;
            });
    }

    // Select a public video for conversion
    function selectPublicVideo(file) {
        selectedVideo = file;
        
        // Update the UI
        fileNameElement.textContent = file.name;
        selectedFileDiv.classList.remove('hidden');
        conversionOptionsDiv.classList.remove('hidden');
        
        console.log(`Selected video: ${file.name} (${file.id})`);
    }

    // Handle convert button click
    function handleConvertVideo() {
        if (!selectedVideo) {
            alert('Please select a video first');
            return;
        }
        
        const targetFormat = formatSelect.value;
        
        // Show conversion progress and hide other sections
        conversionOptionsDiv.classList.add('hidden');
        conversionProgressDiv.classList.remove('hidden');
        
        // Reset progress display
        progressBar.style.width = '0%';
        progressPercent.textContent = '0%';
        
        // Send conversion request directly to server
        // The server will handle downloading from Google Drive
        requestServerConversion(selectedVideo, targetFormat);
    }

    // Request server to download and convert the video
    function requestServerConversion(file, targetFormat) {
        // Prepare request data
        const requestData = {
            fileId: file.id,
            fileName: file.name,
            mimeType: file.mimeType,
            targetFormat: targetFormat,
            apiKey: appConfig.googleDriveApiKey
        };
        
        // Send to server for downloading and FFmpeg conversion
        fetch(`${SERVER_URL}/convert-from-drive`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Server error: ' + response.status);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                // Store the download URL
                convertedFileUrl = `${SERVER_URL}${data.downloadUrl}`;
                
                // Start polling for status
                const conversionId = data.conversionId;
                pollConversionStatus(conversionId);
            } else {
                throw new Error(data.error || 'Unknown error occurred');
            }
        })
        .catch(error => {
            console.error('Conversion error:', error);
            alert('An error occurred during conversion: ' + error.message);
            conversionProgressDiv.classList.add('hidden');
            conversionOptionsDiv.classList.remove('hidden');
        });
    }

    // Poll for conversion status
    function pollConversionStatus(conversionId) {
        const statusUrl = `${SERVER_URL}/status/${conversionId}`;
        
        // Check status every second
        const statusInterval = setInterval(() => {
            fetch(statusUrl)
                .then(response => response.json())
                .then(data => {
                    // Update progress
                    const progress = Math.round(data.progress);
                    progressBar.style.width = `${progress}%`;
                    progressPercent.textContent = `${progress}%`;
                    
                    if (data.error) {
                        clearInterval(statusInterval);
                        alert(`Conversion error: ${data.error}`);
                        conversionProgressDiv.classList.add('hidden');
                        conversionOptionsDiv.classList.remove('hidden');
                    }
                    
                    if (data.complete) {
                        clearInterval(statusInterval);
                        
                        // Show download section
                        conversionProgressDiv.classList.add('hidden');
                        downloadSection.classList.remove('hidden');
                    }
                })
                .catch(error => {
                    console.error('Error checking status:', error);
                });
        }, 1000);
    }

    // Handle download button click
    function handleDownload() {
        if (!convertedFileUrl) {
            alert('No converted file available for download.');
            return;
        }
        
        // Open the download URL in a new tab
        window.open(convertedFileUrl, '_blank');
        
        // After download, refresh the files list if on files tab
        if (filesTab.classList.contains('active')) {
            setTimeout(loadConvertedFiles, 1000);
        }
    }
});