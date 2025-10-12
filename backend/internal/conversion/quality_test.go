package conversion

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestResolveQualitySetting_ValidSettings(t *testing.T) {
	tests := []struct {
		name           string
		input          string
		expectedName   string
		expectedCRF    int
		expectedPreset string
	}{
		{"Default Quality", "default", "default", 22, "slow"},
		{"High Quality", "high", "high", 20, "slower"},
		{"Fast Quality", "fast", "fast", 23, "medium"},
		{"Uppercase Default", "DEFAULT", "default", 22, "slow"},
		{"Mixed Case High", "HiGh", "high", 20, "slower"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ResolveQualitySetting(tt.input)
			assert.Equal(t, tt.expectedName, result.Name)
			assert.Equal(t, tt.expectedCRF, result.CRF)
			assert.Equal(t, tt.expectedPreset, result.Preset)
		})
	}
}

func TestResolveQualitySetting_InvalidSettings(t *testing.T) {
	tests := []struct {
		name  string
		input string
	}{
		{"Empty String", ""},
		{"Invalid Name", "invalid"},
		{"Unknown", "unknown"},
		{"Special Chars", "@#$%"},
		{"Nonexistent", "ultra"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ResolveQualitySetting(tt.input)
			assert.Equal(t, "default", result.Name, "Should default to 'default' quality")
			assert.Equal(t, 22, result.CRF)
			assert.Equal(t, "slow", result.Preset)
		})
	}
}

func TestIsValidQualityName_ValidNames(t *testing.T) {
	validNames := []string{"default", "high", "fast", "DEFAULT", "HIGH", "FAST"}
	for _, name := range validNames {
		t.Run(name, func(t *testing.T) {
			assert.True(t, IsValidQualityName(name))
		})
	}
}

func TestIsValidQualityName_InvalidNames(t *testing.T) {
	invalidNames := []string{"", "invalid", "extreme", "ultra", "low", "medium", "123"}
	for _, name := range invalidNames {
		t.Run(name, func(t *testing.T) {
			assert.False(t, IsValidQualityName(name))
		})
	}
}

func TestAvailableQualitySettings(t *testing.T) {
	available := AvailableQualitySettings()
	assert.Len(t, available, 3)

	// Check that all expected settings are present
	names := make([]string, len(available))
	for i, setting := range available {
		names[i] = setting.Name
	}
	assert.Contains(t, names, "default")
	assert.Contains(t, names, "high")
	assert.Contains(t, names, "fast")
}

func TestQualitySettings_Properties(t *testing.T) {
	tests := []struct {
		name           string
		qualityName    string
		expectedCRF    int
		expectedPreset string
	}{
		{"Default Quality", "default", 22, "slow"},
		{"High Quality", "high", 20, "slower"},
		{"Fast Quality", "fast", 23, "medium"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			quality := ResolveQualitySetting(tt.qualityName)
			assert.Equal(t, tt.expectedCRF, quality.CRF)
			assert.Equal(t, tt.expectedPreset, quality.Preset)
			assert.Equal(t, tt.qualityName, quality.Name)
		})
	}
}
