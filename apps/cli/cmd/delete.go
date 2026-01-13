package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/neult/oken/apps/cli/internal/api"
	"github.com/neult/oken/apps/cli/internal/config"
	"github.com/neult/oken/apps/cli/internal/ui"
)

var deleteForce bool

var deleteCmd = &cobra.Command{
	Use:   "delete <slug>",
	Short: "Delete an agent",
	Args:  cobra.ExactArgs(1),
	RunE:  runDelete,
}

func init() {
	deleteCmd.Flags().BoolVarP(&deleteForce, "force", "f", false, "Skip confirmation prompt")
	rootCmd.AddCommand(deleteCmd)
}

func runDelete(cmd *cobra.Command, args []string) error {
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

	if !deleteForce {
		fmt.Printf("Are you sure you want to delete agent '%s'? [y/N] ", slug)
		reader := bufio.NewReader(os.Stdin)
		response, err := reader.ReadString('\n')
		if err != nil {
			return err
		}
		response = strings.TrimSpace(strings.ToLower(response))
		if response != "y" && response != "yes" {
			ui.Info("Aborted")
			return nil
		}
	}

	client := api.NewClient(cfg.Endpoint, cfg.Token)

	ui.Info("Deleting agent %s...", slug)

	_, err = client.DeleteAgent(slug)
	if err != nil {
		ui.Error("Failed to delete agent: %v", err)
		return err
	}

	ui.Success("Agent deleted: %s", slug)

	return nil
}
