package pack

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

var excludeDirs = map[string]bool{
	".git":          true,
	"__pycache__":   true,
	"node_modules":  true,
	".venv":         true,
	"venv":          true,
	".pytest_cache": true,
}

var excludeFiles = map[string]bool{
	".env":       true,
	".env.local": true,
	".DS_Store":  true,
}

// CreateTarball creates a gzipped tar archive of the given directory
func CreateTarball(dir string) (io.Reader, error) {
	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gw)

	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Get relative path
		relPath, err := filepath.Rel(dir, path)
		if err != nil {
			return err
		}

		// Validate path doesn't escape root directory
		if strings.Contains(relPath, "..") {
			return fmt.Errorf("path escapes root directory: %s", relPath)
		}

		// Skip root directory
		if relPath == "." {
			return nil
		}

		// Check exclusions
		baseName := filepath.Base(path)
		if info.IsDir() {
			if excludeDirs[baseName] {
				return filepath.SkipDir
			}
			return nil
		}

		if excludeFiles[baseName] {
			return nil
		}

		// Skip hidden files (except specific ones we might want)
		if strings.HasPrefix(baseName, ".") && baseName != ".python-version" {
			return nil
		}

		// Skip symlinks
		if info.Mode()&os.ModeSymlink != 0 {
			return nil
		}

		// Create tar header
		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		header.Name = relPath

		if err := tw.WriteHeader(header); err != nil {
			return err
		}

		// Write file content
		file, err := os.Open(path)
		if err != nil {
			return err
		}

		_, err = io.Copy(tw, file)
		_ = file.Close()
		return err
	})

	if err != nil {
		return nil, err
	}

	if err := tw.Close(); err != nil {
		return nil, err
	}
	if err := gw.Close(); err != nil {
		return nil, err
	}

	return &buf, nil
}
