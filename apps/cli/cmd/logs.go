package cmd

import (
	"bufio"
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/spf13/cobra"

	"github.com/neult/oken/apps/cli/internal/api"
	"github.com/neult/oken/apps/cli/internal/config"
	"github.com/neult/oken/apps/cli/internal/ui"
)

var (
	logsFollow bool
	logsTail   int
)

var logsCmd = &cobra.Command{
	Use:   "logs <agent>",
	Short: "View agent logs",
	Long:  "View logs from a running agent. Use -f to stream logs in real-time.",
	Args:  cobra.ExactArgs(1),
	RunE:  runLogs,
}

func init() {
	logsCmd.Flags().BoolVarP(&logsFollow, "follow", "f", false, "Stream logs in real-time")
	logsCmd.Flags().IntVarP(&logsTail, "tail", "n", 100, "Number of lines to show (max 10000)")
	rootCmd.AddCommand(logsCmd)
}

func runLogs(cmd *cobra.Command, args []string) error {
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

	client := api.NewClient(cfg.Endpoint, cfg.Token)

	if logsFollow {
		return streamLogs(client, cfg, slug)
	}

	return fetchLogs(client, slug)
}

func fetchLogs(client *api.Client, slug string) error {
	resp, err := client.GetAgentLogs(slug, logsTail)
	if err != nil {
		ui.Error("Failed to fetch logs: %v", err)
		return err
	}

	if resp.Logs == "" {
		ui.Info("No logs available")
		return nil
	}

	fmt.Print(resp.Logs)
	return nil
}

func streamLogs(client *api.Client, cfg *config.Config, slug string) error {
	url := client.GetAgentLogsStreamURL(slug, logsTail)

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		ui.Error("Failed to create request: %v", err)
		return err
	}

	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	req.Header.Set("Accept", "text/event-stream")

	// Create context that cancels on interrupt
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle Ctrl+C
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		cancel()
	}()

	req = req.WithContext(ctx)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			// User cancelled
			fmt.Println()
			return nil
		}
		ui.Error("Failed to connect: %v", err)
		return err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		ui.Error("Failed to stream logs: %s", resp.Status)
		return fmt.Errorf("stream failed: %s", resp.Status)
	}

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		// SSE format: "data: <content>"
		if content, found := strings.CutPrefix(line, "data: "); found {
			fmt.Print(content)
		}
	}

	if err := scanner.Err(); err != nil {
		if ctx.Err() != nil {
			// User cancelled
			fmt.Println()
			return nil
		}
		ui.Error("Stream error: %v", err)
		return err
	}

	return nil
}
