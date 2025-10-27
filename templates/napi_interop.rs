{%- import "macros.rs" as macros -%}

#![deny(clippy::all)]

use napi_derive::napi;

{% for func_def in ci.function_definitions() %}
{%- if let Some(docstring) = func_def.docstring() -%}
    {%- for line in docstring.split("\n") -%}
/// {{line}}
{% endfor -%}
{%- endif -%}
#[napi]
{% if func_def.is_async() %}async {% endif %}fn {{ func_def.name() | rust_fn_name }}({% call macros::rust_param_list(func_def) %}){%- if let Some(ret_type) = func_def.return_type() %} -> {{ ret_type | rust_type_name }} {%- endif %} {
    {{func_def.ffi_func().name()}}({% call macros::rust_ffi_arg_list(func_def.ffi_func()) %})
}

{% endfor %}
