use askama::Result;
use heck::{ToLowerCamelCase, ToPascalCase, ToUpperCamelCase, ToSnakeCase};
use uniffi_bindgen::interface::{AsType, FfiType, Type};

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
        Type::Enum { module_path, name, .. } | Type::Record { module_path, name, .. } => format!("{module_path}::{}", name),
        Type::Object { module_path, name, imp, .. } => {
            format!("::std::sync::Arc<{module_path}::{}>", imp.rust_name_for(&name))
        }
        Type::CallbackInterface { module_path, name, .. } => format!("Box<dyn {module_path}::{name}>"),
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
        Type::Custom { module_path, name, .. } => format!("{module_path}::{}", name),
    })
}

pub fn rust_fn_name(raw_name: &str, _: &dyn askama::Values) -> Result<String> {
    Ok(raw_name.into())
}

pub fn rust_var_name(raw_name: &str, _: &dyn askama::Values) -> Result<String> {
    Ok(raw_name.into())
}

pub fn rust_enum_variant_name(raw_name: &str, _: &dyn askama::Values) -> Result<String> {
    Ok(raw_name.into())
}


/// The type of values in the extern C <-> dynamic library bindings
pub fn rust_ffi_type_name(ffi_type: &FfiType, askama_values: &dyn askama::Values) -> Result<String> {
    Ok(match ffi_type {
        FfiType::Int8 => "::core::ffi::c_char".into(),
        FfiType::UInt8 => "::core::ffi::c_schar".into(),
        FfiType::Int16 => "::core::ffi::c_ushort".into(),
        FfiType::UInt16 => "::core::ffi::c_short".into(),
        FfiType::Int32 => "::core::ffi::c_int".into(),
        FfiType::UInt32 => "::core::ffi::c_uint".into(),
        FfiType::Int64 => "::core::ffi::c_long".into(),
        FfiType::UInt64 => "::core::ffi::c_ulong".into(),
        FfiType::Float32 => "::core::ffi::c_float".into(),
        FfiType::Float64 => "::core::ffi::c_double".into(),
        // FfiType::RustArcPtr(_) => "void *".into(),
        FfiType::RustBuffer(_) => "RustBuffer".into(),
        FfiType::ForeignBytes => "ForeignBytes".into(),
        FfiType::Callback(name) => format!("/* {name} */ *mut ::core::ffi::c_void"),
        FfiType::Struct(name) => rust_ffi_struct_name(name, askama_values)?,
        FfiType::Handle => "/* handle */ u64".into(),
        FfiType::RustCallStatus => "RustCallStatus".into(),
        FfiType::MutReference(inner) => format!("*mut {}", rust_ffi_type_name(inner, askama_values)?),
        FfiType::Reference(inner) => format!("* {}", rust_ffi_type_name(inner, askama_values)?),
        FfiType::VoidPointer => "*mut ::core::ffi::c_void".into(), // ???
    })
}

/// The type of parameters in the [napi] tagged functions
pub fn rust_ffi_napi_type_name(ffi_type: &FfiType, askama_values: &dyn askama::Values) -> Result<String> {
    Ok(match ffi_type {
        FfiType::Int8 => "::core::ffi::c_char".into(),
        FfiType::UInt8 => "::core::ffi::c_schar".into(),
        FfiType::Int16 => "::core::ffi::c_ushort".into(),
        FfiType::UInt16 => "::core::ffi::c_short".into(),
        FfiType::Int32 => "::core::ffi::c_int".into(),
        FfiType::UInt32 => "::core::ffi::c_uint".into(),
        FfiType::Int64 => "/* long */ napi::bindgen_prelude::BigInt".into(),
        FfiType::UInt64 => "/* ulong */ napi::bindgen_prelude::BigInt".into(),
        FfiType::Float32 => "::core::ffi::c_float".into(),
        FfiType::Float64 => "::core::ffi::c_double".into(),
        // FfiType::RustArcPtr(_) => "void *".into(),
        FfiType::RustBuffer(_) => "/* RustBuffer */ ::napi::bindgen_prelude::Uint8Array".into(),
        FfiType::ForeignBytes => "ForeignBytes".into(),
        FfiType::Callback(name) => format!("/* {name} */ *mut ::core::ffi::c_void"),
        FfiType::Struct(name) => rust_ffi_napi_struct_name(name, askama_values)?,
        FfiType::Handle => "/* handle */ ::napi::bindgen_prelude::BigInt".into(),
        FfiType::RustCallStatus => "/* RustCallStatus */ ::napi::bindgen_prelude::Uint8Array".into(),
        FfiType::MutReference(inner) => format!("*mut {}", rust_ffi_type_name(inner, askama_values)?),
        FfiType::Reference(inner) => format!("* {}", rust_ffi_type_name(inner, askama_values)?),
        FfiType::VoidPointer => "*mut ::core::ffi::c_void".into(), // ???
    })
}


pub fn rust_ffi_callback_name(nm: &str, _: &dyn askama::Values) -> Result<String> {
    Ok(format!("uniffi_{}", nm.to_snake_case()))
}

pub fn rust_ffi_struct_name(nm: &str, _: &dyn askama::Values) -> Result<String> {
    Ok(format!("Uniffi{}", nm.to_upper_camel_case()))
}

pub fn rust_ffi_napi_struct_name(nm: &str, _: &dyn askama::Values) -> Result<String> {
    Ok(format!("Napi{}", nm.to_upper_camel_case()))
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
        Type::Duration => "/* FIXME: what is a good duration type? */".into(), // ref: https://github.com/jhugman/uniffi-bindgen-react-native/blob/b9301797ef697331d29edb9d2402ea35c218571e/crates/ubrn_bindgen/src/bindings/gen_typescript/miscellany.rs#L31
        Type::Enum { name, .. } | Type::Record { name, .. } => name.to_pascal_case(),
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

pub fn typescript_fn_name(raw_name: &str, _: &dyn askama::Values) -> Result<String> {
    Ok(raw_name.to_lower_camel_case())
}

pub fn typescript_var_name(raw_name: &str, _: &dyn askama::Values) -> Result<String> {
    Ok(raw_name.to_lower_camel_case())
}

pub fn typescript_class_name(raw_name: &str, _: &dyn askama::Values) -> Result<String> {
    Ok(raw_name.to_pascal_case())
}
