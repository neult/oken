package api

import (
	"fmt"
	"net/url"
	"time"
)

// DeviceAuthResponse is returned when starting device auth
type DeviceAuthResponse struct {
	SessionID    string `json:"sessionId"`
	UserCode     string `json:"userCode"`
	LoginURL     string `json:"loginUrl"`
	ExpiresAt    string `json:"expiresAt"`
	PollInterval int    `json:"pollInterval"`
}

// DeviceAuthPollResponse is returned when polling for auth status
type DeviceAuthPollResponse struct {
	Status string `json:"status"` // "pending" or "approved"
	Token  string `json:"token,omitempty"`
	User   *struct {
		Email string `json:"email"`
	} `json:"user,omitempty"`
}

// StartDeviceAuth initiates the device auth flow
func (c *Client) StartDeviceAuth() (*DeviceAuthResponse, error) {
	var resp DeviceAuthResponse
	if err := c.Post("/api/auth/device", nil, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// PollDeviceAuth checks the status of a device auth session
func (c *Client) PollDeviceAuth(sessionID string) (*DeviceAuthPollResponse, error) {
	if sessionID == "" {
		return nil, fmt.Errorf("session ID cannot be empty")
	}
	var resp DeviceAuthPollResponse
	if err := c.Get(fmt.Sprintf("/api/auth/device/%s", url.PathEscape(sessionID)), &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// WaitForDeviceAuth polls until the session is approved or expires
func (c *Client) WaitForDeviceAuth(sessionID string, interval time.Duration, timeout time.Duration) (*DeviceAuthPollResponse, error) {
	deadline := time.Now().Add(timeout)

	for {
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("authentication timed out")
		}

		resp, err := c.PollDeviceAuth(sessionID)
		if err != nil {
			// Check if it's an expiration error
			if apiErr, ok := err.(*APIError); ok {
				if apiErr.Code == "EXPIRED" {
					return nil, fmt.Errorf("authentication session expired")
				}
			}
			return nil, err
		}

		if resp.Status == "approved" {
			return resp, nil
		}

		// Wait before next poll
		time.Sleep(interval)
	}
}
