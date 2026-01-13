package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateSlug(t *testing.T) {
	tests := []struct {
		name    string
		slug    string
		wantErr bool
	}{
		// Valid slugs
		{"single char", "a", false},
		{"single digit", "1", false},
		{"simple", "abc", false},
		{"with hyphen", "my-agent", false},
		{"with numbers", "agent-123", false},
		{"numbers and letters", "a1b2c3", false},
		{"max length", strings.Repeat("a", 63), false},

		// Invalid slugs
		{"empty", "", true},
		{"too long", strings.Repeat("a", 64), true},
		{"uppercase", "MyAgent", true},
		{"all uppercase", "AGENT", true},
		{"underscore", "my_agent", true},
		{"dot", "my.agent", true},
		{"space", "my agent", true},
		{"leading hyphen", "-agent", true},
		{"trailing hyphen", "agent-", true},
		{"special char", "agent@test", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateSlug(tt.slug)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestValidateSlugErrorMessages(t *testing.T) {
	err := validateSlug("")
	assert.EqualError(t, err, "slug cannot be empty")

	err = validateSlug(strings.Repeat("a", 64))
	assert.EqualError(t, err, "slug too long (max 63 characters)")

	err = validateSlug("INVALID")
	assert.EqualError(t, err, "invalid slug: must contain only lowercase letters, numbers, and hyphens")
}

func TestListAgents(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/api/agents", r.URL.Path)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(AgentListResponse{
			Agents: []Agent{
				{ID: "1", Name: "Agent 1", Slug: "agent-1", Status: "running"},
				{ID: "2", Name: "Agent 2", Slug: "agent-2", Status: "stopped"},
			},
		})
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-token")

	resp, err := client.ListAgents()
	require.NoError(t, err)
	assert.Len(t, resp.Agents, 2)
	assert.Equal(t, "agent-1", resp.Agents[0].Slug)
	assert.Equal(t, "agent-2", resp.Agents[1].Slug)
}

func TestGetAgent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/api/agents/my-agent", r.URL.Path)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(Agent{
			ID:     "123",
			Name:   "My Agent",
			Slug:   "my-agent",
			Status: "running",
		})
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-token")

	agent, err := client.GetAgent("my-agent")
	require.NoError(t, err)
	assert.Equal(t, "123", agent.ID)
	assert.Equal(t, "My Agent", agent.Name)
	assert.Equal(t, "running", agent.Status)
}

func TestGetAgentInvalidSlug(t *testing.T) {
	client := NewClient("http://localhost", "test-token")

	_, err := client.GetAgent("INVALID")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid slug")
}

func TestStopAgent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/agents/my-agent/stop", r.URL.Path)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(StopResponse{
			Agent:   Agent{ID: "123", Slug: "my-agent", Status: "stopped"},
			Message: "Agent stopped",
		})
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-token")

	resp, err := client.StopAgent("my-agent")
	require.NoError(t, err)
	assert.Equal(t, "stopped", resp.Agent.Status)
	assert.Equal(t, "Agent stopped", resp.Message)
}

func TestStopAgentInvalidSlug(t *testing.T) {
	client := NewClient("http://localhost", "test-token")

	_, err := client.StopAgent("")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "empty")
}

func TestDeleteAgent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodDelete, r.Method)
		assert.Equal(t, "/api/agents/my-agent", r.URL.Path)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(DeleteResponse{Message: "Agent deleted"})
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-token")

	resp, err := client.DeleteAgent("my-agent")
	require.NoError(t, err)
	assert.Equal(t, "Agent deleted", resp.Message)
}

func TestDeleteAgentInvalidSlug(t *testing.T) {
	client := NewClient("http://localhost", "test-token")

	_, err := client.DeleteAgent("-invalid")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid slug")
}

func TestInvokeAgent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/agents/my-agent/invoke", r.URL.Path)

		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		assert.Contains(t, body, "input")

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(InvokeResponse{
			Output: map[string]any{"result": "success"},
		})
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-token")

	resp, err := client.InvokeAgent("my-agent", map[string]any{"query": "test"})
	require.NoError(t, err)
	assert.Equal(t, "success", resp.Output["result"])
}

func TestInvokeAgentInvalidSlug(t *testing.T) {
	client := NewClient("http://localhost", "test-token")

	_, err := client.InvokeAgent("agent-", map[string]any{})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid slug")
}

func TestDeployAgent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/agents", r.URL.Path)
		assert.Contains(t, r.Header.Get("Content-Type"), "multipart/form-data")
		assert.Equal(t, "Bearer test-token", r.Header.Get("Authorization"))

		err := r.ParseMultipartForm(10 << 20)
		require.NoError(t, err)

		assert.Equal(t, "My Agent", r.FormValue("name"))
		assert.Equal(t, "my-agent", r.FormValue("slug"))

		file, _, err := r.FormFile("tarball")
		require.NoError(t, err)
		defer func() { _ = file.Close() }()

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(DeployResponse{
			Agent: Agent{
				ID:     "123",
				Name:   "My Agent",
				Slug:   "my-agent",
				Status: "deploying",
			},
			Deployment: struct {
				ID     string `json:"id"`
				Status string `json:"status"`
			}{
				ID:     "deploy-456",
				Status: "pending",
			},
		})
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-token")

	tarball := strings.NewReader("fake tarball content")
	resp, err := client.DeployAgent("My Agent", "my-agent", tarball)
	require.NoError(t, err)
	assert.Equal(t, "123", resp.Agent.ID)
	assert.Equal(t, "my-agent", resp.Agent.Slug)
	assert.Equal(t, "deploying", resp.Agent.Status)
	assert.Equal(t, "deploy-456", resp.Deployment.ID)
}

func TestDeployAgentInvalidSlug(t *testing.T) {
	client := NewClient("http://localhost", "test-token")

	_, err := client.DeployAgent("My Agent", "INVALID", strings.NewReader(""))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid slug")
}

func TestDeployAgentServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Agent already exists",
			"code":  "DUPLICATE_SLUG",
		})
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-token")

	_, err := client.DeployAgent("My Agent", "my-agent", strings.NewReader(""))
	require.Error(t, err)

	apiErr, ok := err.(*APIError)
	require.True(t, ok)
	assert.Equal(t, http.StatusBadRequest, apiErr.StatusCode)
	assert.Equal(t, "Agent already exists", apiErr.Message)
	assert.Equal(t, "DUPLICATE_SLUG", apiErr.Code)
}
