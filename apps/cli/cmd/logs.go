package cmd

import "github.com/spf13/cobra"

var logsCmd = &cobra.Command{
	Use:   "logs [agent]",
	Short: "Stream agent logs",
}

func init() {
	rootCmd.AddCommand(logsCmd)
}
