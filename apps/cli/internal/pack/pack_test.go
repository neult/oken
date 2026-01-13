package pack

import (
	"archive/tar"
	"compress/gzip"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func extractTarball(t *testing.T, r io.Reader) map[string][]byte {
	t.Helper()
	files := make(map[string][]byte)

	gr, err := gzip.NewReader(r)
	require.NoError(t, err)
	defer func() { _ = gr.Close() }()

	tr := tar.NewReader(gr)
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		require.NoError(t, err)

		if header.Typeflag == tar.TypeReg {
			data, err := io.ReadAll(tr)
			require.NoError(t, err)
			files[header.Name] = data
		}
	}
	return files
}

func TestCreateTarballBasic(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "pack-test")
	require.NoError(t, err)
	defer func() { _ = os.RemoveAll(tmpDir) }()

	// Create test files
	require.NoError(t, os.WriteFile(filepath.Join(tmpDir, "main.py"), []byte("print('hello')"), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(tmpDir, "requirements.txt"), []byte("requests"), 0644))

	reader, err := CreateTarball(tmpDir)
	require.NoError(t, err)

	files := extractTarball(t, reader)
	assert.Contains(t, files, "main.py")
	assert.Contains(t, files, "requirements.txt")
	assert.Equal(t, []byte("print('hello')"), files["main.py"])
}

func TestCreateTarballExcludesDirectories(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "pack-test")
	require.NoError(t, err)
	defer func() { _ = os.RemoveAll(tmpDir) }()

	// Create excluded directories with files
	excludedDirs := []string{".git", "__pycache__", "node_modules", ".venv", "venv", ".pytest_cache"}
	for _, dir := range excludedDirs {
		dirPath := filepath.Join(tmpDir, dir)
		require.NoError(t, os.MkdirAll(dirPath, 0755))
		require.NoError(t, os.WriteFile(filepath.Join(dirPath, "file.txt"), []byte("excluded"), 0644))
	}

	// Create an included file
	require.NoError(t, os.WriteFile(filepath.Join(tmpDir, "main.py"), []byte("included"), 0644))

	reader, err := CreateTarball(tmpDir)
	require.NoError(t, err)

	files := extractTarball(t, reader)
	assert.Contains(t, files, "main.py")

	// Verify excluded directories are not in tarball
	for _, dir := range excludedDirs {
		for name := range files {
			assert.NotContains(t, name, dir, "should not contain files from %s", dir)
		}
	}
}

func TestCreateTarballExcludesFiles(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "pack-test")
	require.NoError(t, err)
	defer func() { _ = os.RemoveAll(tmpDir) }()

	// Create excluded files
	excludedFiles := []string{".env", ".env.local", ".DS_Store"}
	for _, file := range excludedFiles {
		require.NoError(t, os.WriteFile(filepath.Join(tmpDir, file), []byte("secret"), 0644))
	}

	// Create an included file
	require.NoError(t, os.WriteFile(filepath.Join(tmpDir, "main.py"), []byte("included"), 0644))

	reader, err := CreateTarball(tmpDir)
	require.NoError(t, err)

	files := extractTarball(t, reader)
	assert.Contains(t, files, "main.py")

	for _, file := range excludedFiles {
		assert.NotContains(t, files, file)
	}
}

func TestCreateTarballIncludesPythonVersion(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "pack-test")
	require.NoError(t, err)
	defer func() { _ = os.RemoveAll(tmpDir) }()

	require.NoError(t, os.WriteFile(filepath.Join(tmpDir, ".python-version"), []byte("3.11"), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(tmpDir, "main.py"), []byte("code"), 0644))

	reader, err := CreateTarball(tmpDir)
	require.NoError(t, err)

	files := extractTarball(t, reader)
	assert.Contains(t, files, ".python-version")
	assert.Equal(t, []byte("3.11"), files[".python-version"])
}

func TestCreateTarballExcludesHiddenFiles(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "pack-test")
	require.NoError(t, err)
	defer func() { _ = os.RemoveAll(tmpDir) }()

	// Hidden files that should be excluded
	require.NoError(t, os.WriteFile(filepath.Join(tmpDir, ".hidden"), []byte("hidden"), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(tmpDir, ".gitignore"), []byte("ignored"), 0644))

	// .python-version should be included
	require.NoError(t, os.WriteFile(filepath.Join(tmpDir, ".python-version"), []byte("3.11"), 0644))

	// Regular file
	require.NoError(t, os.WriteFile(filepath.Join(tmpDir, "main.py"), []byte("code"), 0644))

	reader, err := CreateTarball(tmpDir)
	require.NoError(t, err)

	files := extractTarball(t, reader)
	assert.Contains(t, files, "main.py")
	assert.Contains(t, files, ".python-version")
	assert.NotContains(t, files, ".hidden")
	assert.NotContains(t, files, ".gitignore")
}

func TestCreateTarballSkipsSymlinks(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "pack-test")
	require.NoError(t, err)
	defer func() { _ = os.RemoveAll(tmpDir) }()

	// Create a regular file
	require.NoError(t, os.WriteFile(filepath.Join(tmpDir, "real.txt"), []byte("real"), 0644))

	// Create a symlink
	err = os.Symlink(filepath.Join(tmpDir, "real.txt"), filepath.Join(tmpDir, "link.txt"))
	if err != nil {
		t.Skip("symlinks not supported on this platform")
	}

	reader, err := CreateTarball(tmpDir)
	require.NoError(t, err)

	files := extractTarball(t, reader)
	assert.Contains(t, files, "real.txt")
	assert.NotContains(t, files, "link.txt")
}

func TestCreateTarballWithSubdirectories(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "pack-test")
	require.NoError(t, err)
	defer func() { _ = os.RemoveAll(tmpDir) }()

	// Create nested structure
	require.NoError(t, os.MkdirAll(filepath.Join(tmpDir, "src", "utils"), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(tmpDir, "main.py"), []byte("main"), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(tmpDir, "src", "app.py"), []byte("app"), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(tmpDir, "src", "utils", "helper.py"), []byte("helper"), 0644))

	reader, err := CreateTarball(tmpDir)
	require.NoError(t, err)

	files := extractTarball(t, reader)
	assert.Contains(t, files, "main.py")
	assert.Contains(t, files, filepath.Join("src", "app.py"))
	assert.Contains(t, files, filepath.Join("src", "utils", "helper.py"))
}

func TestCreateTarballEmptyDirectory(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "pack-test")
	require.NoError(t, err)
	defer func() { _ = os.RemoveAll(tmpDir) }()

	reader, err := CreateTarball(tmpDir)
	require.NoError(t, err)

	files := extractTarball(t, reader)
	assert.Empty(t, files)
}

func TestCreateTarballNonExistentDirectory(t *testing.T) {
	_, err := CreateTarball("/nonexistent/path")
	assert.Error(t, err)
}
