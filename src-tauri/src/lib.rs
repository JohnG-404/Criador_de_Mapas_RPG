use serde::Serialize;
use std::path::PathBuf;

/// Arquivo `.rpgmap` passado ao abrir o app (duplo clique no arquivo, ou "Abrir com").
#[derive(Serialize)]
struct InitialFile {
    name: String,
    text: String,
}

fn map_path_from_args() -> Option<PathBuf> {
    std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .find(|p| {
            p.extension()
                .map_or(false, |e| e.eq_ignore_ascii_case("rpgmap"))
                && p.is_file()
        })
}

#[tauri::command]
fn initial_map_file() -> Option<InitialFile> {
    let path = map_path_from_args()?;
    let text = std::fs::read_to_string(&path).ok()?;
    let name = path.file_name()?.to_string_lossy().into_owned();
    Some(InitialFile { name, text })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![initial_map_file])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Atlas Board");
}
