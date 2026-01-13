package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/neult/oken/apps/cli/internal/api"
	"github.com/neult/oken/apps/cli/internal/config"
	"github.com/neult/oken/apps/cli/internal/ui"
)

var stopCmd = &cobra.Command{
	Use:   "stop <slug>",
	Short: "Stop a running agent",
	Args:  cobra.ExactArgs(1),
	RunE:  runStop,
}

func init() {
	rootCmd.AddCommand(stopCmd)
}

func runStop(cmd *cobra.Command, args []string) error {
	slug := args[0]

	cfg, err := config.Load()
	if err != nil {
		ui.Error("Failed to load config: %v", err)
		return err
	}

	if cfg.Token == "" {
		ui.Error("Not logged in. Run 'oken login' first.")
		return fmt.Errorf("not authenticated")
	}

	client := api.NewClient(cfg.Endpoint, cfg.Token)

	ui.Info("Stopping agent %s...", slug)

	resp, err := client.StopAgent(slug)
	if err != nil {
		ui.Error("Failed to stop agent: %v", err)
		return err
	}

	ui.Success("Agent stopped: %s (status: %s)", resp.Agent.Slug, resp.Agent.Status)

	return nil
}
