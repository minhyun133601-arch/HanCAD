use std::{fs, path::Path};

/// Read user-selected support resources without invoking external converters.
#[tauri::command]
pub fn read_support_file(path: String) -> Result<Vec<u8>, String> {
    let resource = Path::new(&path);
    let extension = resource
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if !["lin", "las"]
        .iter()
        .any(|allowed| extension.eq_ignore_ascii_case(allowed))
    {
        return Err("Only .lin and .las support resources can be read.".into());
    }
    let metadata = fs::metadata(resource).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > 16 * 1024 * 1024 {
        return Err("Support resource must be a file no larger than 16 MB.".into());
    }
    fs::read(resource).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::read_support_file;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn rejects_unrelated_extensions_before_reading() {
        assert!(read_support_file("missing.exe".into())
            .unwrap_err()
            .contains(".lin"));
    }

    #[test]
    fn reads_local_unicode_lin_and_rejects_oversized_resources() {
        let serial = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let file = std::env::temp_dir().join(format!("hancad-한글-{serial}.lin"));
        let bytes = b"*PRIVATE,original definition\nA,4,-2\n";
        fs::write(&file, bytes).unwrap();
        let loaded = read_support_file(file.to_string_lossy().into_owned()).unwrap();
        assert_eq!(loaded, bytes);
        fs::OpenOptions::new()
            .write(true)
            .open(&file)
            .unwrap()
            .set_len(16 * 1024 * 1024 + 1)
            .unwrap();
        let rejected = read_support_file(file.to_string_lossy().into_owned()).unwrap_err();
        fs::remove_file(&file).unwrap();
        assert!(rejected.contains("16 MB"));
    }
}
