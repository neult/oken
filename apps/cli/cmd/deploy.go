package cmd

import (
	"fmt"
	"os"

	"github.com/BurntSushi/toml"
	"github.com/spf13/cobra"

	"github.com/neult/oken/apps/cli/internal/api"
	"github.com/neult/oken/apps/cli/internal/config"
	"github.com/neult/oken/apps/cli/internal/pack"
	"github.com/neult/oken/apps/cli/internal/ui"
)

type okenConfig struct {
	Name          string `toml:"name"`
	Slug          string `toml:"slug"`
	PythonVersion string `toml:"python_version"`
	Entrypoint    string `toml:"entrypoint"`
}

var (
	deployName string
	deploySlug string
)

var deployCmd = &cobra.Command{
	Use:   "deploy",
	Short: "Deploy agent to platform",
	Args:  cobra.NoArgs,
	RunE:  runDeploy,
}

func init() {
	deployCmd.Flags().StringVarP(&deployName, "name", "n", "", "Agent name (overrides oken.toml)")
	deployCmd.Flags().StringVarP(&deploySlug, "slug", "s", "", "Agent slug (overrides oken.toml)")
	rootCmd.AddCommand(deployCmd)
}

func runDeploy(cmd *cobra.Command, args []string) error {
	// Try to load oken.toml
	var okenCfg okenConfig
	if _, err := os.Stat("oken.toml"); err == nil {
		if _, err := toml.DecodeFile("oken.toml", &okenCfg); err != nil {
			ui.Error("Failed to parse oken.toml: %v", err)
			return err
		}
	}

	// Flags override oken.toml
	name := deployName
	if name == "" {
		name = okenCfg.Name
	}
	slug := deploySlug
	if slug == "" {
		slug = okenCfg.Slug
	}

	if name == "" {
		ui.Error("Agent name is required. Use --name flag or create oken.toml with 'oken init'.")
		return fmt.Errorf("name required")
	}
	if slug == "" {
		ui.Error("Agent slug is required. Use --slug flag or create oken.toml with 'oken init'.")
		return fmt.Errorf("slug required")
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

	// Get current directory
	dir, err := os.Getwd()
	if err != nil {
		ui.Error("Failed to get current directory: %v", err)
		return err
	}

	ui.Info("Packaging agent from %s...", dir)

	tarball, err := pack.CreateTarball(dir)
	if err != nil {
		ui.Error("Failed to create package: %v", err)
		return err
	}

	client := api.NewClient(cfg.Endpoint, cfg.Token)

	ui.Info("Deploying %s...", name)

	resp, err := client.DeployAgent(name, slug, tarball)
	if err != nil {
		ui.Error("Failed to deploy agent: %v", err)
		return err
	}

	fmt.Println()
	ui.Success("Agent deployed successfully!")
	fmt.Printf("  Name:     %s\n", resp.Agent.Name)
	fmt.Printf("  Slug:     %s\n", resp.Agent.Slug)
	fmt.Printf("  Status:   %s\n", resp.Agent.Status)
	if resp.Agent.Endpoint != nil && *resp.Agent.Endpoint != "" {
		fmt.Printf("  Endpoint: %s\n", *resp.Agent.Endpoint)
	}

	return nil
}
