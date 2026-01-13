package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStartDeviceAuth(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/auth/device", r.URL.Path)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(DeviceAuthResponse{
			SessionID:    "session-123",
			UserCode:     "ABCD-1234",
			LoginURL:     "https://example.com/login?code=ABCD-1234",
			ExpiresAt:    "2024-01-01T00:00:00Z",
			PollInterval: 5,
		})
	}))
	defer server.Close()

	client := NewClient(server.URL, "")

	resp, err := client.StartDeviceAuth()
	require.NoError(t, err)
	assert.Equal(t, "session-123", resp.SessionID)
	assert.Equal(t, "ABCD-1234", resp.UserCode)
	assert.Equal(t, "https://example.com/login?code=ABCD-1234", resp.LoginURL)
	assert.Equal(t, 5, resp.PollInterval)
}

func TestStartDeviceAuthError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Server error"})
	}))
	defer server.Close()

	client := NewClient(server.URL, "")

	_, err := client.StartDeviceAuth()
	require.Error(t, err)
}

func TestPollDeviceAuthPending(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/api/auth/device/session-123", r.URL.Path)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(DeviceAuthPollResponse{
			Status: "pending",
		})
	}))
	defer server.Close()

	client := NewClient(server.URL, "")

	resp, err := client.PollDeviceAuth("session-123")
	require.NoError(t, err)
	assert.Equal(t, "pending", resp.Status)
	assert.Empty(t, resp.Token)
}

func TestPollDeviceAuthApproved(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(DeviceAuthPollResponse{
			Status: "approved",
			Token:  "ok_test-token",
			User: &struct {
				Email string `json:"email"`
			}{Email: "user@example.com"},
		})
	}))
	defer server.Close()

	client := NewClient(server.URL, "")

	resp, err := client.PollDeviceAuth("session-123")
	require.NoError(t, err)
	assert.Equal(t, "approved", resp.Status)
	assert.Equal(t, "ok_test-token", resp.Token)
	require.NotNil(t, resp.User)
	assert.Equal(t, "user@example.com", resp.User.Email)
}

func TestWaitForDeviceAuthApproved(t *testing.T) {
	var pollCount int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count := atomic.AddInt32(&pollCount, 1)

		w.Header().Set("Content-Type", "application/json")
		if count < 3 {
			_ = json.NewEncoder(w).Encode(DeviceAuthPollResponse{Status: "pending"})
		} else {
			_ = json.NewEncoder(w).Encode(DeviceAuthPollResponse{
				Status: "approved",
				Token:  "ok_test-token",
				User: &struct {
					Email string `json:"email"`
				}{Email: "user@example.com"},
			})
		}
	}))
	defer server.Close()

	client := NewClient(server.URL, "")

	resp, err := client.WaitForDeviceAuth("session-123", 10*time.Millisecond, 5*time.Second)
	require.NoError(t, err)
	assert.Equal(t, "approved", resp.Status)
	assert.Equal(t, "ok_test-token", resp.Token)
	assert.GreaterOrEqual(t, atomic.LoadInt32(&pollCount), int32(3))
}

func TestWaitForDeviceAuthTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(DeviceAuthPollResponse{Status: "pending"})
	}))
	defer server.Close()

	client := NewClient(server.URL, "")

	_, err := client.WaitForDeviceAuth("session-123", 10*time.Millisecond, 50*time.Millisecond)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "timed out")
}

func TestWaitForDeviceAuthExpired(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusGone)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Session expired",
			"code":  "EXPIRED",
		})
	}))
	defer server.Close()

	client := NewClient(server.URL, "")

	_, err := client.WaitForDeviceAuth("session-123", 10*time.Millisecond, 5*time.Second)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "expired")
}

func TestWaitForDeviceAuthServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Server error"})
	}))
	defer server.Close()

	client := NewClient(server.URL, "")

	_, err := client.WaitForDeviceAuth("session-123", 10*time.Millisecond, 5*time.Second)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Server error")
}
