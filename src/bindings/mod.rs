use uniffi_bindgen::{BindingGenerator, GenerationSettings};
use anyhow::Result;
use serde::Deserialize;

mod generator;
mod filters;

use crate::{bindings::generator::{Bindings, generate_node_bindings}, utils::write_with_dirs};

pub struct NodeBindingGenerator {}

impl NodeBindingGenerator {
    pub fn new() -> Self {
        Self {}
    }
}

#[derive(Default, Deserialize)]
pub struct NodeBindingGeneratorConfig {
    // TODO: Add Node-specific configuration options.
}

impl BindingGenerator for NodeBindingGenerator {
    type Config = NodeBindingGeneratorConfig;

    fn new_config(&self, root_toml: &toml::Value) -> Result<Self::Config> {
        Ok(match root_toml.get("bindings").and_then(|b| b.get("node")) {
            Some(v) => v.clone().try_into()?,
            None => Default::default(),
        })
    }

    fn update_component_configs(
        &self,
        _settings: &GenerationSettings,
        _components: &mut Vec<uniffi_bindgen::Component<Self::Config>>,
    ) -> Result<()> {
        return Ok(());
    }

    fn write_bindings(
        &self,
        settings: &GenerationSettings,
        components: &[uniffi_bindgen::Component<Self::Config>],
    ) -> Result<()> {
        for uniffi_bindgen::Component { ci, config: _, .. } in components {
            let Bindings {
                livekit_sys_template_contents,
                node_ts_file_contents,
            } = generate_node_bindings(&ci)?;

            let node_ts_file_path = settings.out_dir.join(format!("{}_node.ts", ci.namespace()));
            write_with_dirs(&node_ts_file_path, node_ts_file_contents)?;

            let livekit_sys_template_path = settings.out_dir.join(format!("{}-sys.ts", ci.namespace()));
            write_with_dirs(&livekit_sys_template_path, livekit_sys_template_contents)?;
        }

        Ok(())
    }
}
