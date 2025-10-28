{%- import "macros.rs" as macros -%}

#![deny(clippy::all)]

use napi_derive::napi;
use uniffi::{RustBuffer, RustCallStatus, RustCallStatusCode, UniffiForeignPointerCell};

use {{ci.crate_name()}};


{% macro docstring(optional_docstring) %}
{%- if let Some(docstring) = optional_docstring -%}
    {%- for line in docstring.split("\n") -%}
/// {{line}}{%- if !loop.last %}
{% endif -%}
{%- endfor -%}
{%- endif -%}
{% endmacro %}

{% macro rust_napi_to_ffi_arg_list(ffi_func) %}
    {%- for arg in ffi_func.arguments() -%}
        {%- if matches!(arg.type_().borrow(), FfiType::UInt64 | FfiType::Handle) -%}
            {{ arg.name() | rust_var_name }}.get_u64().1
        {%- else if matches!(arg.type_().borrow(), FfiType::Int64) -%}
            {{ arg.name() | rust_var_name }}.get_i64().0
        {%- else -%}
            {{ arg.name() | rust_var_name }}
        {%- endif -%}
        {%- if !loop.last %}, {% endif -%}
    {%- endfor -%}
{%- endmacro %}


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
{#- Object definitions: #}
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
    {%-     when Some(return_type) %} -> {{ return_type | rust_ffi_type_name }}
    {%-     when None %}
    {%-   endmatch %} {
        unsafe {
            {{ci.crate_name()}}_ffi_sys::{{ callback.name() | rust_ffi_callback_name }}({% call rust_napi_to_ffi_arg_list(callback) %}
        {%- if callback.has_rust_call_status_arg() %}
        {%-   if !callback.arguments().is_empty() %}, {# space #}
        {%   endif %}rust_call_status
        {%- endif %}
            )
        }
    }

    {%- when FfiDefinition::Function(func) %}
    #[napi]
    pub fn {{ func.name() }}(
        {%- for arg in func.arguments() %}
        {{ arg.name() }}: {{ arg.type_().borrow() | rust_ffi_napi_type_name }}
        {%-   if !loop.last %}, {# space #}
        {%-   endif %}
        {%- endfor %}
        {%- if func.has_rust_call_status_arg() %}
        {%-   if !func.arguments().is_empty() %}, {# space #}
        {%   endif %}rust_call_status: RustCallStatus
        {%- endif %}
    )
    {%- if let Some(return_type) = func.return_type() -%}
        {# space #} -> {{ return_type.borrow() | rust_ffi_type_name }}
    {%- endif %} {
        unsafe {
            {{ci.crate_name()}}_ffi_sys::{{ func.name() }}({% call rust_napi_to_ffi_arg_list(func) %}
            {%- if func.has_rust_call_status_arg() %}
            {%-   if !func.arguments().is_empty() %}, {# space #}
            {%   endif %}rust_call_status
            {%- endif %})
        }
    }

    {%- else %}
    {%- endmatch %}

{%- endfor %}


{#- ========== #}
{#- FFI definitions: #}
{#- ========== #}

mod {{ci.crate_name()}}_ffi_sys {
    {%- for definition in ci.ffi_definitions() %}
        {%- match definition %}
        {%- when FfiDefinition::Struct(ffi_struct) %}
        #[repr(C)]
        pub struct {{ffi_struct.name() | rust_ffi_struct_name}} {
            {% for field in ffi_struct.fields() %}
                {{ field.name() }}: {{ field.type_().borrow() | rust_ffi_type_name }}
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
        {%      if callback.arguments().len() > 0 %}, {% endif %}rust_call_status: &mut RustCallStatus
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
            {%   endif %}uniffi_out_err: RustCallStatus
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
