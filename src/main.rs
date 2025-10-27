use camino::Utf8PathBuf;

mod bindings;

fn main() {
    // START ARGS
    // FIXME: replace with clap or similar package for arg parsing!
    let source: Utf8PathBuf = "/Users/ryan/w/livekit/rust-sdks/target/release/liblivekit_uniffi.dylib".into();
    let crate_name = Some("livekit_uniffi".into());
    let config_file_override = None;
    let out_dir: Utf8PathBuf = "./output".into();
    // END ARGS

    let config_supplier = {
        use uniffi_bindgen::cargo_metadata::CrateConfigSupplier;
        let cmd = ::cargo_metadata::MetadataCommand::new();
        let metadata = cmd.exec().expect("error running cargo metadata");
        CrateConfigSupplier::from(metadata)
    };

    let node_binding_generator = bindings::NodeBindingGenerator::new();

    uniffi_bindgen::library_mode::generate_bindings(
        &source,
        crate_name,
        &node_binding_generator,
        &config_supplier,
        config_file_override,
        &out_dir,
        false,
    ).expect("Failed to generate node bindings in library mode");

    // To read from udl file, do something like the below instead:

    // uniffi_bindgen::generate_external_bindings(
    //     &CppBindingGenerator {
    //         scaffolding_mode: args.scaffolding_mode,
    //     },
    //     args.source,
    //     args.config.as_deref(),
    //     args.out_dir,
    //     args.lib_file,
    //     args.crate_name.as_deref(),
    //     false,
    // )
}
