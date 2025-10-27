use askama::Result;
use heck::{ToLowerCamelCase, ToPascalCase};
use uniffi_bindgen::interface::{Type, AsType};

// ref: https://github.com/mozilla/uniffi-rs/blob/2e7c7bb07bfc7e310722ce43c002b916f20860ff/uniffi_bindgen/src/scaffolding/mod.rs#L26
pub fn rust_type_name(typ: &impl AsType, askama_values: &dyn askama::Values) -> Result<String> {
    Ok(match typ.as_type() {
        Type::Int8 => "i8".into(),
        Type::UInt8 => "u8".into(),
        Type::Int16 => "i16".into(),
        Type::UInt16 => "u16".into(),
        Type::Int32 => "i32".into(),
        Type::UInt32 => "u32".into(),
        Type::Int64 => "i64".into(),
        Type::UInt64 => "u64".into(),
        Type::Float32 => "f32".into(),
        Type::Float64 => "f64".into(),
        Type::Boolean => "bool".into(),
        Type::String => "::std::string::String".into(),
        Type::Bytes => "::std::vec::Vec<u8>".into(),
        Type::Timestamp => "::std::time::SystemTime".into(),
        Type::Duration => "::std::time::Duration".into(),
        Type::Enum { name, .. } | Type::Record { name, .. } => name,
        Type::Object { name, imp, .. } => {
            format!("::std::sync::Arc<{}>", imp.rust_name_for(&name))
        }
        Type::CallbackInterface { name, .. } => format!("Box<dyn {name}>"),
        Type::Optional { inner_type } => {
            format!("::std::option::Option<{}>", rust_type_name(&inner_type, askama_values)?)
        }
        Type::Sequence { inner_type } => format!("std::vec::Vec<{}>", rust_type_name(&inner_type, askama_values)?),
        Type::Map {
            key_type,
            value_type,
        } => format!(
            "::std::collections::HashMap<{}, {}>",
            rust_type_name(&key_type, askama_values)?,
            rust_type_name(&value_type, askama_values)?,
        ),
        Type::Custom { name, .. } => name.to_pascal_case(),
    })
}

pub fn rust_fn_name(raw_name: &str, _: &dyn askama::Values) -> Result<String> {
    Ok(raw_name.into())
}

pub fn rust_var_name(raw_name: &str, _: &dyn askama::Values) -> Result<String> {
    Ok(raw_name.into())
}

pub fn typescript_type_name(typ: &impl AsType, askama_values: &dyn askama::Values) -> Result<String> {
    Ok(match typ.as_type() {
        Type::Int8 => "/*i8*/number".into(),
        Type::Int16 => "/*i16*/number".into(),
        Type::Int32 => "/*i32*/number".into(),
        Type::Int64 => "/*i64*/bigint".into(),
        Type::UInt8 => "/*u8*/number".into(),
        Type::UInt16 => "/*u16*/number".into(),
        Type::UInt32 => "/*u32*/number".into(),
        Type::UInt64 => "/*u64*/bigint".into(),
        Type::Float32 => "/*f32*/number".into(),
        Type::Float64 => "/*f64*/number".into(), // FIXME: is this right for f64? I am not sure `number` is big enough?
        Type::Boolean => "boolean".into(),
        Type::String => "string".into(),
        Type::Bytes => "ArrayBuffer".into(),
        Type::Timestamp => "Date".into(),
        Type::Duration => unimplemented!(), // ref: https://github.com/jhugman/uniffi-bindgen-react-native/blob/b9301797ef697331d29edb9d2402ea35c218571e/crates/ubrn_bindgen/src/bindings/gen_typescript/miscellany.rs#L31
        Type::Enum { name, .. } | Type::Record { name, .. } => format!("r#{name}"),
        Type::Object { name, imp, .. } => imp.rust_name_for(&name).to_pascal_case(),
        Type::CallbackInterface { name, .. } => name.to_lower_camel_case(),
        Type::Optional { inner_type } => {
            format!("{} | undefined", typescript_type_name(&inner_type, askama_values)?)
        }
        Type::Sequence { inner_type } => format!("Array<{}>", typescript_type_name(&inner_type, askama_values)?),
        Type::Map {
            key_type,
            value_type,
        } => format!(
            "Record<{}, {}>",
            typescript_type_name(&key_type, askama_values)?,
            typescript_type_name(&value_type, askama_values)?,
        ),
        Type::Custom { name, .. } => name.to_pascal_case(),
    })
}

pub fn typescript_fn_name(raw_name: &str, _: &dyn askama::Values) -> String {
    raw_name.to_lower_camel_case()
}

pub fn typescript_var_name(raw_name: &str, _: &dyn askama::Values) -> String {
    raw_name.to_lower_camel_case()
}
