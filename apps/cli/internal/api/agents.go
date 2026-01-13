package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"regexp"
)

var slugPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$`)

// validateSlug checks that a slug is safe for use in URL paths
func validateSlug(slug string) error {
	if slug == "" {
		return fmt.Errorf("slug cannot be empty")
	}
	if len(slug) > 63 {
		return fmt.Errorf("slug too long (max 63 characters)")
	}
	if !slugPattern.MatchString(slug) {
		return fmt.Errorf("invalid slug: must contain only lowercase letters, numbers, and hyphens")
	}
	return nil
}

// Agent represents an agent from the platform
type Agent struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Slug          string  `json:"slug"`
	Status        string  `json:"status"`
	Endpoint      *string `json:"endpoint"`
	PythonVersion *string `json:"pythonVersion"`
	Entrypoint    *string `json:"entrypoint"`
	CreatedAt     string  `json:"createdAt"`
	UpdatedAt     string  `json:"updatedAt"`
}

// AgentListResponse is returned when listing agents
type AgentListResponse struct {
	Agents []Agent `json:"agents"`
}

// DeployResponse is returned when deploying an agent
type DeployResponse struct {
	Agent      Agent `json:"agent"`
	Deployment struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	} `json:"deployment"`
}

// InvokeResponse is returned when invoking an agent
type InvokeResponse struct {
	Output map[string]any `json:"output"`
	Error  string         `json:"error,omitempty"`
}

// StopResponse is returned when stopping an agent
type StopResponse struct {
	Agent   Agent  `json:"agent"`
	Message string `json:"message"`
}

// DeleteResponse is returned when deleting an agent
type DeleteResponse struct {
	Message string `json:"message"`
}

// ListAgents returns all agents for the authenticated user
func (c *Client) ListAgents() (*AgentListResponse, error) {
	var resp AgentListResponse
	if err := c.Get("/api/agents", &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// GetAgent returns a single agent by slug
func (c *Client) GetAgent(slug string) (*Agent, error) {
	if err := validateSlug(slug); err != nil {
		return nil, err
	}
	var resp Agent
	if err := c.Get(fmt.Sprintf("/api/agents/%s", slug), &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// DeployAgent deploys an agent with the given tarball
func (c *Client) DeployAgent(name, slug string, tarball io.Reader) (*DeployResponse, error) {
	if err := validateSlug(slug); err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	if err := writer.WriteField("name", name); err != nil {
		return nil, err
	}
	if err := writer.WriteField("slug", slug); err != nil {
		return nil, err
	}

	part, err := writer.CreateFormFile("tarball", "agent.tar.gz")
	if err != nil {
		return nil, err
	}
	if _, err := io.Copy(part, tarball); err != nil {
		return nil, err
	}

	if err := writer.Close(); err != nil {
		return nil, err
	}

	req, err := http.NewRequest(http.MethodPost, c.BaseURL+"/api/agents", &buf)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", writer.FormDataContentType())
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}

	httpResp, err := c.UploadClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = httpResp.Body.Close() }()

	respBody, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return nil, err
	}

	if httpResp.StatusCode >= 400 {
		var errResp struct {
			Error string `json:"error"`
			Code  string `json:"code"`
		}
		if err := json.Unmarshal(respBody, &errResp); err == nil && errResp.Error != "" {
			return nil, &APIError{
				StatusCode: httpResp.StatusCode,
				Message:    errResp.Error,
				Code:       errResp.Code,
			}
		}
		return nil, &APIError{
			StatusCode: httpResp.StatusCode,
			Message:    fmt.Sprintf("request failed with status %d", httpResp.StatusCode),
		}
	}

	var resp DeployResponse
	if err := json.Unmarshal(respBody, &resp); err != nil {
		return nil, err
	}

	return &resp, nil
}

// StopAgent stops a running agent
func (c *Client) StopAgent(slug string) (*StopResponse, error) {
	if err := validateSlug(slug); err != nil {
		return nil, err
	}
	var resp StopResponse
	if err := c.Post(fmt.Sprintf("/api/agents/%s/stop", slug), nil, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// DeleteAgent deletes an agent
func (c *Client) DeleteAgent(slug string) (*DeleteResponse, error) {
	if err := validateSlug(slug); err != nil {
		return nil, err
	}
	var resp DeleteResponse
	if err := c.Delete(fmt.Sprintf("/api/agents/%s", slug), &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// InvokeAgent invokes an agent with the given input
func (c *Client) InvokeAgent(slug string, input map[string]any) (*InvokeResponse, error) {
	if err := validateSlug(slug); err != nil {
		return nil, err
	}
	body := map[string]any{"input": input}
	var resp InvokeResponse
	if err := c.Post(fmt.Sprintf("/api/agents/%s/invoke", slug), body, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}
