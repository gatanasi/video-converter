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

	subscribers      map[chan StoreEvent]struct{}
	subscribersMutex sync.RWMutex
}

// StoreEvent represents a change in conversion status suitable for streaming to clients.
type StoreEvent struct {
	Type         string                           `json:"type"`
	ConversionID string                           `json:"conversionId"`
	Status       *models.ConversionStatusResponse `json:"status,omitempty"`
}

// NewStore creates a new conversion store.
func NewStore() *Store {
	return &Store{
		activeCmds:  make(map[string]*exec.Cmd),
		statuses:    make(map[string]*models.ConversionStatus),
		subscribers: make(map[chan StoreEvent]struct{}),
	}
}

// Subscribe registers a new listener for store events.
func (s *Store) Subscribe() chan StoreEvent {
	ch := make(chan StoreEvent, 16)
	s.subscribersMutex.Lock()
	s.subscribers[ch] = struct{}{}
	s.subscribersMutex.Unlock()

	return ch
}

// Unsubscribe removes a listener and closes its channel.
func (s *Store) Unsubscribe(ch chan StoreEvent) {
	s.subscribersMutex.Lock()
	if _, ok := s.subscribers[ch]; ok {
		delete(s.subscribers, ch)
		close(ch)
	}
	s.subscribersMutex.Unlock()
}

func (s *Store) publish(event StoreEvent) {
	s.subscribersMutex.RLock()
	for ch := range s.subscribers {
		select {
		case ch <- event:
		default:
			// Drop event if subscriber is slow to avoid blocking the store.
		}
	}
	s.subscribersMutex.RUnlock()
}

func (s *Store) publishStatus(id string) {
	status, exists := s.GetStatus(id)
	if !exists {
		return
	}

	response := s.buildStatusResponse(id, status)
	s.publish(StoreEvent{
		Type:         "status",
		ConversionID: id,
		Status:       &response,
	})
}

func (s *Store) publishRemoval(id string) {
	s.publish(StoreEvent{
		Type:         "removed",
		ConversionID: id,
	})
}

// GetAllStatuses returns a copy of all tracked statuses.
func (s *Store) GetAllStatuses() map[string]models.ConversionStatus {
	s.statusesMutex.RLock()
	defer s.statusesMutex.RUnlock()

	snapshot := make(map[string]models.ConversionStatus, len(s.statuses))
	for id, status := range s.statuses {
		snapshot[id] = *status
	}
	return snapshot
}

func (s *Store) buildStatusResponse(id string, status models.ConversionStatus) models.ConversionStatusResponse {
	response := models.ConversionStatusResponse{
		ID:       id,
		FileName: filepath.Base(status.OutputPath),
		Progress: status.Progress,
		Complete: status.Complete,
		Error:    status.Error,
		Format:   status.Format,
		Quality:  status.Quality,
	}

	if status.Complete && status.Error == "" && status.OutputPath != "" {
		response.DownloadURL = "/download/" + filepath.Base(status.OutputPath)
	}

	return response
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
				Quality:  status.Quality,
			})
		}
	}
	return activeJobs
}

// SetStatus adds or updates the status for a conversion ID.
func (s *Store) SetStatus(id string, status *models.ConversionStatus) {
	s.statusesMutex.Lock()
	s.statuses[id] = status
	s.statusesMutex.Unlock()

	s.publishStatus(id)
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
	_, existed := s.statuses[id]
	if existed {
		delete(s.statuses, id)
	}
	s.statusesMutex.Unlock()

	if existed {
		s.publishRemoval(id)
	}
}

// UpdateStatusWithError updates the status to indicate completion with an error.
func (s *Store) UpdateStatusWithError(id, errorMsg string) {
	s.statusesMutex.Lock()
	updated := false
	if status, exists := s.statuses[id]; exists {
		// Only update if not already marked complete
		if !status.Complete {
			status.Error = errorMsg
			status.Complete = true
			status.Progress = 0 // Reset progress on error
			updated = true
		}
	}
	s.statusesMutex.Unlock()

	if updated {
		s.publishStatus(id)
	}
}

// SetProgressPercentage updates the progress percentage for a conversion.
// It caps the progress at 99.0% until explicitly marked as 100% on success.
func (s *Store) SetProgressPercentage(id string, percentage float64) {
	s.statusesMutex.Lock()
	updated := false
	if status, exists := s.statuses[id]; exists {
		// Only update if not already completed or errored
		if !status.Complete && status.Error == "" {
			// Clamp percentage between 0 and 99
			progress := percentage
			if progress < 0 {
				progress = 0
			} else if progress > 99.0 {
				progress = 99.0
			}
			status.Progress = progress
			updated = true
		}
	}
	s.statusesMutex.Unlock()

	if updated {
		s.publishStatus(id)
	}
}

// UpdateStatusOnSuccess marks the conversion as complete and successful.
func (s *Store) UpdateStatusOnSuccess(id string) {
	s.statusesMutex.Lock()
	updated := false
	if status, exists := s.statuses[id]; exists {
		// Only update if not already marked complete (e.g., by an abort)
		if !status.Complete {
			status.Complete = true
			status.Progress = 100.0
			status.Error = "" // Ensure no previous error lingers
			updated = true
		}
	}
	s.statusesMutex.Unlock()

	if updated {
		s.publishStatus(id)
	}
}
