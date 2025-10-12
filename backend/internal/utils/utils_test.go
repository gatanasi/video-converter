package utils

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestBytesToMB(t *testing.T) {
	tests := []struct {
		name     string
		bytes    int64
		expected float64
	}{
		{
			name:     "zero bytes",
			bytes:    0,
			expected: 0.0,
		},
		{
			name:     "1 MB",
			bytes:    1024 * 1024,
			expected: 1.0,
		},
		{
			name:     "5 MB",
			bytes:    5 * 1024 * 1024,
			expected: 5.0,
		},
		{
			name:     "100 MB",
			bytes:    100 * 1024 * 1024,
			expected: 100.0,
		},
		{
			name:     "half MB",
			bytes:    512 * 1024,
			expected: 0.5,
		},
		{
			name:     "1 GB",
			bytes:    1024 * 1024 * 1024,
			expected: 1024.0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := BytesToMB(tt.bytes)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestFormatBytesToMB(t *testing.T) {
	tests := []struct {
		name     string
		bytes    int64
		expected string
	}{
		{
			name:     "zero bytes",
			bytes:    0,
			expected: "0.00 MB",
		},
		{
			name:     "1 MB",
			bytes:    1024 * 1024,
			expected: "1.00 MB",
		},
		{
			name:     "5.5 MB",
			bytes:    5*1024*1024 + 512*1024,
			expected: "5.50 MB",
		},
		{
			name:     "100.25 MB",
			bytes:    100*1024*1024 + 256*1024,
			expected: "100.25 MB",
		},
		{
			name:     "fractional MB",
			bytes:    1536 * 1024, // 1.5 MB
			expected: "1.50 MB",
		},
		{
			name:     "very large file",
			bytes:    2048 * 1024 * 1024, // 2 GB
			expected: "2048.00 MB",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := FormatBytesToMB(tt.bytes)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// Benchmark tests
func BenchmarkBytesToMB(b *testing.B) {
	bytes := int64(100 * 1024 * 1024)
	for i := 0; i < b.N; i++ {
		BytesToMB(bytes)
	}
}

func BenchmarkFormatBytesToMB(b *testing.B) {
	bytes := int64(100 * 1024 * 1024)
	for i := 0; i < b.N; i++ {
		FormatBytesToMB(bytes)
	}
}
