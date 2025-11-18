use std::borrow::Borrow;
use uniffi_bindgen::{ComponentInterface, interface::{AsType, FfiDefinition, FfiType, Type, Callable}};
use anyhow::{Context, Result};
use askama::Template;

use crate::bindings::filters;

pub struct Bindings {
    pub livekit_sys_template_contents: String,
    pub node_ts_file_contents: String,
}

#[derive(Template)]
#[template(escape = "none", path = "livekit-sys.ts")]
struct LivekitSysTemplate<'ci> {
    ci: &'ci ComponentInterface,
}

impl<'ci> LivekitSysTemplate<'ci> {
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
    let livekit_sys_template_contents = LivekitSysTemplate::new(ci).render().context("failed to render livekit-sys.ts template")?;
    let node_ts_file_contents = NodeTs::new(ci).render().context("failed to render node.ts template")?;

    Ok(Bindings {
        livekit_sys_template_contents,
        node_ts_file_contents,
    })
}
