package cmd

import "github.com/spf13/cobra"

var secretsCmd = &cobra.Command{
	Use:   "secrets",
	Short: "Manage secrets",
}

func init() {
	rootCmd.AddCommand(secretsCmd)
}
