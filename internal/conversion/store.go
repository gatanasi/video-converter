package conversion

import (
	"os/exec"
	"path/filepath"
	"sync"

	"github.com/gatanasi/video-converter/internal/models"
)

// Store manages the state of active conversions and their statuses.
// It is safe for concurrent use.
type Store struct {
	activeCmds      map[string]*exec.Cmd
	activeCmdsMutex sync.RWMutex

	statuses      map[string]*models.ConversionStatus
	statusesMutex sync.RWMutex
}

// NewStore creates a new conversion store.
func NewStore() *Store {
	return &Store{
		activeCmds: make(map[string]*exec.Cmd),
		statuses:   make(map[string]*models.ConversionStatus),
	}
}

// RegisterActiveCmd tracks a running FFmpeg command.
func (s *Store) RegisterActiveCmd(id string, cmd *exec.Cmd) {
	s.activeCmdsMutex.Lock()
	defer s.activeCmdsMutex.Unlock()
	s.activeCmds[id] = cmd
}

// UnregisterActiveCmd removes a command when it finishes or is aborted.
func (s *Store) UnregisterActiveCmd(id string) {
	s.activeCmdsMutex.Lock()
	defer s.activeCmdsMutex.Unlock()
	delete(s.activeCmds, id)
}

// GetActiveCmd retrieves the command for an active conversion ID.
func (s *Store) GetActiveCmd(id string) (*exec.Cmd, bool) {
	s.activeCmdsMutex.RLock()
	defer s.activeCmdsMutex.RUnlock()
	cmd, exists := s.activeCmds[id]
	return cmd, exists
}

// GetActiveConversionsInfo returns details for all currently active conversions.
func (s *Store) GetActiveConversionsInfo() []models.ActiveConversionInfo {
	s.activeCmdsMutex.RLock()
	s.statusesMutex.RLock() // Lock both for consistency
	defer s.statusesMutex.RUnlock()
	defer s.activeCmdsMutex.RUnlock()

	activeJobs := make([]models.ActiveConversionInfo, 0, len(s.activeCmds))
	for id := range s.activeCmds {
		// Check if status exists and is not complete
		if status, ok := s.statuses[id]; ok && !status.Complete {
			activeJobs = append(activeJobs, models.ActiveConversionInfo{
				ID:       id,
				FileName: filepath.Base(status.OutputPath), // Use OutputPath from status
				Format:   status.Format,
				Progress: status.Progress,
			})
		}
	}
	return activeJobs
}

// SetStatus adds or updates the status for a conversion ID.
func (s *Store) SetStatus(id string, status *models.ConversionStatus) {
	s.statusesMutex.Lock()
	defer s.statusesMutex.Unlock()
	s.statuses[id] = status
}

// GetStatus retrieves a copy of the status for a conversion ID.
// Returns the status and true if found, otherwise zero value and false.
func (s *Store) GetStatus(id string) (models.ConversionStatus, bool) {
	s.statusesMutex.RLock()
	defer s.statusesMutex.RUnlock()
	status, exists := s.statuses[id]
	if !exists {
		return models.ConversionStatus{}, false
	}
	// Return a copy to prevent race conditions if caller modifies it
	statusCopy := *status
	return statusCopy, true
}

// DeleteStatus removes the status entry for a given ID.
func (s *Store) DeleteStatus(id string) {
	s.statusesMutex.Lock()
	defer s.statusesMutex.Unlock()
	delete(s.statuses, id)
}

// UpdateStatusWithError updates the status to indicate completion with an error.
func (s *Store) UpdateStatusWithError(id, errorMsg string) {
	s.statusesMutex.Lock()
	defer s.statusesMutex.Unlock()
	if status, exists := s.statuses[id]; exists {
		// Only update if not already marked complete
		if !status.Complete {
			status.Error = errorMsg
			status.Complete = true
			status.Progress = 0 // Reset progress on error
		}
	}
}

// UpdateProgress updates the progress for a conversion.
func (s *Store) UpdateProgress(id string, increment float64) {
	s.statusesMutex.Lock()
	defer s.statusesMutex.Unlock()
	if status, exists := s.statuses[id]; exists {
		// Only update if not already completed or errored
		if !status.Complete && status.Error == "" {
			// Increment progress slightly, capped at 99% until 'progress=end'
			if status.Progress < 99.0 {
				status.Progress += increment
				if status.Progress > 99.0 {
					status.Progress = 99.0
				}
			}
		}
	}
}

// UpdateStatusOnSuccess marks the conversion as complete and successful.
func (s *Store) UpdateStatusOnSuccess(id string) {
	s.statusesMutex.Lock()
	defer s.statusesMutex.Unlock()
	if status, exists := s.statuses[id]; exists {
		// Only update if not already marked complete (e.g., by an abort)
		if !status.Complete {
			status.Complete = true
			status.Progress = 100.0
			status.Error = "" // Ensure no previous error lingers
		}
	}
}
