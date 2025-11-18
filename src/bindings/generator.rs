use std::borrow::Borrow;
use uniffi_bindgen::{ComponentInterface, interface::{AsType, FfiDefinition, FfiType, Type, Callable}};
use anyhow::{Context, Result};
use askama::Template;

use crate::bindings::filters;

pub struct Bindings {
    // pub napi_interop_rust_file_contents: String,
    pub node_ts_file_contents: String,
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
    // let napi_interop_rust_file_contents = NapiInteropRs::new(ci).render().context("failed to render napi interop rs file")?;
    let node_ts_file_contents = NodeTs::new(ci).render().context("failed to render node ts file")?;

    Ok(Bindings {
        // napi_interop_rust_file_contents,
        node_ts_file_contents,
    })
}
