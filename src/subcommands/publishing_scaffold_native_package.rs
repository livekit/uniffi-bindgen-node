// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

use std::fs;
use camino::Utf8PathBuf;
use clap::Args;
use anyhow::{Result, Context};
use serde_json::json;

/// FOO
#[derive(Args, Debug)]
pub struct PublishingScaffoldNativePackageSubcommandArgs {
    /// Path to the compiled library (.so, .dylib, or .dll).
    lib_source: Utf8PathBuf,

    /// Rust triple representing the platform that `lib-source` was compiled under.
    lib_triple: Utf8PathBuf,

    /// The value to set the "name" field of the generated package.json
    #[arg(long)]
    package_name: String,

    /// The value to set the "version" field of the generated package.json
    #[arg(long, default_value = "0.0.0")]
    package_version: String,

    /// Output directory to write the native package into.
    #[arg(short, long, default_value = "./scaffolded-native-package")]
    out_dir: Utf8PathBuf,
}



pub fn run(args: PublishingScaffoldNativePackageSubcommandArgs) -> Result<()> {
    let lib_source_filename = args.lib_source.file_name().context("Cannot get filename from --lib-source")?;

    fs::create_dir_all(args.out_dir.clone()).context("Error creating native package root directory")?;
    fs::create_dir_all(args.out_dir.clone().join("src")).context("Error creating native package src directory")?;

    fs::copy(
        args.lib_source.clone(),
        args.out_dir.clone().join("src").join(lib_source_filename),
    ).context(format!("Error copying {lib_source_filename} into package"))?;

    let package_json = json!({
        "name": args.package_name,
        "version": args.package_version,

        "main": "src/index.mjs",
        "types": "src/index.d.ts",
        "exports": {
            "import": "./src/index.mjs",
            "require": "./src/index.js"
        },
        "files": ["src"],
        "engines": { "node": ">= 18" },
    });
    fs::write(
        args.out_dir.clone().join("package.json"),
        serde_json::to_string_pretty(&package_json)?,
    ).context("Error writing package.json")?;

    for (filename, contents) in [
        ("index.cjs", format!(
            r#"module.exports = {{ triple: "{}", path: require("path").join(__dirname, "{}") }};"#,
            args.lib_triple,
            lib_source_filename,
        )),
        ("index.mjs", format!(
            r#"import {{ join, dirname }} from "path"; import {{ fileURLToPath }} from "url"; export const triple = "{}"; export const path = join(dirname(fileURLToPath(import.meta.url)), "{}");"#,
            args.lib_triple,
            lib_source_filename,
        )),
        ("index.d.ts", format!(
            r#"declare const triple: "{}"; declare const path: string; export {{ triple, path }};"#,
            args.lib_triple,
        )),
    ] {
        fs::write(
            args.out_dir.clone().join("src").join(filename),
            contents,
        ).context(format!("Error writing {filename}"))?;
    }

    Ok(())
}
