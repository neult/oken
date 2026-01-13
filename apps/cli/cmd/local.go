package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/spf13/cobra"
)

var localBuild bool

var localCmd = &cobra.Command{
	Use:   "local",
	Short: "Manage local development environment",
}

var localStartCmd = &cobra.Command{
	Use:   "start",
	Short: "Start local development environment",
	Long:  "Start all Oken services locally using Docker (postgres, platform, runner)",
	RunE:  runLocalStart,
}

var localStopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop local development environment",
	Long:  "Stop all Oken services running in Docker",
	RunE:  runLocalStop,
}

func init() {
	localStartCmd.Flags().BoolVar(&localBuild, "build", false, "Rebuild Docker images")
	localCmd.AddCommand(localStartCmd)
	localCmd.AddCommand(localStopCmd)
	rootCmd.AddCommand(localCmd)
}

func findComposePath() (string, error) {
	// Try current directory first
	path := "infra/docker-compose.yml"
	if _, err := os.Stat(path); err == nil {
		return path, nil
	}

	// Try to find repo root by looking for Taskfile.yml
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}

	for {
		taskfile := filepath.Join(dir, "Taskfile.yml")
		if _, err := os.Stat(taskfile); err == nil {
			composePath := filepath.Join(dir, "infra", "docker-compose.yml")
			if _, err := os.Stat(composePath); err == nil {
				return composePath, nil
			}
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	return "", fmt.Errorf("oken repo not found\n\nTo self-host Oken, clone the repo and run from there:\n  git clone https://github.com/neult/oken.git\n  cd oken\n  oken local start")
}

func runLocalStart(cmd *cobra.Command, args []string) error {
	composePath, err := findComposePath()
	if err != nil {
		return err
	}

	dockerArgs := []string{"compose", "-f", composePath, "up", "-d"}
	if localBuild {
		dockerArgs = append(dockerArgs, "--build")
	}

	fmt.Println("Starting Oken services...")

	dockerCmd := exec.Command("docker", dockerArgs...)
	dockerCmd.Stdout = os.Stdout
	dockerCmd.Stderr = os.Stderr

	if err := dockerCmd.Run(); err != nil {
		return fmt.Errorf("failed to start services: %w", err)
	}

	fmt.Println()
	fmt.Println("Oken is running:")
	fmt.Println("  Platform: http://localhost:3000")
	fmt.Println("  Runner:   http://localhost:8000")
	fmt.Println("  Postgres: localhost:5432")
	fmt.Println()
	fmt.Println("Run 'oken local stop' to stop all services")

	return nil
}

func runLocalStop(cmd *cobra.Command, args []string) error {
	composePath, err := findComposePath()
	if err != nil {
		return err
	}

	fmt.Println("Stopping Oken services...")

	dockerCmd := exec.Command("docker", "compose", "-f", composePath, "down")
	dockerCmd.Stdout = os.Stdout
	dockerCmd.Stderr = os.Stderr

	if err := dockerCmd.Run(); err != nil {
		return fmt.Errorf("failed to stop services: %w", err)
	}

	fmt.Println("Oken services stopped")

	return nil
}
