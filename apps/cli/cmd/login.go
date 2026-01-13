package cmd

import (
	"fmt"
	"time"

	"github.com/pkg/browser"
	"github.com/spf13/cobra"

	"github.com/neult/oken/apps/cli/internal/api"
	"github.com/neult/oken/apps/cli/internal/config"
	"github.com/neult/oken/apps/cli/internal/ui"
)

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Authenticate with platform",
	RunE:  runLogin,
}

func init() {
	rootCmd.AddCommand(loginCmd)
}

func runLogin(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		ui.Error("Failed to load config: %v", err)
		return err
	}

	client := api.NewClient(cfg.Endpoint, "")

	// Start device auth
	ui.Info("Starting authentication...")
	authResp, err := client.StartDeviceAuth()
	if err != nil {
		ui.Error("Failed to start authentication: %v", err)
		return err
	}

	// Try to open browser
	fmt.Println()
	browserOpened := false
	if err := browser.OpenURL(authResp.LoginURL); err == nil {
		browserOpened = true
		ui.Success("Opened browser at %s", ui.Cyan(authResp.LoginURL))
	} else {
		ui.Warning("Could not open browser automatically")
		fmt.Printf("  Open this URL in your browser:\n  %s\n", ui.Cyan(authResp.LoginURL))
	}

	fmt.Println()
	fmt.Printf("  Your code: %s\n", ui.Bold(authResp.UserCode))
	fmt.Println()

	if browserOpened {
		ui.Info("Waiting for approval...")
	} else {
		ui.Info("Enter the code above, then waiting for approval...")
	}

	// Poll for approval
	pollInterval := time.Duration(authResp.PollInterval) * time.Second
	if pollInterval == 0 {
		pollInterval = 5 * time.Second
	}
	timeout := 10 * time.Minute

	pollResp, err := client.WaitForDeviceAuth(authResp.SessionID, pollInterval, timeout)
	if err != nil {
		ui.Error("Authentication failed: %v", err)
		return err
	}

	// Save config
	cfg.Token = pollResp.Token
	if pollResp.User != nil {
		cfg.User = &config.User{
			Email: pollResp.User.Email,
		}
	}

	if err := config.Save(cfg); err != nil {
		ui.Error("Failed to save config: %v", err)
		return err
	}

	fmt.Println()
	if cfg.User != nil && cfg.User.Email != "" {
		ui.Success("Logged in as %s", ui.Bold(cfg.User.Email))
	} else {
		ui.Success("Logged in successfully")
	}

	configPath, _ := config.Path()
	ui.Info("Token saved to %s", configPath)

	return nil
}
