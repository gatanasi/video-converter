// Package middleware contains HTTP middleware functions
package middleware

import (
	"log"
	"net/http"
	"strings"
)

// AllowedOriginsMap stores allowed origins for quick lookups.
var AllowedOriginsMap map[string]bool

// InitCORS initializes the CORS configuration.
func InitCORS(allowedOrigins []string) {
	AllowedOriginsMap = make(map[string]bool)
	hasWildcard := false
	for _, origin := range allowedOrigins {
		trimmedOrigin := strings.TrimSpace(origin)
		if trimmedOrigin == "*" {
			hasWildcard = true
			break // Wildcard overrides specific origins
		}
		if trimmedOrigin != "" {
			AllowedOriginsMap[trimmedOrigin] = true
		}
	}
	// If wildcard is present, clear specific origins and just store wildcard
	if hasWildcard {
		AllowedOriginsMap = map[string]bool{"*": true}
		log.Println("CORS initialized: Allowing all origins (*)")
	} else {
		log.Printf("CORS initialized: Allowing specific origins: %v", allowedOrigins)
	}
}

// CORS middleware handles Cross-Origin Resource Sharing headers.
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		originAllowed := false
		allowOriginValue := ""

		// Check if all origins are allowed
		if AllowedOriginsMap["*"] {
			originAllowed = true
			allowOriginValue = "*"
		} else if origin != "" {
			// Check if the specific origin is allowed
			if AllowedOriginsMap[origin] {
				originAllowed = true
				allowOriginValue = origin // Reflect the specific origin
				// Vary header is important when reflecting specific origins
				w.Header().Add("Vary", "Origin")
			}
		} else {
			// Requests without an Origin header (e.g., same-origin, curl) are typically allowed implicitly
			// No CORS headers needed for these.
		}

		// Set headers only if an origin was present and allowed
		if origin != "" && originAllowed {
			w.Header().Set("Access-Control-Allow-Origin", allowOriginValue)
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE") // Adjust methods as needed
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")     // Adjust headers as needed
			w.Header().Set("Access-Control-Allow-Credentials", "true")                       // If using credentials
		}

		// Handle preflight (OPTIONS) requests
		if r.Method == http.MethodOptions {
			if origin != "" && originAllowed {
				// Preflight request is allowed, send OK status
				w.WriteHeader(http.StatusOK)
			} else {
				// Preflight request from disallowed origin or without origin header
				http.Error(w, "CORS preflight check failed", http.StatusForbidden)
			}
			return // Stop processing for OPTIONS requests
		}

		// For actual requests: if an origin was provided but not allowed, block it.
		if origin != "" && !originAllowed {
			http.Error(w, "CORS origin not allowed", http.StatusForbidden)
			return
		}

		// Call the next handler in the chain
		next.ServeHTTP(w, r)
	})
}