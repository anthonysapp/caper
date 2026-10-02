fn main() {
    // Android 15+ devices can use 16 KB memory pages, and Google Play requires apps
    // to support them. NDK r27 and older link with 4 KB segment alignment (r28+
    // defaults to 16 KB), which makes Android warn "not 16 KB compatible" at launch.
    // Set it here rather than through rustflags in .cargo/config.toml: the Tauri CLI
    // drives cargo with its own RUSTFLAGS, which replace config rustflags outright.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");
    }
    tauri_build::build()
}
