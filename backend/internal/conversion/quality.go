package conversion

import (
	"strings"

	"github.com/gatanasi/video-converter/internal/models"
)

var qualitySettings = map[string]models.QualitySetting{
	"default": {
		Name:   "default",
		Preset: "slow",
		CRF:    22,
	},
	"high": {
		Name:   "high",
		Preset: "slower",
		CRF:    20,
	},
	"fast": {
		Name:   "fast",
		Preset: "medium",
		CRF:    23,
	},
}

// ResolveQualitySetting normalizes the provided name and returns the matching encoder parameters.
// Unknown values fall back to the default quality.
func ResolveQualitySetting(name string) models.QualitySetting {
	key := strings.ToLower(strings.TrimSpace(name))
	if setting, ok := qualitySettings[key]; ok {
		return setting
	}
	return qualitySettings[models.DefaultQualityName]
}

// IsValidQualityName reports whether the provided name matches a configured quality option.
func IsValidQualityName(name string) bool {
	key := strings.ToLower(strings.TrimSpace(name))
	_, ok := qualitySettings[key]
	return ok
}

// AvailableQualitySettings returns the configured quality settings in a predictable order for presentation layers.
func AvailableQualitySettings() []models.QualitySetting {
	return []models.QualitySetting{
		qualitySettings["default"],
		qualitySettings["high"],
		qualitySettings["fast"],
	}
}
