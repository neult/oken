package main

import (
	"os"

	"github.com/neult/oken/apps/cli/cmd"
)

func main() {
	if err := cmd.Execute(); err != nil {
		os.Exit(1)
	}
}
