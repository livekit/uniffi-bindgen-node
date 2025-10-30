{%- import "macros.rs" as macros -%}

#![deny(clippy::all)]

use napi_derive::napi;
use uniffi::{RustBuffer, RustCallStatus, RustCallStatusCode, UniffiForeignPointerCell, ForeignBytes};

use {{ci.crate_name()}};


{% macro docstring(optional_docstring) %}
{%- if let Some(docstring) = optional_docstring -%}
    {%- for line in docstring.split("\n") -%}
/// {{line}}{%- if !loop.last %}
{% endif -%}
{%- endfor -%}
{%- endif -%}
{% endmacro %}

fn convert_rust_buffer_to_uint8array(rust_buffer: RustBuffer) -> napi::bindgen_prelude::Uint8Array {
    // FIXME: the from_raw() call may not be the right thing to do here, read more in the docs to be sure
    // let rust_buffer = unsafe { Box::from_raw(rust_buffer_ptr) };
    let vec_u8 = (/* * */rust_buffer).destroy_into_vec();
    napi::bindgen_prelude::Uint8Array::new(vec_u8)
}

fn convert_u64_to_bigint(n: u64) -> napi::bindgen_prelude::BigInt {
    napi::bindgen_prelude::BigInt { sign_bit: false, words: vec![n] }
}

fn convert_i64_to_bigint(n: i64) -> napi::bindgen_prelude::BigInt {
    napi::bindgen_prelude::BigInt { sign_bit: n < 0, words: vec![n.unsigned_abs()] }
}

fn encode_rust_call_status_to_uint8array(uniffi_call_status: RustCallStatus) -> napi::bindgen_prelude::Uint8Array {
    // Encode the uniffi call status value into a Uint8Array so it can be passed back into
    // javascript land over the napi bridge.
    let mut uniffi_call_status_bytes: Vec<u8> = vec![];
    uniffi_call_status_bytes.push(match &uniffi_call_status.code {
        RustCallStatusCode::Success => 0,
        RustCallStatusCode::Error => 1,
        RustCallStatusCode::UnexpectedError => 2,
        RustCallStatusCode::Cancelled => 3,
    });
    // FIXME: the into_inner() call may not be safe, read more of the std::mem::ManuallyDrop docs to verify
    uniffi_call_status_bytes.extend(::std::mem::ManuallyDrop::into_inner(uniffi_call_status.error_buf).destroy_into_vec());

    napi::bindgen_prelude::Uint8Array::new(uniffi_call_status_bytes)
}

fn decode_uintarray_to_rust_call_status(encoded_uniffi_call_status: &napi::bindgen_prelude::Uint8Array) -> RustCallStatus {
    let Some((first, rest)) = encoded_uniffi_call_status.split_first() else {
        panic!("decode_uintarray_to_rust_call_status: input is not at least two bytes long!");
    };

    let code = match first {
        0 => RustCallStatusCode::Success,
        1 => RustCallStatusCode::Error,
        2 => RustCallStatusCode::UnexpectedError,
        3 => RustCallStatusCode::Cancelled,
        _ => unreachable!(),
    };

    let error_buf = RustBuffer::from_vec(rest.to_vec());

    RustCallStatus { code, error_buf: ::std::mem::ManuallyDrop::new(error_buf) }
}

{# Perform any pre-setup work that should be done in a non unsafe context before calling the extern C ffi function #}
{% macro rust_napi_to_ffi_args_initialization(ffi_func) %}
    {%- for arg in ffi_func.arguments() -%}
        {%- if matches!(arg.type_().borrow(), FfiType::RustBuffer(_)) -%}
            let rust_buffer_{{ arg.name() | rust_var_name }} = {
                let slice_u8 = {{ arg.name() | rust_var_name }}.as_ref();
                let vec_u8 = slice_u8.to_vec();
                RustBuffer::from_vec(vec_u8)
            };
        {% endif %}
    {%- endfor -%}
{%- endmacro %}

{# Given a ffi function, render each argument coercing from the uniffi form to the napi form #}
{% macro rust_napi_to_ffi_arg_list(ffi_func) %}
    {%- for arg in ffi_func.arguments() -%}
        {%- if matches!(arg.type_().borrow(), FfiType::UInt64 | FfiType::Handle) -%}
            {{ arg.name() | rust_var_name }}.get_u64().1
        {%- else if matches!(arg.type_().borrow(), FfiType::Int64) -%}
            {{ arg.name() | rust_var_name }}.get_i64().0
        {%- else if matches!(arg.type_().borrow(), FfiType::RustBuffer(_)) -%}
            rust_buffer_{{ arg.name() | rust_var_name }}
        {%- else if matches!(arg.type_().borrow(), FfiType::Struct(_)) -%}
            {{ arg.name() | rust_var_name }}.to_c_struct()
        {%- else -%}
            {{ arg.name() | rust_var_name }}
        {%- endif -%}
        {%- if !loop.last %}, {% endif -%}
    {%- endfor -%}
{%- endmacro %}

{# Perform any teardown work that should be done in a non unsafe context after calling the extern C ffi function #}
{% macro rust_napi_to_ffi_args_teardown(ffi_func) %}
    {%- for arg in ffi_func.arguments() -%}
        {%- if matches!(arg.type_().borrow(), FfiType::RustBuffer(_)) -%}
            // rust_buffer_{{ arg.name() | rust_var_name }}.destroy();
        {% endif %}
    {%- endfor -%}
{%- endmacro %}

{# Determine the expression that should be returned from a given [napi] tagged function #}
{% macro rust_napi_to_ffi_return_expression(ffi_func) %}
    {%- match ffi_func.return_type() %}
    {%- when Some(FfiType::Int64) -%}
        convert_i64_to_bigint(return_value)
    {%- when Some(FfiType::Int64) | Some(FfiType::UInt64) | Some(FfiType::Handle) -%}
        convert_u64_to_bigint(return_value)
    {%- when Some(FfiType::RustBuffer(_)) -%}
        convert_rust_buffer_to_uint8array(return_value)
    {%- when Some(_) -%}
        return_value
    {%- else -%}
    {%- endmatch %}
{%- endmacro %}

{# When mapping from a struct's "napi representation" to "c representation", what should be on the RHS of each `field_a: self.field_a` expression? #}
{% macro rust_napi_to_ffi_struct_expression(field) %}
    {%- match field.type_().borrow() -%}
        {%- when FfiType::UInt64 | FfiType::Handle -%}
            self.{{ field.name() }}.get_u64().1
        {%- when FfiType::Int64 -%}
            self.{{ field.name() }}.get_i64().0
        {%- when FfiType::Struct(_) -%}
            self.{{ field.name() }}.to_c_struct()
        {%- when FfiType::RustBuffer(_) -%}
            {
                // FIXME: this is untested, check this to make sure it works once it gets generated
                // in final output
                let slice_u8 = self.{{ field.name() }}.as_ref();
                let vec_u8 = slice_u8.to_vec();
                RustBuffer::from_vec(vec_u8)
            }
        {%- when FfiType::RustCallStatus -%}
            decode_uintarray_to_rust_call_status(&self.{{ field.name() }})
        {%- else -%}
            self.{{ field.name() }} /* FIXME: add more field handlers here! */
    {%- endmatch -%}
{% endmacro %}

{#- ========== #}
{#- Record definitions: #}
{#- ========== #}

{#
{% for record_def in ci.record_definitions() %}
{%- if let Some(docstring) = record_def.docstring() -%}
    {%- for line in docstring.split("\n") -%}
/// {{line}}
{% endfor -%}
{%- endif -%}
#[napi(object)]
pub struct {{ record_def.name() | rust_fn_name }} {
{%- for field_def in record_def.fields() -%}
    {%- if let Some(docstring) = field_def.docstring() -%}
        {%- for line in docstring.split("\n") -%}
    /// {{line}}
    {% endfor -%}
    {%- endif -%}

    {%- let type_ = field_def.as_type() %}
    pub {{field_def.name() | rust_var_name}}: {{field_def | rust_type_name}}
    {%- if !loop.last %}, {% endif -%}
{%- endfor %}
}

{% endfor %}
#}

{#- ========== #}
{#- Enum definitions: #}
{#- ========== #}

{#
{% for enum_def in ci.enum_definitions() %}
{%- if let Some(docstring) = enum_def.docstring() -%}
    {%- for line in docstring.split("\n") -%}
/// {{line}}
{% endfor -%}
{%- endif -%}
#[napi]
pub enum {{ enum_def.name() | rust_fn_name }} {
{%- for variant in enum_def.variants() %}
    {% if let Some(docstring) = variant.docstring() -%}
        {%- for line in docstring.split("\n") -%}
    /// {{line}}
    {% endfor -%}
    {%- endif -%}

    {{variant.name() | rust_enum_variant_name-}}
    {%- if !variant.fields().is_empty() -%}
        { {%- for field_def in variant.fields() -%}
            {%- let type_ = field_def.as_type() %}
            pub {{field_def.name() | rust_var_name}}: {{field_def | rust_type_name}}
            {%- if !loop.last %}, {% endif -%}
        {%- endfor %} }
    {%- endif -%}
    {%- if !loop.last %}, {% endif -%}
{%- endfor %}
}

{% endfor %}
#}

{#- ========== #}
{#- NAPI <-> extern C definitions: #}
{#- ========== #}

{%- for definition in ci.ffi_definitions() %}
    {%- match definition %}

    {%- when FfiDefinition::CallbackFunction(callback) %}
    #[napi]
    pub fn {{ callback.name() | rust_ffi_callback_name }}(
    {%-   for arg in callback.arguments() %}
        {{ arg.name() }}: {{ arg.type_().borrow() | rust_ffi_napi_type_name }}{% if !loop.last %}, {% endif %}
    {%-   endfor %}
    )
    {%-   if callback.has_rust_call_status_arg() -%}
    {%      if callback.arguments().len() > 0 %}, {% endif %}rust_call_status: *mut RustCallStatus
    {%-   endif %}
    {%-   match callback.return_type() %}
    {%-     when Some(return_type) %} -> {{ return_type | rust_ffi_napi_type_name }}
    {%-     when None %}
    {%-   endmatch %} {
        {% call rust_napi_to_ffi_args_initialization(callback) %}

        {% if callback.return_type().is_some() %}let return_value = {% endif -%}
        unsafe {
            {{ci.crate_name()}}_ffi_sys::{{ callback.name() | rust_ffi_callback_name }}({% call rust_napi_to_ffi_arg_list(callback) %}
        {%- if callback.has_rust_call_status_arg() %}
        {%-   if !callback.arguments().is_empty() %}, {# space #}
        {%   endif %}rust_call_status
        {%- endif %}
            )
        };

        {% call rust_napi_to_ffi_args_teardown(callback) %}

        {% call rust_napi_to_ffi_return_expression(callback) %}
    }

    {%- when FfiDefinition::Function(func) %}
    #[napi]
    pub fn {{ func.name() }}(
        {%- for arg in func.arguments() %}
        {{ arg.name() }}: {{ arg.type_().borrow() | rust_ffi_napi_type_name }}
        {%-   if !loop.last %}, {# space #}
        {%-   endif %}
        {%- endfor %}
    )
    {%- match (func.has_rust_call_status_arg(), func.return_type()) %}
    {%- when (true, Some(return_type)) -%}
        {# space #} -> (/* RustCallStatus */ ::napi::bindgen_prelude::Uint8Array, {{ return_type.borrow() | rust_ffi_napi_type_name }})
    {%- when (_, Some(return_type)) -%}
        {# space #} -> {{ return_type.borrow() | rust_ffi_napi_type_name }}
    {%- when (true, _) -%}
        {# space #} -> /* RustCallStatus */ ::napi::bindgen_prelude::Uint8Array
    {%- else -%}
    {%- endmatch -%}
    {# space #} {
        {%- if func.has_rust_call_status_arg() %}
        let mut uniffi_call_status = RustCallStatus::default();
        {%- endif %}

        {% call rust_napi_to_ffi_args_initialization(func) %}

        {% if func.return_type().is_some() %}let return_value = {% endif -%}
        unsafe {
            {{ci.crate_name()}}_ffi_sys::{{ func.name() }}({% call rust_napi_to_ffi_arg_list(func) %}
            {%- if func.has_rust_call_status_arg() %}
            {%-   if !func.arguments().is_empty() %}, {# space #}
            {%-   endif -%}&mut uniffi_call_status
            {%- endif %})
        };

        {% call rust_napi_to_ffi_args_teardown(func) %}

        {%- if func.has_rust_call_status_arg() %}
        // Encode the uniffi call status value into a Uint8Array so it can be passed back into
        // javascript land over the napi bridge.
        let encoded_uniffi_call_status = encode_rust_call_status_to_uint8array(uniffi_call_status);
        {%- endif %}

        {# space #}
        {%- match (func.has_rust_call_status_arg(), func.return_type()) %}
        {%- when (true, Some(_)) -%}
            (encoded_uniffi_call_status, {% call rust_napi_to_ffi_return_expression(func) %})
        {%- when (false, Some(_)) -%}
            {% call rust_napi_to_ffi_return_expression(func) %}
        {%- when (true, None) -%}
            encoded_uniffi_call_status
        {%- else -%}
        {%- endmatch %}
    }

    {%- else %}
    {%- endmatch %}

{%- endfor %}



{% for definition in ci.ffi_definitions() %}
    {%- match definition %}
    {%- when FfiDefinition::Struct(ffi_struct) %}
    #[napi(object)]
    pub struct {{ffi_struct.name() | rust_ffi_napi_struct_name}} {
        {% for field in ffi_struct.fields() %}
            pub {{ field.name() }}: {{ field.type_().borrow() | rust_ffi_napi_type_name }}{% if !loop.last %}, {% endif %}
        {% endfor %}
    }

    impl {{ffi_struct.name() | rust_ffi_napi_struct_name}} {
        // FIXME: replace with from/into traits
        fn to_c_struct(&self) -> {{ci.crate_name()}}_ffi_sys::{{ ffi_struct.name() | rust_ffi_struct_name }} {
            {{ci.crate_name()}}_ffi_sys::{{ ffi_struct.name() | rust_ffi_struct_name }} {
                {% for field in ffi_struct.fields() -%}
                    {{ field.name() }}: {% call rust_napi_to_ffi_struct_expression(field) %}{% if !loop.last %}, {% endif %}
                {% endfor %}
            }
        }
        // // FIXME: replace with from/into traits
        // fn from_c_struct(value: {{ffi_struct.name() | rust_ffi_struct_name}}) -> Self {
        //     1
        // }
    }

    {%- else %}
    {%- endmatch %}

{%- endfor %}






{#- ========== #}
{#- FFI definitions: #}
{#- ========== #}

mod {{ci.crate_name()}}_ffi_sys {
    use uniffi::{RustBuffer, RustCallStatus, RustCallStatusCode, UniffiForeignPointerCell};
    use napi_derive::napi;

    {%- for definition in ci.ffi_definitions() %}
        {%- match definition %}
        {%- when FfiDefinition::Struct(ffi_struct) %}
        #[repr(C)]
        pub struct {{ffi_struct.name() | rust_ffi_struct_name}} {
            {% for field in ffi_struct.fields() %}
                pub {{ field.name() }}: {{ field.type_().borrow() | rust_ffi_type_name }}{% if !loop.last %}, {% endif %}
            {% endfor %}
        }

        {%- else %}
        {%- endmatch %}

    {%- endfor %}


    #[link(name = "/Users/ryan/w/livekit/rust-sdks/target/release/liblivekit_uniffi.dylib")]
    unsafe extern "C" {
    {%- for definition in ci.ffi_definitions() %}
        {%- match definition %}

        {%- when FfiDefinition::CallbackFunction(callback) %}
        pub fn {{ callback.name() | rust_ffi_callback_name }}(
        {%-   for arg in callback.arguments() %}
            {{ arg.name() }}: {{ arg.type_().borrow() | rust_ffi_type_name }}{% if !loop.last %}, {% endif %}
        {%-   endfor %}
        )
        {%-   if callback.has_rust_call_status_arg() -%}
        {%      if callback.arguments().len() > 0 %}, {% endif %}rust_call_status: &mut uniffi::RustCallStatus
        {%-   endif %}
        {%-   match callback.return_type() %}
        {%-     when Some(return_type) %} -> {{ return_type | rust_ffi_type_name }}
        {%-     when None %}
        {%-   endmatch %};

        {%- when FfiDefinition::Function(func) %}
        pub fn {{ func.name() }}(
            {%- for arg in func.arguments() %}
            {{ arg.name() }}: {{ arg.type_().borrow() | rust_ffi_type_name }}
            {%-   if !loop.last %}, {# space #}
            {%-   endif %}
            {%- endfor %}
            {%- if func.has_rust_call_status_arg() %}
            {%-   if !func.arguments().is_empty() %}, {# space #}
            {%   endif %}uniffi_call_status: *mut uniffi::RustCallStatus
            {%- endif %}
        )
        {%- if let Some(return_type) = func.return_type() -%}
            {# space #} -> {{ return_type.borrow() | rust_ffi_type_name }}
        {%- endif %};

        {%- else %}
        {%- endmatch %}

    {%- endfor %}
    }
}
