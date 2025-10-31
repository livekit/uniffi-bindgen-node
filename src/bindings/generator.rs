use anyhow::{Context, Result};
use askama::Template;
use std::borrow::Borrow;
use uniffi_bindgen::{
    ComponentInterface,
    interface::{AsType, FfiDefinition, FfiType},
};

use crate::bindings::filters;

pub struct Bindings {
    pub node_interop_rust_file_contents: String,
    pub node_ts_file_contents: String,
}

#[derive(Template)]
#[template(escape = "none", path = "node_interop.rs")]
struct NodeInteropRs<'ci> {
    ci: &'ci ComponentInterface,
}

impl<'ci> NodeInteropRs<'ci> {
    pub fn new(ci: &'ci ComponentInterface) -> Self {
        Self { ci }
    }
}

#[derive(Template)]
#[template(escape = "none", path = "node.ts")]
struct NodeTs<'ci> {
    ci: &'ci ComponentInterface,
}

impl<'ci> NodeTs<'ci> {
    pub fn new(ci: &'ci ComponentInterface) -> Self {
        Self { ci }
    }
}

pub fn generate_node_bindings(ci: &ComponentInterface) -> Result<Bindings> {
    let node_interop_rust_file_contents = NodeInteropRs::new(ci)
        .render()
        .context("failed to render node-ffi-rs interop rs file")?;
    let node_ts_file_contents = NodeTs::new(ci)
        .render()
        .context("failed to render node ts file")?;

    Ok(Bindings {
        node_interop_rust_file_contents,
        node_ts_file_contents,
    })
}
