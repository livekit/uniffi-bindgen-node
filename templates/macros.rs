{% macro rust_param_list(func) %}
	{%- for arg in func.arguments() -%}
	    {%- let type_ = arg.as_type() -%}
	    {{ arg.name() | rust_var_name }}: {{ arg | rust_type_name }}
		{%- if !loop.last %}, {% endif -%}
	{%- endfor -%}
{%- endmacro %}

{% macro rust_ffi_arg_list(ffi_func) %}
	{%- for arg in ffi_func.arguments() -%}
	    {{ arg.name() | rust_var_name }}
		{%- if !loop.last %}, {% endif -%}
	{%- endfor -%}
{%- endmacro %}
