package api

import (
	"fmt"
	"net/url"
)

// Secret represents a secret from the platform
type Secret struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	AgentSlug *string `json:"agentSlug"`
	CreatedAt string  `json:"createdAt"`
}

// SecretsListResponse is returned when listing secrets
type SecretsListResponse struct {
	Secrets []Secret `json:"secrets"`
}

// SetSecretRequest is the request body for setting a secret
type SetSecretRequest struct {
	Name      string  `json:"name"`
	Value     string  `json:"value"`
	AgentSlug *string `json:"agentSlug,omitempty"`
}

// SetSecretResponse is returned when setting a secret
type SetSecretResponse struct {
	Message   string  `json:"message"`
	Name      string  `json:"name"`
	AgentSlug *string `json:"agentSlug"`
}

// DeleteSecretResponse is returned when deleting a secret
type DeleteSecretResponse struct {
	Message string `json:"message"`
	Name    string `json:"name"`
}

// ListSecrets returns all secrets for the authenticated user
func (c *Client) ListSecrets(agentSlug string) (*SecretsListResponse, error) {
	path := "/api/secrets"
	if agentSlug != "" {
		path = fmt.Sprintf("/api/secrets?agent=%s", url.QueryEscape(agentSlug))
	}

	var resp SecretsListResponse
	if err := c.Get(path, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// SetSecret creates or updates a secret
func (c *Client) SetSecret(name, value string, agentSlug *string) (*SetSecretResponse, error) {
	body := SetSecretRequest{
		Name:      name,
		Value:     value,
		AgentSlug: agentSlug,
	}

	var resp SetSecretResponse
	if err := c.Post("/api/secrets", body, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// DeleteSecret deletes a secret
func (c *Client) DeleteSecret(name string, agentSlug string) (*DeleteSecretResponse, error) {
	path := fmt.Sprintf("/api/secrets?name=%s", url.QueryEscape(name))
	if agentSlug != "" {
		path = fmt.Sprintf("%s&agent=%s", path, url.QueryEscape(agentSlug))
	}

	var resp DeleteSecretResponse
	if err := c.Delete(path, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}
