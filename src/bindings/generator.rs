use uniffi_bindgen::{ComponentInterface, interface::AsType};
use anyhow::{Context, Result};
use askama::Template;

use crate::bindings::filters;

pub struct Bindings {
    pub napi_interop_rust_file_contents: String,
    // pub node_ts_file_contents: String,
}

#[derive(Template)]
#[template(escape = "none", path = "napi_interop.rs")]
struct NapiInteropRs<'ci> {
    ci: &'ci ComponentInterface,
}

impl<'ci> NapiInteropRs<'ci> {
    pub fn new(ci: &'ci ComponentInterface) -> Self {
        Self { ci }
    }
}

pub fn generate_node_bindings(ci: &ComponentInterface) -> Result<Bindings> {
    let napi_interop_rust_file_contents = NapiInteropRs::new(ci).render().context("failed to render napi interop rs file")?;

    Ok(Bindings {
        napi_interop_rust_file_contents,
        // node_ts_file_contents: ()
    })
}
