use serde::Deserialize;

#[derive(Deserialize)]
pub struct DrawingClipboardPacket {
    payload: String,
    png: Vec<u8>,
    dib: Vec<u8>,
}

#[cfg(windows)]
mod windows {
    use std::ffi::c_void;
    use std::ptr;

    const MAX_BYTES: usize = 128 * 1024 * 1024;
    #[link(name = "user32")]
    extern "system" {
        fn OpenClipboard(window: *mut c_void) -> i32;
        fn CloseClipboard() -> i32;
        fn EmptyClipboard() -> i32;
        fn RegisterClipboardFormatW(name: *const u16) -> u32;
        fn SetClipboardData(format: u32, memory: *mut c_void) -> *mut c_void;
        fn GetClipboardData(format: u32) -> *mut c_void;
        fn IsClipboardFormatAvailable(format: u32) -> i32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GlobalAlloc(flags: u32, size: usize) -> *mut c_void;
        fn GlobalLock(memory: *mut c_void) -> *mut c_void;
        fn GlobalUnlock(memory: *mut c_void) -> i32;
        fn GlobalSize(memory: *mut c_void) -> usize;
        fn GlobalFree(memory: *mut c_void) -> *mut c_void;
    }
    struct Clipboard;
    impl Clipboard {
        fn open(owner: *mut c_void) -> Result<Self, String> {
            if unsafe { OpenClipboard(owner) } == 0 {
                return Err("Windows 클립보드를 열 수 없습니다. 다시 시도하십시오.".into());
            }
            Ok(Self)
        }
    }
    impl Drop for Clipboard {
        fn drop(&mut self) {
            unsafe {
                CloseClipboard();
            }
        }
    }
    fn format(name: &str) -> Result<u32, String> {
        let wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
        let value = unsafe { RegisterClipboardFormatW(wide.as_ptr()) };
        if value == 0 {
            Err("클립보드 형식을 등록할 수 없습니다.".into())
        } else {
            Ok(value)
        }
    }
    fn write(format: u32, bytes: &[u8]) -> Result<(), String> {
        if bytes.is_empty() || bytes.len() > MAX_BYTES {
            return Err("잘못된 클립보드 크기입니다.".into());
        }
        let memory = unsafe { GlobalAlloc(0x0002, bytes.len()) };
        if memory.is_null() {
            return Err("클립보드 메모리를 할당할 수 없습니다.".into());
        }
        let pointer = unsafe { GlobalLock(memory) };
        if pointer.is_null() {
            unsafe {
                GlobalFree(memory);
            }
            return Err("클립보드 메모리를 잠글 수 없습니다.".into());
        }
        unsafe {
            ptr::copy_nonoverlapping(bytes.as_ptr(), pointer.cast::<u8>(), bytes.len());
            GlobalUnlock(memory);
        }
        if unsafe { SetClipboardData(format, memory) }.is_null() {
            unsafe {
                GlobalFree(memory);
            }
            return Err("클립보드 데이터를 저장할 수 없습니다.".into());
        }
        // Ownership transfers to Windows only after SetClipboardData succeeds.
        Ok(())
    }
    pub fn put(owner: *mut c_void, payload: &str, png: &[u8], dib: &[u8]) -> Result<(), String> {
        // Validate and encode every offered format before replacing the old clipboard.
        // A failed CUTCLIP must leave its source drawing untouched.
        if owner.is_null()
            || payload.is_empty()
            || payload.len() >= MAX_BYTES
            || png.len() < 8
            || png.len() > MAX_BYTES
            || png[..8] != [137, 80, 78, 71, 13, 10, 26, 10]
            || dib.len() < 40
            || dib.len() > MAX_BYTES
        {
            return Err("잘못된 클립보드 데이터입니다.".into());
        }
        let header_size = u32::from_le_bytes(dib[0..4].try_into().unwrap());
        let width = i32::from_le_bytes(dib[4..8].try_into().unwrap());
        let height = i32::from_le_bytes(dib[8..12].try_into().unwrap());
        let planes = u16::from_le_bytes(dib[12..14].try_into().unwrap());
        let bits = u16::from_le_bytes(dib[14..16].try_into().unwrap());
        let compression = u32::from_le_bytes(dib[16..20].try_into().unwrap());
        let pixels = (width as usize)
            .checked_mul(height.unsigned_abs() as usize)
            .and_then(|count| count.checked_mul(4))
            .and_then(|bytes| bytes.checked_add(40));
        if header_size != 40
            || width <= 0
            || height >= 0
            || planes != 1
            || bits != 32
            || compression != 0
            || pixels != Some(dib.len())
        {
            return Err("잘못된 클립보드 비트맵입니다.".into());
        }
        let text_units = payload.encode_utf16().count();
        if text_units >= MAX_BYTES / 2 {
            return Err("클립보드 데이터가 지원 크기를 초과합니다.".into());
        }
        let mut internal_bytes = payload.as_bytes().to_vec();
        internal_bytes.push(0);
        let text: Vec<u8> = payload
            .encode_utf16()
            .chain(Some(0))
            .flat_map(u16::to_le_bytes)
            .collect();
        let internal = format("HanCAD.Drawing.v1")?;
        let image = format("PNG")?;
        let _clipboard = Clipboard::open(owner)?;
        if unsafe { EmptyClipboard() } == 0 {
            return Err("클립보드를 비울 수 없습니다.".into());
        }
        write(internal, &internal_bytes)?;
        write(image, png)?;
        write(8, dib)?;
        write(13, &text)
    }
    pub fn get() -> Result<Option<String>, String> {
        let internal = format("HanCAD.Drawing.v1")?;
        let _clipboard = Clipboard::open(ptr::null_mut())?;
        if unsafe { IsClipboardFormatAvailable(internal) } == 0 {
            return Ok(None);
        }
        let memory = unsafe { GetClipboardData(internal) };
        if memory.is_null() {
            return Err("클립보드 데이터를 읽을 수 없습니다.".into());
        }
        let size = unsafe { GlobalSize(memory) };
        if size == 0 || size > MAX_BYTES {
            return Err("잘못된 클립보드 크기입니다.".into());
        }
        let pointer = unsafe { GlobalLock(memory) };
        if pointer.is_null() {
            return Err("클립보드 메모리를 잠글 수 없습니다.".into());
        }
        let bytes = unsafe { std::slice::from_raw_parts(pointer.cast::<u8>(), size) };
        // GlobalAlloc may round the allocation up; payload terminates at its first NUL.
        let end = bytes.iter().position(|byte| *byte == 0).unwrap_or(size);
        let result = std::str::from_utf8(&bytes[..end])
            .map(str::to_owned)
            .map_err(|error| error.to_string());
        unsafe {
            GlobalUnlock(memory);
        }
        result.map(Some)
    }
}

#[tauri::command]
pub fn write_drawing_clipboard(
    window: tauri::WebviewWindow,
    packet: DrawingClipboardPacket,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        let owner = window.hwnd().map_err(|error| error.to_string())?;
        windows::put(owner.0.cast(), &packet.payload, &packet.png, &packet.dib)
    }
    #[cfg(not(windows))]
    {
        let _ = (window, packet);
        Err("Native drawing clipboard currently requires Windows.".into())
    }
}

#[tauri::command]
pub fn read_drawing_clipboard() -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        windows::get()
    }
    #[cfg(not(windows))]
    {
        Err("Native drawing clipboard currently requires Windows.".into())
    }
}
