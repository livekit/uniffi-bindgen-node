// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

use clap::Subcommand;
use anyhow::Result;

pub mod generate;
pub mod publishing_scaffold_native_package;

#[derive(Subcommand, Debug)]
pub enum Subcommands {
    /// Generates node.js bindings for a given set of built uniffi bindings.
    /// This is probably the subcommand you want if you are just getting started.
    #[command(verbatim_doc_comment)]
    Generate(generate::GenerateSubcommandArgs),
}

pub fn run(command: Subcommands) -> Result<()> {
    match command {
        Subcommands::Generate(args) => generate::run(args),
    }
}
