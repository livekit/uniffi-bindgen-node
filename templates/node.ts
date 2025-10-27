{%- import "macros.rs" as macros -%}

{% macro docstring(optional_docstring) %}
    {%- if let Some(docstring) = optional_docstring -%}
/**
{%- for line in docstring.split("\n") %}
  * {{line}}
{%- endfor %}
  */
    {%- endif -%}
{% endmacro %}

{% macro param_list(func) %}
	{%- for arg in func.arguments() -%}
	    {%- let type_ = arg.as_type() -%}
	    {{ arg.name() | typescript_var_name }}: {{ arg | typescript_type_name }}
		{%- if !loop.last %}, {% endif -%}
	{%- endfor -%}
{%- endmacro %}

{% macro napi_call_arg_list(func_def) %}
	{%- for arg in func_def.arguments() -%}
	    {{ arg.name() | typescript_var_name }}
		{%- if !loop.last %}, {% endif -%}
	{%- endfor -%}
{%- endmacro %}




import * as _napiCore from "./tbd-path-to-napi-generated-js";



{#- ========== #}
{#- Record definitions: #}
{#- ========== #}

{% for record_def in ci.record_definitions() %}
{% call docstring(record_def.docstring()) %}
export type {{ record_def.name() | typescript_class_name }} = {
{%- for field_def in record_def.fields() -%}
    {% call docstring(field_def.docstring()) %}
    {%- let type_ = field_def.as_type() %}
    {{field_def.name() | typescript_var_name}}: {{field_def | typescript_type_name}};
{%- endfor %}
}

{% endfor %}

{#- ========== #}
{#- Enum definitions: #}
{#- ========== #}

{% for enum_def in ci.enum_definitions() %}
{% call docstring(enum_def.docstring()) %}
export type {{ enum_def.name() | typescript_class_name }} =
{%- for variant in enum_def.variants() %}
    {% call docstring(variant.docstring()) %}

    {%- if !variant.fields().is_empty() -%}
    | {
      variant: "{{variant.name() | typescript_var_name }}",
      values: {
        {%- for field_def in variant.fields() -%}
          {%- let type_ = field_def.as_type() %}
          {{field_def.name() | typescript_var_name}}: {{field_def | typescript_type_name}}
          {%- if !loop.last %}, {% endif -%}
        {%- endfor %}
      }
    }
    {%- else -%}
    | "{{variant.name() | typescript_var_name -}}"
    {%- endif -%}
{%- endfor %}

{% endfor %}

{#- ========== #}
{#- Object definitions: #}
{#- ========== #}


{#- ========== #}
{#- Function definitions: #}
{#- ========== #}

{% for func_def in ci.function_definitions() %}
{% call docstring(func_def.docstring()) %}
export {% if func_def.is_async() %}async {% endif %}function {{ func_def.name() | typescript_fn_name }}({% call param_list(func_def) %}){%- if let Some(ret_type) = func_def.return_type() %}: {{ ret_type | typescript_type_name }} {%- endif %} {
    return _napiCore.{{func_def.name() | typescript_fn_name}}({% call napi_call_arg_list(func_def) %});
}

{% endfor %}
