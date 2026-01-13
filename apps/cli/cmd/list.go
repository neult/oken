package cmd

import (
	"fmt"
	"os"
	"text/tabwriter"

	"github.com/spf13/cobra"

	"github.com/neult/oken/apps/cli/internal/api"
	"github.com/neult/oken/apps/cli/internal/config"
	"github.com/neult/oken/apps/cli/internal/ui"
)

var listCmd = &cobra.Command{
	Use:   "list",
	Short: "List all agents",
	Args:  cobra.NoArgs,
	RunE:  runList,
}

func init() {
	rootCmd.AddCommand(listCmd)
}

func runList(cmd *cobra.Command, args []string) error {
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

	resp, err := client.ListAgents()
	if err != nil {
		ui.Error("Failed to list agents: %v", err)
		return err
	}

	if len(resp.Agents) == 0 {
		ui.Info("No agents found. Deploy one with 'oken deploy'.")
		return nil
	}

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	_, _ = fmt.Fprintln(w, "NAME\tSLUG\tSTATUS\tENDPOINT")
	for _, agent := range resp.Agents {
		endpoint := "-"
		if agent.Endpoint != nil && *agent.Endpoint != "" {
			endpoint = *agent.Endpoint
		}
		_, _ = fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", agent.Name, agent.Slug, agent.Status, endpoint)
	}
	_ = w.Flush()

	return nil
}
