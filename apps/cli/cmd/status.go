package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/neult/oken/apps/cli/internal/api"
	"github.com/neult/oken/apps/cli/internal/config"
	"github.com/neult/oken/apps/cli/internal/ui"
)

var statusCmd = &cobra.Command{
	Use:   "status <slug>",
	Short: "Get agent status",
	Args:  cobra.ExactArgs(1),
	RunE:  runStatus,
}

func init() {
	rootCmd.AddCommand(statusCmd)
}

func runStatus(cmd *cobra.Command, args []string) error {
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

	agent, err := client.GetAgent(slug)
	if err != nil {
		ui.Error("Failed to get agent: %v", err)
		return err
	}

	fmt.Printf("Name:       %s\n", agent.Name)
	fmt.Printf("Slug:       %s\n", agent.Slug)
	fmt.Printf("Status:     %s\n", agent.Status)

	if agent.Endpoint != nil && *agent.Endpoint != "" {
		fmt.Printf("Endpoint:   %s\n", *agent.Endpoint)
	}
	if agent.PythonVersion != nil && *agent.PythonVersion != "" {
		fmt.Printf("Python:     %s\n", *agent.PythonVersion)
	}
	if agent.Entrypoint != nil && *agent.Entrypoint != "" {
		fmt.Printf("Entrypoint: %s\n", *agent.Entrypoint)
	}

	fmt.Printf("Created:    %s\n", agent.CreatedAt)
	fmt.Printf("Updated:    %s\n", agent.UpdatedAt)

	return nil
}
