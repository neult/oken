package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestHome(t *testing.T) (string, func()) {
	t.Helper()
	tmpDir, err := os.MkdirTemp("", "oken-config-test")
	require.NoError(t, err)

	oldHome := os.Getenv("HOME")
	_ = os.Setenv("HOME", tmpDir)

	return tmpDir, func() {
		_ = os.Setenv("HOME", oldHome)
		_ = os.RemoveAll(tmpDir)
	}
}

func TestPath(t *testing.T) {
	tmpDir, cleanup := setupTestHome(t)
	defer cleanup()

	path, err := Path()
	require.NoError(t, err)
	assert.Equal(t, filepath.Join(tmpDir, ".oken", "config.json"), path)
}

func TestLoadReturnsDefaultsWhenNoFile(t *testing.T) {
	_, cleanup := setupTestHome(t)
	defer cleanup()

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, DefaultEndpoint, cfg.Endpoint)
	assert.Empty(t, cfg.Token)
	assert.Nil(t, cfg.User)
}

func TestLoadParsesValidConfig(t *testing.T) {
	tmpDir, cleanup := setupTestHome(t)
	defer cleanup()

	configDir := filepath.Join(tmpDir, ".oken")
	require.NoError(t, os.MkdirAll(configDir, 0700))

	configData := Config{
		Endpoint: "https://api.example.com",
		Token:    "test-token",
		User:     &User{Email: "test@example.com"},
	}
	data, err := json.Marshal(configData)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(configDir, "config.json"), data, 0600))

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, "https://api.example.com", cfg.Endpoint)
	assert.Equal(t, "test-token", cfg.Token)
	require.NotNil(t, cfg.User)
	assert.Equal(t, "test@example.com", cfg.User.Email)
}

func TestLoadUsesDefaultEndpointWhenEmpty(t *testing.T) {
	tmpDir, cleanup := setupTestHome(t)
	defer cleanup()

	configDir := filepath.Join(tmpDir, ".oken")
	require.NoError(t, os.MkdirAll(configDir, 0700))

	configData := map[string]string{"token": "test-token"}
	data, err := json.Marshal(configData)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(configDir, "config.json"), data, 0600))

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, DefaultEndpoint, cfg.Endpoint)
	assert.Equal(t, "test-token", cfg.Token)
}

func TestLoadReturnsErrorOnInvalidJSON(t *testing.T) {
	tmpDir, cleanup := setupTestHome(t)
	defer cleanup()

	configDir := filepath.Join(tmpDir, ".oken")
	require.NoError(t, os.MkdirAll(configDir, 0700))
	require.NoError(t, os.WriteFile(filepath.Join(configDir, "config.json"), []byte("invalid json"), 0600))

	_, err := Load()
	assert.Error(t, err)
}

func TestSaveCreatesDirectoryAndFile(t *testing.T) {
	tmpDir, cleanup := setupTestHome(t)
	defer cleanup()

	cfg := &Config{
		Endpoint: "https://api.example.com",
		Token:    "test-token",
		User:     &User{Email: "test@example.com"},
	}

	err := Save(cfg)
	require.NoError(t, err)

	// Verify file exists
	configPath := filepath.Join(tmpDir, ".oken", "config.json")
	info, err := os.Stat(configPath)
	require.NoError(t, err)

	// Verify permissions (0600)
	assert.Equal(t, os.FileMode(0600), info.Mode().Perm())

	// Verify content
	data, err := os.ReadFile(configPath)
	require.NoError(t, err)

	var loaded Config
	require.NoError(t, json.Unmarshal(data, &loaded))
	assert.Equal(t, cfg.Endpoint, loaded.Endpoint)
	assert.Equal(t, cfg.Token, loaded.Token)
	require.NotNil(t, loaded.User)
	assert.Equal(t, cfg.User.Email, loaded.User.Email)
}

func TestSaveOverwritesExistingFile(t *testing.T) {
	tmpDir, cleanup := setupTestHome(t)
	defer cleanup()

	configDir := filepath.Join(tmpDir, ".oken")
	require.NoError(t, os.MkdirAll(configDir, 0700))
	require.NoError(t, os.WriteFile(filepath.Join(configDir, "config.json"), []byte(`{"token":"old"}`), 0600))

	cfg := &Config{
		Endpoint: DefaultEndpoint,
		Token:    "new-token",
	}

	err := Save(cfg)
	require.NoError(t, err)

	loaded, err := Load()
	require.NoError(t, err)
	assert.Equal(t, "new-token", loaded.Token)
}
