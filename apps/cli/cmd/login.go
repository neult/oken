package cmd

import "github.com/spf13/cobra"

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Authenticate with platform",
}

func init() {
	rootCmd.AddCommand(loginCmd)
}
