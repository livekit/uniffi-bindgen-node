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

