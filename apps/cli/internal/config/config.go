package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type User struct {
	Email string `json:"email"`
}

type Config struct {
	Endpoint string `json:"endpoint"`
	Token    string `json:"token"`
	User     *User  `json:"user,omitempty"`
}

const (
	DefaultEndpoint = "http://localhost:3000"
	configDir       = ".oken"
	configFile      = "config.json"
)

// Path returns the full path to the config file
func Path() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, configDir, configFile), nil
}

// Load reads the config from disk, returning defaults if not found
func Load() (*Config, error) {
	cfg := &Config{
		Endpoint: DefaultEndpoint,
	}

	path, err := Path()
	if err != nil {
		return nil, fmt.Errorf("failed to determine config path: %w", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return nil, err
	}

	// Warn if config file has insecure permissions
	if info, err := os.Stat(path); err == nil {
		mode := info.Mode().Perm()
		if mode&0077 != 0 {
			fmt.Fprintf(os.Stderr, "Warning: config file %s has insecure permissions %04o\n", path, mode)
		}
	}

	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, err
	}

	if cfg.Endpoint == "" {
		cfg.Endpoint = DefaultEndpoint
	}

	return cfg, nil
}

// Save writes the config to disk
func Save(cfg *Config) error {
	path, err := Path()
	if err != nil {
		return err
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0600)
}
