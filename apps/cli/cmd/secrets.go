package cmd

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/neult/oken/apps/cli/internal/api"
	"github.com/neult/oken/apps/cli/internal/config"
	"github.com/neult/oken/apps/cli/internal/ui"
)

var secretsAgentSlug string

var secretsCmd = &cobra.Command{
	Use:   "secrets",
	Short: "Manage secrets",
	Long:  "Manage secrets that are injected as environment variables into your agents.",
}

var secretsSetCmd = &cobra.Command{
	Use:   "set <KEY=value>",
	Short: "Set a secret",
	Long: `Set a secret that will be available as an environment variable in your agents.

Secret names must be uppercase with underscores (e.g., API_KEY, DATABASE_URL).

Examples:
  oken secrets set API_KEY=sk-xxx
  oken secrets set DATABASE_URL=postgres://... --agent my-agent`,
	Args: cobra.ExactArgs(1),
	RunE: runSecretsSet,
}

var secretsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List secrets",
	Long: `List all secrets. Use --agent to filter by agent.

Examples:
  oken secrets list
  oken secrets list --agent my-agent`,
	Args: cobra.NoArgs,
	RunE: runSecretsList,
}

var secretsDeleteCmd = &cobra.Command{
	Use:   "delete <KEY>",
	Short: "Delete a secret",
	Long: `Delete a secret by name.

Examples:
  oken secrets delete API_KEY
  oken secrets delete API_KEY --agent my-agent`,
	Args: cobra.ExactArgs(1),
	RunE: runSecretsDelete,
}

func init() {
	secretsCmd.PersistentFlags().StringVarP(&secretsAgentSlug, "agent", "a", "", "Agent slug (for agent-specific secrets)")

	secretsCmd.AddCommand(secretsSetCmd)
	secretsCmd.AddCommand(secretsListCmd)
	secretsCmd.AddCommand(secretsDeleteCmd)

	rootCmd.AddCommand(secretsCmd)
}

func runSecretsSet(cmd *cobra.Command, args []string) error {
	// Parse KEY=value
	parts := strings.SplitN(args[0], "=", 2)
	if len(parts) != 2 {
		ui.Error("Invalid format. Use KEY=value")
		return fmt.Errorf("invalid format")
	}

	name := parts[0]
	value := parts[1]

	if name == "" {
		ui.Error("Secret name cannot be empty")
		return fmt.Errorf("empty name")
	}

	if value == "" {
		ui.Error("Secret value cannot be empty")
		return fmt.Errorf("empty value")
	}

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

	var agentSlugPtr *string
	if secretsAgentSlug != "" {
		agentSlugPtr = &secretsAgentSlug
	}

	resp, err := client.SetSecret(name, value, agentSlugPtr)
	if err != nil {
		ui.Error("Failed to set secret: %v", err)
		return err
	}

	if secretsAgentSlug != "" {
		ui.Success("%s: %s (agent: %s)", resp.Message, name, secretsAgentSlug)
	} else {
		ui.Success("%s: %s (user-level)", resp.Message, name)
	}

	return nil
}

func runSecretsList(cmd *cobra.Command, args []string) error {
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

	resp, err := client.ListSecrets(secretsAgentSlug)
	if err != nil {
		ui.Error("Failed to list secrets: %v", err)
		return err
	}

	if len(resp.Secrets) == 0 {
		if secretsAgentSlug != "" {
			ui.Info("No secrets found for agent '%s'", secretsAgentSlug)
		} else {
			ui.Info("No secrets found")
		}
		return nil
	}

	fmt.Printf("%-20s %-20s %s\n", "NAME", "SCOPE", "CREATED")
	fmt.Printf("%-20s %-20s %s\n", "----", "-----", "-------")

	for _, s := range resp.Secrets {
		scope := "user-level"
		if s.AgentSlug != nil && *s.AgentSlug != "" {
			scope = fmt.Sprintf("agent:%s", *s.AgentSlug)
		}

		created := s.CreatedAt
		if len(created) > 10 {
			created = created[:10] // Just the date
		}

		fmt.Printf("%-20s %-20s %s\n", s.Name, scope, created)
	}

	return nil
}

func runSecretsDelete(cmd *cobra.Command, args []string) error {
	name := args[0]

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

	_, err = client.DeleteSecret(name, secretsAgentSlug)
	if err != nil {
		ui.Error("Failed to delete secret: %v", err)
		return err
	}

	if secretsAgentSlug != "" {
		ui.Success("Secret deleted: %s (agent: %s)", name, secretsAgentSlug)
	} else {
		ui.Success("Secret deleted: %s (user-level)", name)
	}

	return nil
}
