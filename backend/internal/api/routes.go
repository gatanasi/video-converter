package api

// API route path constants
// Centralizes all API endpoint paths to ensure consistency across the application
const (
	// Config routes
	RouteConfig = "/api/config"

	// Video listing routes
	RouteListDriveVideos = "/api/videos/drive"

	// Conversion routes
	RouteConvertFromDrive = "/api/convert/drive"
	RouteConvertUpload    = "/api/convert/upload"

	// Conversion status and management routes
	RouteActiveConversions       = "/api/conversions/active"
	RouteActiveConversionsStream = "/api/conversions/stream"
	RouteConversionStatus        = "/api/conversion/status/"
	RouteConversionAbort         = "/api/conversion/abort/"

	// File management routes
	RouteListFiles  = "/api/files"
	RouteDeleteFile = "/api/file/delete/"

	// Download route
	RouteDownload = "/download/"
)
