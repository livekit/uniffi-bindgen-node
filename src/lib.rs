use anyhow::{Context, Result};
use camino::Utf8PathBuf;
use clap::Parser;

mod bindings;
mod utils;

#[derive(Debug, Clone, Default, clap::ValueEnum)]
enum ModuleType {
    CommonJs,
    #[default]
    ESM,
}

impl Into<bindings::utils::OutputModuleType> for ModuleType {
    fn into(self) -> bindings::utils::OutputModuleType {
        match self {
            ModuleType::ESM => bindings::utils::OutputModuleType::ESM,
            ModuleType::CommonJs => bindings::utils::OutputModuleType::CommonJs,
        }
    }
}

/// UniFFI binding generator for Node.js
#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
pub struct Args {
    /// Path to the compiled library (.so, .dylib, or .dll).
    lib_source: Utf8PathBuf,

    /// Output directory.
    #[arg(short, long, default_value = "./output")]
    out_dir: Utf8PathBuf,

    /// Name of the crate.
    #[arg(long, default_value = "livekit_uniffi")]
    crate_name: String,

    /// The set of buildin apis which should be used to get the current
    /// directory - `__dirname` or `import.meta.url`.
    #[arg(short, long, value_enum)]
    out_dirname_api: ModuleType,

    /// Config file override.
    #[arg(short, long)]
    config_override: Option<Utf8PathBuf>,
}

pub fn run(args: Args) -> Result<()> {
    let config_supplier = {
        use uniffi_bindgen::cargo_metadata::CrateConfigSupplier;
        let cmd = ::cargo_metadata::MetadataCommand::new();
        let metadata = cmd.exec().context("error running cargo metadata")?;
        CrateConfigSupplier::from(metadata)
    };
    let node_binding_generator = bindings::NodeBindingGenerator::new(args.out_dirname_api.into());

    uniffi_bindgen::library_mode::generate_bindings(
        &args.lib_source,
        args.crate_name.into(),
        &node_binding_generator,
        &config_supplier,
        args.config_override.as_deref(),
        &args.out_dir,
        false,
    )
    .context("Failed to generate node bindings in library mode")?;

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

    Ok(())
}
