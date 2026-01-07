package cmd

import "github.com/spf13/cobra"

var deployCmd = &cobra.Command{
	Use:   "deploy",
	Short: "Deploy agent to platform",
}

func init() {
	rootCmd.AddCommand(deployCmd)
}
