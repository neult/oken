package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/spf13/cobra"

	"github.com/neult/oken/apps/cli/internal/api"
	"github.com/neult/oken/apps/cli/internal/config"
	"github.com/neult/oken/apps/cli/internal/ui"
)

var invokeInput string

var invokeCmd = &cobra.Command{
	Use:   "invoke <slug>",
	Short: "Invoke an agent",
	Args:  cobra.ExactArgs(1),
	RunE:  runInvoke,
}

func init() {
	invokeCmd.Flags().StringVarP(&invokeInput, "input", "i", "", "JSON input (or use stdin)")
	rootCmd.AddCommand(invokeCmd)
}

func runInvoke(cmd *cobra.Command, args []string) error {
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

	// Get input from flag or stdin
	var inputJSON string
	if invokeInput != "" {
		inputJSON = invokeInput
	} else {
		// Check if stdin has data
		stat, err := os.Stdin.Stat()
		if err == nil && (stat.Mode()&os.ModeCharDevice) == 0 {
			const maxInputSize = 10 * 1024 * 1024 // 10MB
			data, err := io.ReadAll(io.LimitReader(os.Stdin, maxInputSize))
			if err != nil {
				ui.Error("Failed to read stdin: %v", err)
				return err
			}
			inputJSON = string(data)
		}
	}

	// Default to empty object if no input
	if inputJSON == "" {
		inputJSON = "{}"
	}

	// Parse input JSON
	var input map[string]any
	if err := json.Unmarshal([]byte(inputJSON), &input); err != nil {
		ui.Error("Invalid JSON input: %v", err)
		return err
	}

	client := api.NewClient(cfg.Endpoint, cfg.Token)

	resp, err := client.InvokeAgent(slug, input)
	if err != nil {
		ui.Error("Failed to invoke agent: %v", err)
		return err
	}

	if resp.Error != "" {
		ui.Error("Agent error: %s", resp.Error)
		return fmt.Errorf("agent error: %s", resp.Error)
	}

	// Output response as JSON
	output, err := json.MarshalIndent(resp.Output, "", "  ")
	if err != nil {
		ui.Error("Failed to format output: %v", err)
		return err
	}

	fmt.Println(string(output))

	return nil
}
