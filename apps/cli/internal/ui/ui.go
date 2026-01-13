package ui

import (
	"fmt"

	"github.com/fatih/color"
)

var (
	green  = color.New(color.FgGreen).SprintFunc()
	red    = color.New(color.FgRed).SprintFunc()
	yellow = color.New(color.FgYellow).SprintFunc()
	cyan   = color.New(color.FgCyan).SprintFunc()
	bold   = color.New(color.Bold).SprintFunc()
)

// Success prints a success message with a green checkmark
func Success(format string, a ...any) {
	fmt.Printf("%s %s\n", green("✓"), fmt.Sprintf(format, a...))
}

// Error prints an error message with a red X
func Error(format string, a ...any) {
	fmt.Printf("%s %s\n", red("✗"), fmt.Sprintf(format, a...))
}

// Warning prints a warning message with a yellow exclamation
func Warning(format string, a ...any) {
	fmt.Printf("%s %s\n", yellow("!"), fmt.Sprintf(format, a...))
}

// Info prints an info message with a cyan arrow
func Info(format string, a ...any) {
	fmt.Printf("%s %s\n", cyan("→"), fmt.Sprintf(format, a...))
}

// Bold returns bold text
func Bold(s string) string {
	return bold(s)
}

// Cyan returns cyan text
func Cyan(s string) string {
	return cyan(s)
}
