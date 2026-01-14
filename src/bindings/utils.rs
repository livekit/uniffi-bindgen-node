// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

use std::collections::{HashMap, HashSet};

use camino::Utf8PathBuf;

#[derive(Debug, PartialEq, Eq, Clone)]
pub enum DirnameApi {
    Dirname,
    ImportMetaUrl,
}

#[derive(Debug, PartialEq, Eq, Clone)]
pub enum ImportExtension {
    None,
    Ts,
    Js,
}

#[derive(Debug, Clone)]
pub struct LibPathModule {
    require_path: String,
    filters: HashMap<&'static str, String>,
}

impl LibPathModule {
    pub fn new(require_path: &str) -> Self {
        Self { require_path: require_path.into(), filters: Default::default() }
    }
    pub fn with_filter(mut self, filter_key: &'static str, filter_value: String) -> Self {
        self.filters.insert(filter_key, filter_value);
        self
    }
}

#[derive(Debug, Clone)]
pub enum LibPath {
    Omitted,
    Literal(Utf8PathBuf),
    Modules(LibPathModules),
}

impl LibPath {
    pub fn from_raw(
        out_lib_path_literal: Option<Utf8PathBuf>,
        out_lib_path_module: Option<Vec<String>>,
        out_lib_path_module_platform: Option<Vec<String>>,
        out_lib_path_module_arch: Option<Vec<String>>,
    ) -> Self {
        if let Some(value) = out_lib_path_literal {
            return Self::Literal(value);

        } else if let Some(mods) = out_lib_path_module {
            let platform_values = out_lib_path_module_platform.unwrap_or(vec![]);
            let arch_values = out_lib_path_module_arch.unwrap_or(vec![]);

            Self::Modules(LibPathModules(mods.into_iter().enumerate().map(|(index, require_path)| {
                let mut module = LibPathModule::new(require_path.as_str());
                if let Some(platform) = platform_values.iter().nth(index).cloned() {
                    module = module.with_filter("process.platform", platform);
                };
                if let Some(arch) = arch_values.iter().nth(index).cloned() {
                    module = module.with_filter("process.arch", arch);
                };

                module
            }).collect()))

        } else {
            Self::Omitted
        }
    }
}

#[derive(Debug, Clone)]
pub struct LibPathModules(Vec<LibPathModule>);

#[derive(Debug, Clone, PartialEq)]
pub enum LibPathSwitchToken<T> {
    Switch(&'static str),
    Case(String),
    EndSwitch(&'static str),
    Value(T),
}

impl LibPathModules {
    pub fn as_switch_tokens_by(&self, dimensions: Vec<&'static str>) -> Vec<LibPathSwitchToken<String>> {
        let Some((first_dimension, rest_dimensions)) = dimensions.split_first() else {
            return self.0.iter().map(|module| LibPathSwitchToken::Value(module.require_path.clone())).collect();
        };

        let mut grouped_modules = HashMap::new();
        for module_entry in self.0.iter() {
            let Some(dimension_value) = module_entry.filters.get(*first_dimension) else {
                continue;
            };

            grouped_modules.entry(dimension_value.clone()).or_insert(vec![]).push(module_entry);
        };

        let mut tokens = vec![];

        tokens.push(LibPathSwitchToken::Switch(*first_dimension));

        // NOTE: sort the cases in alhpabetical order so that the tests below can assert against
        // the token list detemrinistically.
        let mut sorted_grouped_modules = grouped_modules.into_iter().collect::<Vec<_>>();
        sorted_grouped_modules.sort_by(|(a_key, _), (b_key, _)| a_key.cmp(b_key));

        for (first_dimension_value, module_entries) in sorted_grouped_modules {
            tokens.push(LibPathSwitchToken::Case(first_dimension_value));
            let values = Self(module_entries.iter().map(|a| (*a).clone()).collect()).as_switch_tokens_by(rest_dimensions.to_vec());
            tokens.extend(values);
        }
        tokens.push(LibPathSwitchToken::EndSwitch(*first_dimension));

        tokens
    }

    pub fn as_switch_tokens(&self) -> Vec<LibPathSwitchToken<String>> {
        let keys = self.0.iter().flat_map(|module| module.filters.keys()).map(|key| *key).collect::<HashSet<_>>();
        self.as_switch_tokens_by(keys.into_iter().collect())
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn test_switch_grouping_works() {
        let result = LibPathModules(vec![
            LibPathModule::new("foo").with_filter("arch", "x86".into()).with_filter("platform", "win".into()),
            LibPathModule::new("bar").with_filter("arch", "x86".into()).with_filter("platform", "mac".into()),
            LibPathModule::new("baz").with_filter("arch", "x86".into()).with_filter("platform", "mac".into()),
            LibPathModule::new("quux").with_filter("arch", "aarch64".into()).with_filter("platform", "win".into()),
        ]).as_switch_tokens_by(vec!["arch", "platform"]);

        assert_eq!(result, vec![
            LibPathSwitchToken::Switch("arch"),
            LibPathSwitchToken::Case("aarch64".into()),
            LibPathSwitchToken::Switch("platform"),
            LibPathSwitchToken::Case("win".into()),
            LibPathSwitchToken::Value("quux".into()),
            LibPathSwitchToken::EndSwitch("platform"),
            LibPathSwitchToken::Case("x86".into()),
            LibPathSwitchToken::Switch("platform"),
            LibPathSwitchToken::Case("mac".into()),
            LibPathSwitchToken::Value("bar".into()),
            LibPathSwitchToken::Value("baz".into()),
            LibPathSwitchToken::Case("win".into()),
            LibPathSwitchToken::Value("foo".into()),
            LibPathSwitchToken::EndSwitch("platform"),
            LibPathSwitchToken::EndSwitch("arch"),
        ]);
    }
}
