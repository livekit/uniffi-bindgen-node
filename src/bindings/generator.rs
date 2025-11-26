use std::borrow::Borrow;
use uniffi_bindgen::{ComponentInterface, interface::{AsType, FfiDefinition, FfiType, Type, Callable}};
use anyhow::{Context, Result};
use askama::Template;
use heck::ToKebabCase;

use crate::{bindings::{filters, utils::DirnameApi}};

pub struct Bindings {
    pub package_json_contents: String,
    pub livekit_sys_template_contents: String,
    pub node_ts_file_contents: String,
}

#[derive(Template)]
#[template(escape = "none", path = "package.json")]
struct PackageJsonTemplate<'ci> {
    ci: &'ci ComponentInterface,
    node_ts_main_file_name: String,
}

impl<'ci> PackageJsonTemplate<'ci> {
    pub fn new(ci: &'ci ComponentInterface, node_ts_main_file_name: &str) -> Self {
        Self {
            ci,
            node_ts_main_file_name: node_ts_main_file_name.into(),
        }
    }
}

#[derive(Template)]
#[template(escape = "none", path = "livekit-sys.ts")]
struct LivekitSysTemplate<'ci> {
    ci: &'ci ComponentInterface,

    out_dirname_api: DirnameApi,
    out_disable_auto_loading_lib: bool,
}

impl<'ci> LivekitSysTemplate<'ci> {
    pub fn new(
        ci: &'ci ComponentInterface,
        out_dirname_api: DirnameApi,
        out_disable_auto_loading_lib: bool,
    ) -> Self {
        Self { ci, out_dirname_api, out_disable_auto_loading_lib }
    }
}


#[derive(Template)]
#[template(escape = "none", path = "livekit-node.ts")]
struct LivekitNodeTsTemplate<'ci> {
    ci: &'ci ComponentInterface,
    out_disable_auto_loading_lib: bool,
}

impl<'ci> LivekitNodeTsTemplate<'ci> {
    pub fn new(ci: &'ci ComponentInterface, out_disable_auto_loading_lib: bool) -> Self {
        Self {
            ci,
            out_disable_auto_loading_lib,
        }
    }
}

pub fn generate_node_bindings(
    ci: &ComponentInterface,
    node_ts_main_file_name: &str,
    out_dirname_api: DirnameApi,
    out_disable_auto_loading_lib: bool,
) -> Result<Bindings> {
    let package_json_contents = PackageJsonTemplate::new(ci, node_ts_main_file_name).render().context("failed to render package.json template")?;
    let livekit_sys_template_contents = LivekitSysTemplate::new(ci, out_dirname_api, out_disable_auto_loading_lib).render().context("failed to render livekit-sys.ts template")?;
    let node_ts_file_contents = LivekitNodeTsTemplate::new(ci, out_disable_auto_loading_lib).render().context("failed to render livekit-node.ts template")?;

    Ok(Bindings {
        package_json_contents,
        livekit_sys_template_contents,
        node_ts_file_contents,
    })
}
