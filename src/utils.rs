use std::{fs, io};
use camino::Utf8Path;

/// Write to the path, creating intermediate directories as needed.
pub fn write_with_dirs(path: &Utf8Path, contents: impl AsRef<[u8]>) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, contents)
}
