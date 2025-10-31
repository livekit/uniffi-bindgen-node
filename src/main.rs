use anyhow::Result;
use clap::Parser;
use uniffi_bindgen_node::{Args, run};

fn main() -> Result<()> {
    let args = Args::parse();
    run(args)
}
