package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/spf13/cobra"

	"github.com/neult/oken/apps/cli/internal/ui"
)

var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Create oken.toml in current directory",
	RunE:  runInit,
}

func init() {
	rootCmd.AddCommand(initCmd)
}

func runInit(cmd *cobra.Command, args []string) error {
	// Check if oken.toml already exists
	if _, err := os.Stat("oken.toml"); err == nil {
		ui.Error("oken.toml already exists in this directory")
		return fmt.Errorf("oken.toml exists")
	}

	// Get current directory name as default
	dir, err := os.Getwd()
	if err != nil {
		ui.Error("Failed to get current directory: %v", err)
		return err
	}
	dirName := filepath.Base(dir)

	// Generate slug from directory name
	slug := toSlug(dirName)
	name := dirName

	content := fmt.Sprintf(`# Oken agent configuration

name = "%s"
slug = "%s"

# Optional settings:
# python_version = "3.12"
# entrypoint = "main.py"
`, name, slug)

	if err := os.WriteFile("oken.toml", []byte(content), 0644); err != nil {
		ui.Error("Failed to create oken.toml: %v", err)
		return err
	}

	ui.Success("Created oken.toml")
	fmt.Printf("  name: %s\n", name)
	fmt.Printf("  slug: %s\n", slug)
	fmt.Println()
	ui.Info("Edit oken.toml to customize, then run 'oken deploy'")

	return nil
}

// toSlug converts a string to a valid slug
func toSlug(s string) string {
	s = strings.ToLower(s)
	s = strings.ReplaceAll(s, "_", "-")
	s = strings.ReplaceAll(s, " ", "-")
	// Remove invalid characters
	reg := regexp.MustCompile(`[^a-z0-9-]`)
	s = reg.ReplaceAllString(s, "")
	// Remove leading/trailing hyphens
	s = strings.Trim(s, "-")
	// Collapse multiple hyphens
	reg = regexp.MustCompile(`-+`)
	s = reg.ReplaceAllString(s, "-")
	if s == "" {
		s = "my-agent"
	}
	return s
}
