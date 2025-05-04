package utils

import "fmt"

// BytesToMB converts bytes to megabytes.
func BytesToMB(bytes int64) float64 {
	return float64(bytes) / (1024 * 1024)
}

// FormatBytesToMB formats bytes into a string representation in MB.
func FormatBytesToMB(bytes int64) string {
	return fmt.Sprintf("%.2f MB", BytesToMB(bytes))
}
