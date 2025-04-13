// Package middleware contains HTTP middleware functions
package middleware

import (
	"net/http"
)

// AllowedOriginsMap stores the allowed origins for fast lookup
var AllowedOriginsMap map[string]bool

// InitCORS initializes the allowed origins map for CORS middleware
func InitCORS(allowedOrigins []string) {
	AllowedOriginsMap = make(map[string]bool)
	for _, origin := range allowedOrigins {
		AllowedOriginsMap[origin] = true
	}
}

// CORS middleware handles Cross-Origin Resource Sharing
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		originAllowed := false

		// Check if the request origin is in our allowed list or if we allow all (*)
		if _, ok := AllowedOriginsMap["*"]; ok {
			originAllowed = true
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else if origin != "" {
			if _, ok := AllowedOriginsMap[origin]; ok {
				originAllowed = true
				// Set the specific origin that is allowed
				w.Header().Set("Access-Control-Allow-Origin", origin)
				// Vary header is important when reflecting specific origin
				w.Header().Set("Vary", "Origin")
			}
		}
		// If origin is "" (e.g. same-origin request or curl), it's usually implicitly allowed

		if originAllowed {
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		}

		// Handle preflight requests (OPTIONS)
		if r.Method == "OPTIONS" {
			if originAllowed {
				w.WriteHeader(http.StatusOK) // Allow preflight if origin is ok
			} else {
				// If origin is not allowed, deny preflight
				http.Error(w, "CORS origin not allowed", http.StatusForbidden)
			}
			return // Stop processing for OPTIONS requests
		}

		// For actual requests, if origin was provided but not allowed, block it.
		// (Requests without Origin header or from allowed origins will pass through)
		// Note: Browsers typically *always* send Origin for cross-origin requests.
		if origin != "" && !originAllowed && !AllowedOriginsMap["*"] {
			http.Error(w, "CORS origin not allowed", http.StatusForbidden)
			return
		}

		// Call the next handler in the chain
		next.ServeHTTP(w, r)
	})
}