package cmd

import (
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "oken",
	Short: "Deploy agents with one command",
}

func Execute() error {
	return rootCmd.Execute()
}
