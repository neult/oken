package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewClient(t *testing.T) {
	client := NewClient("https://api.example.com", "test-token")

	assert.Equal(t, "https://api.example.com", client.BaseURL)
	assert.Equal(t, "test-token", client.Token)
	assert.NotNil(t, client.HTTPClient)
	assert.NotNil(t, client.UploadClient)
}

func TestClientGet(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/api/test", r.URL.Path)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"message": "success"})
	}))
	defer server.Close()

	client := NewClient(server.URL, "")

	var result map[string]string
	err := client.Get("/api/test", &result)
	require.NoError(t, err)
	assert.Equal(t, "success", result["message"])
}

func TestClientPost(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/test", r.URL.Path)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))

		var body map[string]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		assert.Equal(t, "value", body["key"])

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "created"})
	}))
	defer server.Close()

	client := NewClient(server.URL, "")

	var result map[string]string
	err := client.Post("/api/test", map[string]string{"key": "value"}, &result)
	require.NoError(t, err)
	assert.Equal(t, "created", result["status"])
}

func TestClientDelete(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodDelete, r.Method)
		assert.Equal(t, "/api/test", r.URL.Path)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}))
	defer server.Close()

	client := NewClient(server.URL, "")

	var result map[string]string
	err := client.Delete("/api/test", &result)
	require.NoError(t, err)
	assert.Equal(t, "deleted", result["status"])
}

func TestClientAuthHeader(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "Bearer test-token", r.Header.Get("Authorization"))

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{})
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-token")

	var result map[string]string
	err := client.Get("/api/test", &result)
	require.NoError(t, err)
}

func TestClientNoAuthHeaderWhenNoToken(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Empty(t, r.Header.Get("Authorization"))

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{})
	}))
	defer server.Close()

	client := NewClient(server.URL, "")

	var result map[string]string
	err := client.Get("/api/test", &result)
	require.NoError(t, err)
}

func TestClientAPIErrorWithCode(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Invalid request",
			"code":  "INVALID_REQUEST",
		})
	}))
	defer server.Close()

	client := NewClient(server.URL, "")

	var result map[string]string
	err := client.Get("/api/test", &result)
	require.Error(t, err)

	apiErr, ok := err.(*APIError)
	require.True(t, ok)
	assert.Equal(t, http.StatusBadRequest, apiErr.StatusCode)
	assert.Equal(t, "Invalid request", apiErr.Message)
	assert.Equal(t, "INVALID_REQUEST", apiErr.Code)
	assert.Equal(t, "Invalid request (INVALID_REQUEST)", apiErr.Error())
}

func TestClientAPIErrorWithoutCode(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Something went wrong",
		})
	}))
	defer server.Close()

	client := NewClient(server.URL, "")

	var result map[string]string
	err := client.Get("/api/test", &result)
	require.Error(t, err)

	apiErr, ok := err.(*APIError)
	require.True(t, ok)
	assert.Equal(t, http.StatusInternalServerError, apiErr.StatusCode)
	assert.Equal(t, "Something went wrong", apiErr.Message)
	assert.Empty(t, apiErr.Code)
	assert.Equal(t, "Something went wrong", apiErr.Error())
}

func TestClientAPIErrorNonJSONResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte("Service Unavailable"))
	}))
	defer server.Close()

	client := NewClient(server.URL, "")

	var result map[string]string
	err := client.Get("/api/test", &result)
	require.Error(t, err)

	apiErr, ok := err.(*APIError)
	require.True(t, ok)
	assert.Equal(t, http.StatusServiceUnavailable, apiErr.StatusCode)
	assert.Contains(t, apiErr.Message, "503")
}

func TestClientPostWithNilBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}))
	defer server.Close()

	client := NewClient(server.URL, "")

	var result map[string]string
	err := client.Post("/api/test", nil, &result)
	require.NoError(t, err)
	assert.Equal(t, "ok", result["status"])
}

func TestClientGetWithNilResult(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	client := NewClient(server.URL, "")

	err := client.Get("/api/test", nil)
	require.NoError(t, err)
}
