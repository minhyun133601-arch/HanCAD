use serde::Serialize;
mod clipboard;

#[derive(Serialize)]
struct PlatformInfo {
    mode: &'static str,
    capabilities: Vec<&'static str>,
}

#[tauri::command]
fn platform_info() -> PlatformInfo {
    PlatformInfo {
        mode: "desktop",
        capabilities: if cfg!(windows) {
            vec!["clipboard"]
        } else {
            Vec::new()
        },
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            platform_info,
            clipboard::write_drawing_clipboard,
            clipboard::read_drawing_clipboard
        ])
        .run(tauri::generate_context!())
        .expect("failed to start HanCAD desktop shell");
}
