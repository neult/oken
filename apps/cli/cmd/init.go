package cmd

import "github.com/spf13/cobra"

var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Create oken.toml in current directory",
}

func init() {
	rootCmd.AddCommand(initCmd)
}
